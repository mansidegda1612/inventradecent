// One place that answers "can this user use the app right now, and if not,
// what exactly are they allowed to do?" — used by routes/auth.js (to decide
// whether a login is allowed at all) and middleware/requireActiveSubscription.js
// (to decide whether a request is allowed), so the two can't drift apart.
//
// The policy once a trial or paid period has lapsed:
//
//   * account owner  → can still sign in, but the app is locked to
//                      Plans & Billing so they can pay their way back in.
//   * everyone else  → blocked at the door (403 SUBSCRIPTION_EXPIRED). Staff
//                      can't do anything useful while the account is lapsed,
//                      and the owner is the one who has to act.
//   * platform admin → not a tenant; never gated here.
//
// Status is still computed lazily off trial_ends_at / current_period_end
// (computeEffectiveStatus) — nothing flips subscription.status on a schedule.
const pool = require("../config/db");
const { computeEffectiveStatus, hasFullAccess } = require("./subscriptionStatus");

function parseFeatures(val) {
  if (!val) return {};
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return {}; }
}

// account.owner_email is the paying contact. Both signup (routes/auth.js) and
// manual onboarding (routes/platform.js) set user.user_id AND user.email to
// that same address for the owner, so matching either is enough — and matching
// user_id means the JWT payload alone (which carries user_id, not email) is
// sufficient to identify the owner on a per-request check.
function matchesOwner(ownerEmail, { loginId, email }) {
  if (!ownerEmail) return false;
  const owner = String(ownerEmail).trim().toLowerCase();
  return [loginId, email]
    .filter(Boolean)
    .some(v => String(v).trim().toLowerCase() === owner);
}

/**
 * @param {object}  identity
 * @param {number}  identity.accountId - user.account_id / req.user.aid
 * @param {string} [identity.loginId]  - user.user_id (present on the JWT)
 * @param {string} [identity.email]    - user.email (only on DB-loaded rows)
 * @returns {Promise<{status: string, isOwner: boolean, locked: boolean, plan: object|null}>}
 *   locked = the account has lapsed. Combine with isOwner to decide between
 *   "billing-only" and "shut out".
 */
async function loadAccessContext({ accountId, loginId, email }) {
  const [rows] = await pool.query(
    `SELECT a.owner_email, a.status AS account_status,
            s.id AS subscription_id, s.status, s.trial_ends_at, s.current_period_end,
            s.plan_id, p.code AS plan_code, p.name AS plan_name,
            p.max_orgs, p.max_users, p.features
       FROM account a
       LEFT JOIN subscription s ON s.account_id = a.id
       LEFT JOIN plan p         ON p.id = s.plan_id
      WHERE a.id = ?`,
    [accountId]
  );
  const row = rows[0] || null;

  // No account row at all means the tenancy backfill never reached this user —
  // a data problem, not a billing one. Locking them out would turn a broken
  // row into a support ticket that looks like a payment failure, so treat it
  // as unrestricted-but-unknown and let the tenant queries (which scope on a
  // null account_id) fail visibly instead.
  if (!row) {
    return {
      status: "unknown", isOwner: false, locked: false, plan: null,
      trialEndsAt: null, currentPeriodEnd: null,
    };
  }

  const status = computeEffectiveStatus(row.subscription_id ? row : null);
  const isOwner = matchesOwner(row.owner_email, { loginId, email });

  return {
    status,
    isOwner,
    // Raw dates so routes/auth.js can build the frontend's `subscription`
    // payload (trial countdown / "expiring in N days" pill) off this same
    // query instead of loading the subscription row a second time.
    trialEndsAt: row.trial_ends_at || null,
    currentPeriodEnd: row.current_period_end || null,
    // A suspended/deleted account is locked regardless of what its
    // subscription dates say — that's the platform owner's kill switch.
    locked: !hasFullAccess(status) || row.account_status !== "active",
    // null when no real plan is attached yet (trial/comped) — unrestricted,
    // the convention req.ctx.plan and the session payload both follow.
    plan: row.plan_id
      ? {
          code: row.plan_code, name: row.plan_name,
          maxOrgs: row.max_orgs, maxUsers: row.max_users,
          features: parseFeatures(row.features),
        }
      : null,
  };
}

// The 403 body every blocked-at-the-door path returns. `code` is what the
// frontend keys off (callserver.js) to clear the session and show the reason
// on the login screen, rather than silently reloading into a blank form.
function subscriptionExpiredResponse(status) {
  return {
    success: false,
    code: "SUBSCRIPTION_EXPIRED",
    message:
      "Your organization's InventraDecent subscription has ended, so access is paused. " +
      "Ask your account owner to renew from Plans & Billing to restore access.",
    data: { subscriptionStatus: status },
  };
}

module.exports = { loadAccessContext, subscriptionExpiredResponse };
