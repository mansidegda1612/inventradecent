// Shared by middleware/requireActiveSubscription.js (enforcement) and
// routes/auth.js (so the frontend can show a trial countdown / upgrade
// banner) — one place computes "effective" status so the two never drift.
function computeEffectiveStatus(sub) {
  if (!sub) return "expired"; // no subscription row at all — treat as expired
  const now = new Date();
  if (sub.status === "trialing") {
    return new Date(sub.trial_ends_at) < now ? "expired" : "trialing";
  }
  if (sub.status === "active") {
    return sub.current_period_end && new Date(sub.current_period_end) < now ? "past_due" : "active";
  }
  return sub.status; // 'past_due' | 'canceled' | 'expired' — already stored as-is
}

module.exports = { computeEffectiveStatus };
