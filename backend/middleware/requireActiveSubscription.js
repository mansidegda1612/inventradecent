// Sits after `auth` (loadContext is optional — this reads req.user.aid
// directly, straight off the verified token, so it works whether or not
// loadContext also ran on a given router). Loads the account's access context
// once per request and computes its effective status lazily — no cron job
// needed to flip statuses on a schedule.
//
// Enforcement once a trial or subscription has lapsed is a hard block, not a
// read-only grace period — reads included, since a lapsed account's data is
// exactly what the renewal is for:
//
//   * staff       → 403 SUBSCRIPTION_EXPIRED. They're also refused a session
//                   outright by routes/auth.js, so this only catches a token
//                   minted moments before the lapse.
//   * the owner   → 402 UPGRADE_REQUIRED on every tenant route. routes/billing.js
//                   is deliberately NOT behind this middleware, so Plans &
//                   Billing (and therefore paying) still works, which is all
//                   the frontend renders for them (see App.jsx's lock screen).
//
// Platform admins (is_platform_admin = 1) bypass this entirely — they're
// managing the platform, not operating as a tenant.
const { loadAccessContext, subscriptionExpiredResponse } = require("../utils/accessGate");

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
    const gate = await loadAccessContext({
      accountId: req.user.aid,
      loginId: req.user.user_id,
    });

    req.ctx.subscriptionStatus = gate.status;
    // No real plan chosen yet (trialing, or a comped account like the
    // migration-backfilled Account #1) gets full access — no feature/seat
    // limits — so a prospect can fully evaluate the product, and existing
    // single-tenant accounts aren't suddenly capped by a plan they never
    // picked. Limits only kick in once a real paid plan is attached.
    req.ctx.plan = gate.plan;
    req.ctx.isAccountOwner = gate.isOwner;

    if (gate.locked) {
      if (!gate.isOwner)
        return res.status(403).json(subscriptionExpiredResponse(gate.status));

      return res.status(402).json({
        success: false,
        code: "UPGRADE_REQUIRED",
        message: "Your trial or subscription has ended. Renew from Plans & Billing to unlock your data — nothing has been deleted.",
        data: { subscriptionStatus: gate.status },
      });
    }

    next();
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
