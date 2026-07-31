// Shared by middleware/requireActiveSubscription.js (enforcement) and
// routes/auth.js (so the frontend can show a trial countdown / upgrade
// banner) — one place computes "effective" status so the two never drift.

// config/db.js's typeCast hands DATETIME columns back as raw strings
// ("2027-07-24 23:59:59"), which is not ISO-8601 — parsing it is
// implementation-defined. Swap in the T so new Date() reads a shape it's
// actually specified to handle. Same fix as humanDate() in routes/platform.js.
function parseDbDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function computeEffectiveStatus(sub) {
  if (!sub) return "expired"; // no subscription row at all — treat as expired
  const now = new Date();
  if (sub.status === "trialing") {
    return parseDbDate(sub.trial_ends_at) < now ? "expired" : "trialing";
  }
  if (sub.status === "active") {
    return sub.current_period_end && parseDbDate(sub.current_period_end) < now ? "past_due" : "active";
  }
  return sub.status; // 'past_due' | 'canceled' | 'expired' — already stored as-is
}

// A subscription is "blocked" once its trial or paid period has lapsed: no
// login for staff, billing-only for the account owner (see utils/accessGate.js).
const FULL_ACCESS_STATUSES = new Set(["active", "trialing"]);

function hasFullAccess(effectiveStatus) {
  return FULL_ACCESS_STATUSES.has(effectiveStatus);
}

module.exports = { computeEffectiveStatus, parseDbDate, hasFullAccess };
