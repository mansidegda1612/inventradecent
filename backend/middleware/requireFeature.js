// Gate a route behind a plan feature flag (e.g. "whatsapp"). Must run after
// requireActiveSubscription, which populates req.ctx.plan. No plan chosen
// yet (trial / comped account) means unrestricted access — see the note in
// requireActiveSubscription.js.
function hasFeature(req, key) {
  if (!req.ctx?.plan) return true;
  return !!req.ctx.plan.features?.[key];
}

function requireFeature(key) {
  return (req, res, next) => {
    if (hasFeature(req, key)) return next();
    return res.status(402).json({
      success: false,
      code: "UPGRADE_REQUIRED",
      feature: key,
      message: `Your plan doesn't include ${key}. Upgrade to unlock it.`,
    });
  };
}

module.exports = { hasFeature, requireFeature };
