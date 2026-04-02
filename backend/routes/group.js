const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

// GET /api/groups  — used in customer dropdowns
router.get("/groups/", async (req, res) => {
 // #swagger.tags = ['Groups']
  try {
    const [rows] = await pool.query("SELECT * FROM `group` ORDER BY name ASC");
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/groups/:id
router.get("/groups/:id", async (req, res) => {
 // #swagger.tags = ['Groups']
  try {
    const [rows] = await pool.query("SELECT * FROM `group` WHERE id=?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/groups
router.post("/groups/", auth, async (req, res) => {
 // #swagger.tags = ['Groups']
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [r] = await pool.query("INSERT INTO `group` (name) VALUES (?)", [name]);
    res.status(201).json({ success: true, message: "Group created", data: { id: r.insertId, name } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/groups/:id
router.put("/groups/:id", auth, async (req, res) => {
 // #swagger.tags = ['Groups']
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [r] = await pool.query("UPDATE `group` SET name=? WHERE id=?", [name, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true, message: "Group updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/groups/:id
router.delete("/groups/:id", auth, async (req, res) => {
 // #swagger.tags = ['Groups']
  try {
    const [r] = await pool.query("DELETE FROM `group` WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true, message: "Group deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
