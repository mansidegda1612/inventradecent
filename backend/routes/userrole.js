const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

router.use(auth);

// GET /api/userroles
router.get("/userroles/", async (req, res) => {
 // #swagger.tags = ['User Roles']
  try {
    const [rows] = await pool.query("SELECT * FROM userrole ORDER BY role ASC");
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/userroles/:id
router.get("/userroles/:id", async (req, res) => {
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
router.post("/userroles/", async (req, res) => {
 // #swagger.tags = ['User Roles']
  const { role, rights } = req.body;
  if (!role) return res.status(400).json({ success: false, message: "role is required" });
  try {
    const [r] = await pool.query("INSERT INTO userrole (role, rights) VALUES (?,?)", [role, rights||null]);
    res.status(201).json({ success: true, message: "Role created", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/userroles/:id
router.put("/userroles/:id", async (req, res) => {
 // #swagger.tags = ['User Roles']
  const { role, rights } = req.body;
  if (!role) return res.status(400).json({ success: false, message: "role is required" });
  try {
    const [r] = await pool.query("UPDATE userrole SET role=?, rights=? WHERE id=?", [role, rights||null, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Role not found" });
    res.json({ success: true, message: "Role updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/userroles/:id
router.delete("/userroles/:id", async (req, res) => {
 // #swagger.tags = ['User Roles']
  try {
    const [r] = await pool.query("DELETE FROM userrole WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Role not found" });
    res.json({ success: true, message: "Role deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
