/**
 * middleware/requireRight.js
 *
 * Use after AuthMiddleware on any route that mutates data or exposes
 * admin-only screens:
 *
 *   router.post("/accounts", auth, requireRight("accounts.create"), handler);
 *
 * Pass multiple keys to allow ANY of them:
 *
 *   requireRight("reports.account", "reports.financial")
 *
 * req.user.rights is populated by the JWT (see routes/auth.js — the token
 * payload carries the effective rights, already resolved from permission ids
 * to perm_key strings at login time). "*" grants everything (admin role).
 */

// Bare boolean check — for routes that can't use requireRight as middleware
// because the required right depends on the request body (e.g. transaction.js,
// where the permission differs by trans_type: SI->sale, PI->purchase, ...).
function hasRight(req, ...keys) {
  const rights = req.user?.rights || [];
  if (rights.includes("*")) return true;
  return keys.some((k) => rights.includes(k));
}

function requireRight(...required) {
  return (req, res, next) => {
    if (required.length === 0 || hasRight(req, ...required)) return next();
    return res.status(403).json({
      success: false,
      message: "You do not have permission to perform this action",
    });
  };
}

module.exports = requireRight;
module.exports.hasRight = hasRight;
