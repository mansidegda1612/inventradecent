// Gate for /api/platform/* — the SaaS owner's console.
//
// Sits after `auth`, and NOT alongside loadContext or
// requireActiveSubscription: a platform admin has no account and no org, so
// loadContext (which needs req.user.oid) would reject every request.
//
// The token's `padmin` claim isn't trusted on its own — access tokens live for
// a day, so the flag is re-read from the database on every request. Revoking
// is_platform_admin (or is_active) locks the console immediately instead of
// whenever the last issued token happens to expire.
//
// Non-admins get 404, not 403, so the console's endpoints are indistinguishable
// from routes that don't exist.
const pool = require("../config/db");

module.exports = async function requirePlatformAdmin(req, res, next) {
  const notFound = () => res.status(404).json({ success: false, message: "Route not found" });

  if (!req.user?.padmin) return notFound();

  try {
    const [[row]] = await pool.query(
      "SELECT is_platform_admin, is_active FROM user WHERE id = ?",
      [req.user.id]
    );
    if (!row || !row.is_platform_admin || !row.is_active) return notFound();
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
