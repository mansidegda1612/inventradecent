const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");
const requireRight = require("../middleware/requireRight");

router.use(auth);

// GET /api/userroles
router.get("/userroles/", requireRight("roles.view"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  try {
    const [rows] = await pool.query("SELECT * FROM userrole ORDER BY role ASC");
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/userroles/:id
router.get("/userroles/:id", requireRight("roles.view"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  try {
    const [rows] = await pool.query("SELECT * FROM userrole WHERE id=?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Role not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/userroles
router.post("/userroles/", requireRight("roles.create"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  const { role, rights } = req.body;
  if (!role) return res.status(400).json({ success: false, message: "role is required" });
  try {
    const [r] = await pool.query(
      "INSERT INTO userrole (role, rights) VALUES (?,?)",
      [role, rights && rights.length ? JSON.stringify(rights) : null]
    );
    res.status(201).json({ success: true, message: "Role created", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/userroles/:id
router.put("/userroles/:id", requireRight("roles.edit"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  const { role, rights } = req.body;
  if (!role) return res.status(400).json({ success: false, message: "role is required" });
  try {
    const [r] = await pool.query(
      "UPDATE userrole SET role=?, rights=? WHERE id=?",
      [role, rights && rights.length ? JSON.stringify(rights) : null, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Role not found" });
    res.json({ success: true, message: "Role updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/userroles/:id — blocked if any user is still assigned to it
router.delete("/userroles/:id", requireRight("roles.delete"), async (req, res) => {
  // #swagger.tags = ['User Roles']
  try {
    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM user WHERE userrole=?", [req.params.id]);
    if (cnt > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete — ${cnt} user(s) are still assigned to this role`,
      });
    }
    const [r] = await pool.query("DELETE FROM userrole WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Role not found" });
    res.json({ success: true, message: "Role deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
