// Sits after `auth` on every route that touches business data. Reads the
// account/org/role straight off the verified JWT (req.user, set by
// AuthMiddleware) and puts them on req.ctx — the ONLY thing route handlers
// should ever scope a business-table query by. Never trust an org_id taken
// from req.body/req.query for this purpose; a client could set it to any
// value and read another tenant's data.
module.exports = function loadContext(req, res, next) {
  if (!req.user || req.user.oid == null) {
    return res.status(403).json({ success: false, message: "No active organization on this session" });
  }
  req.ctx = {
    userId: req.user.id,
    accountId: req.user.aid,
    orgId: req.user.oid,
    role: req.user.role,
  };
  next();
};
