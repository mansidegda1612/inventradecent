// Sits after `auth` (loadContext is optional — this reads req.user.aid
// directly, straight off the verified token, so it works whether or not
// loadContext also ran on a given router). Loads the account's subscription
// once per request and computes its effective status lazily — no cron job
// needed to flip statuses on a schedule.
//
// Enforcement is a read-only grace period, not a hard block: once a trial
// or subscription has lapsed, GET requests still work (existing data stays
// visible) but anything that mutates data is rejected with a distinct
// UPGRADE_REQUIRED code until the account pays.
//
// Platform admins (is_platform_admin = 1) bypass this entirely — they're
// managing the platform, not operating as a tenant.
const pool = require("../config/db");
const { computeEffectiveStatus } = require("../utils/subscriptionStatus");

function parseFeatures(val) {
  if (!val) return {};
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return {}; }
}

module.exports = async function requireActiveSubscription(req, res, next) {
  // Always ensure req.ctx exists so requireFeature/limit checks can rely on
  // it downstream even on routers that don't also run loadContext.
  if (!req.ctx) req.ctx = {};

  if (req.user?.padmin) {
    // A console session carries no account (aid is null), so there are no books
    // for it to operate on. Reject loudly instead of letting tenant queries run
    // against account_id = NULL — those return nothing, which reads like the
    // customer's data vanished. The console uses /api/platform/* instead.
    //
    // The bypass below still applies to a padmin token that *does* carry an aid,
    // which is what a future impersonation flow would issue.
    if (req.user.aid == null) {
      return res.status(403).json({
        success: false,
        code: "PLATFORM_ADMIN_SESSION",
        message: "Platform admin session — use the platform console.",
      });
    }
    req.ctx.plan = null; // unrestricted
    return next();
  }

  try {
    const [rows] = await pool.query(
      `SELECT s.*, p.code AS plan_code, p.name AS plan_name,
              p.max_orgs, p.max_users, p.features
       FROM subscription s
       LEFT JOIN plan p ON p.id = s.plan_id
       WHERE s.account_id = ?`,
      [req.user.aid]
    );
    const sub = rows[0] || null;
    const effectiveStatus = computeEffectiveStatus(sub);
    req.ctx.subscriptionStatus = effectiveStatus;

    // No real plan chosen yet (trialing, or a comped account like the
    // migration-backfilled Account #1) gets full access — no feature/seat
    // limits — so a prospect can fully evaluate the product, and existing
    // single-tenant accounts aren't suddenly capped by a plan they never
    // picked. Limits only kick in once a real paid plan is attached.
    req.ctx.plan = sub?.plan_id
      ? {
          code: sub.plan_code, name: sub.plan_name,
          maxOrgs: sub.max_orgs, maxUsers: sub.max_users,
          features: parseFeatures(sub.features),
        }
      : null;

    const hasFullAccess = effectiveStatus === "active" || effectiveStatus === "trialing";
    if (!hasFullAccess && req.method !== "GET") {
      return res.status(402).json({
        success: false,
        code: "UPGRADE_REQUIRED",
        message: "Your trial or subscription has ended. Upgrade to keep making changes — your existing data is still visible.",
        data: { subscriptionStatus: effectiveStatus },
      });
    }

    next();
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
