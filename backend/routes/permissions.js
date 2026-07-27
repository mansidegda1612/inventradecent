const router = require("express").Router();
const auth = require("../middleware/AuthMiddleware");
const { getCatalog } = require("../utils/permissionCatalog");

// GET /api/permissions
// Canonical permission catalog, now sourced from the `permission` DB table
// (was a static file) and grouped by module for the rights editor UI. Any
// logged-in user can read it — it's metadata about what permissions *exist*,
// not a check of what the caller *has*. Each action carries its `id` (what
// userrole.rights / user.rights store) plus its stable `key`.
router.get("/permissions", auth, async (req, res) => {
  // #swagger.tags = ['Permissions']
  try {
    const { rows } = await getCatalog();
    const byModule = new Map();
    for (const r of rows) {
      if (!byModule.has(r.module)) {
        byModule.set(r.module, { module: r.module, label: r.module_label, actions: [] });
      }
      byModule.get(r.module).actions.push({ id: r.id, key: r.perm_key, label: r.action_label });
    }
    res.json({ success: true, data: Array.from(byModule.values()) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
