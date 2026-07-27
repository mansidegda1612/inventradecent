const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");
const requireRight = require("../middleware/requireRight");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");

router.use(auth, requireActiveSubscription);

// Roles are per-tenant: account_id IS NULL are shared system roles
// (seeded "admin"/"guest") visible to everyone but editable by no tenant;
// account_id = the tenant's id are that tenant's own custom roles. Every
// query below is scoped so one account can never see or touch another's
// roles. `is_system` lets the UI hide edit/delete on the shared ones.

// GET /api/userroles
router.get("/userroles/", requireRight("roles.view"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  try {
    const [rows] = await pool.query(
      `SELECT id, role, rights, account_id, (account_id IS NULL) AS is_system
       FROM userrole
       WHERE account_id = ? OR account_id IS NULL
       ORDER BY (account_id IS NULL) DESC, role ASC`,
      [req.user.aid]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/userroles/:id
router.get("/userroles/:id", requireRight("roles.view"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  try {
    const [rows] = await pool.query(
      `SELECT id, role, rights, account_id, (account_id IS NULL) AS is_system
       FROM userrole WHERE id=? AND (account_id = ? OR account_id IS NULL)`,
      [req.params.id, req.user.aid]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Role not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/userroles — always creates a role owned by the caller's account
router.post("/userroles/", requireRight("roles.create"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  const { role, rights } = req.body;
  if (!role) return res.status(400).json({ success: false, message: "role is required" });
  try {
    const [r] = await pool.query(
      "INSERT INTO userrole (role, rights, account_id) VALUES (?,?,?)",
      [role, rights && rights.length ? JSON.stringify(rights) : null, req.user.aid]
    );
    res.status(201).json({ success: true, message: "Role created", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/userroles/:id — only the tenant's own roles (system roles have
// account_id NULL and won't match, so they're read-only to tenants)
router.put("/userroles/:id", requireRight("roles.edit"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  const { role, rights } = req.body;
  if (!role) return res.status(400).json({ success: false, message: "role is required" });
  try {
    const [r] = await pool.query(
      "UPDATE userrole SET role=?, rights=? WHERE id=? AND account_id=?",
      [role, rights && rights.length ? JSON.stringify(rights) : null, req.params.id, req.user.aid]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Role not found or not editable" });
    res.json({ success: true, message: "Role updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/userroles/:id — own roles only; blocked if any user still uses it
router.delete("/userroles/:id", requireRight("roles.delete"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  try {
    const [[{ cnt }]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM user WHERE userrole=? AND account_id=?",
      [req.params.id, req.user.aid]
    );
    if (cnt > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete — ${cnt} user(s) are still assigned to this role`,
      });
    }
    const [r] = await pool.query("DELETE FROM userrole WHERE id=? AND account_id=?", [req.params.id, req.user.aid]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Role not found or not deletable" });
    res.json({ success: true, message: "Role deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
