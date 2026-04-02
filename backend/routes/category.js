
const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

// GET /api/categories  — list all (public, used in product dropdowns)
router.get("/categories/", async (req, res) => {
 // #swagger.tags = ['Categories']
  try {
    const [rows] = await pool.query("SELECT * FROM category ORDER BY name ASC");
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/categories/:id
router.get("/categories/:id", async (req, res) => {
 // #swagger.tags = ['Categories']
  try {
    const [rows] = await pool.query("SELECT * FROM category WHERE id=?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/categories
router.post("/categories/", auth, async (req, res) => {
 // #swagger.tags = ['Categories']
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [ex] = await pool.query("SELECT id FROM category WHERE name=?", [name]);
    if (ex.length) return res.status(409).json({ success: false, message: "Category already exists" });

    const [r] = await pool.query("INSERT INTO category (name) VALUES (?)", [name]);
    res.status(201).json({ success: true, message: "Category created", data: { id: r.insertId, name } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/categories/:id
router.put("/categories/:id", auth, async (req, res) => {
 // #swagger.tags = ['Categories']
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [r] = await pool.query("UPDATE category SET name=? WHERE id=?", [name, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, message: "Category updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/categories/:id
router.delete("/categories/:id", auth, async (req, res) => {
 // #swagger.tags = ['Categories']
  try {
    const [r] = await pool.query("DELETE FROM category WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, message: "Category deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
