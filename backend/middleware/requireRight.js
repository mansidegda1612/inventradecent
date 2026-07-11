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
 * payload carries the effective rights computed at login time). "*" grants
 * everything, used by the seeded Admin role.
 */
module.exports = function requireRight(...required) {
  return (req, res, next) => {
    const rights = req.user?.rights || [];

    if (rights.includes("*")) return next();

    const ok = required.length === 0 || required.some(r => rights.includes(r));
    if (!ok) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
};
