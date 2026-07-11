const router = require("express").Router();
const auth = require("../middleware/AuthMiddleware");
const PERMISSIONS = require("../config/permissions");

// GET /api/permissions
// Returns the canonical permission list (config/permissions.js) so the
// frontend never has to keep its own copy in sync by hand. Any logged-in
// user can read this — it's metadata about what permissions *exist*, not
// a check of what the caller *has*. requireRight isn't used here on
// purpose: even a low-rights user needs this list to render, say, a
// read-only view of their own role's permissions.
router.get("/permissions", auth, (req, res) => {
  // #swagger.tags = ['Permissions']
  res.json({ success: true, data: PERMISSIONS });
});

module.exports = router;
