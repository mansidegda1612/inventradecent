
const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");
const loadContext = require("../middleware/loadContext");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");

// NOTE: these list/detail routes used to be public (no `auth`) — fine for a
// single-tenant app, but in a multi-tenant one an unauthenticated request has
// no org to scope by, so "public" would mean "every tenant's categories."
// Locked the whole router behind auth + loadContext.
router.use(auth, loadContext, requireActiveSubscription);

// GET /api/categories  — list all (used in product dropdowns)
router.get("/categories/", async (req, res) => {
 // #swagger.tags = ['Categories']
  try {
    const [rows] = await pool.query("SELECT * FROM category WHERE org_id=? ORDER BY name ASC", [req.ctx.orgId]);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/categories/:id
router.get("/categories/:id", async (req, res) => {
 // #swagger.tags = ['Categories']
  try {
    const [rows] = await pool.query("SELECT * FROM category WHERE id=? AND org_id=?", [req.params.id, req.ctx.orgId]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/categories
router.post("/categories/", async (req, res) => {
 // #swagger.tags = ['Categories']
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [ex] = await pool.query("SELECT id FROM category WHERE name=? AND org_id=?", [name, req.ctx.orgId]);
    if (ex.length) return res.status(409).json({ success: false, message: "Category already exists" });

    const [r] = await pool.query("INSERT INTO category (name, org_id) VALUES (?,?)", [name, req.ctx.orgId]);
    res.status(201).json({ success: true, message: "Category created", data: { id: r.insertId, name } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/categories/:id
router.put("/categories/:id", async (req, res) => {
 // #swagger.tags = ['Categories']
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [r] = await pool.query("UPDATE category SET name=? WHERE id=? AND org_id=?", [name, req.params.id, req.ctx.orgId]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, message: "Category updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/categories/:id
router.delete("/categories/:id", async (req, res) => {
 // #swagger.tags = ['Categories']
  try {
    const [r] = await pool.query("DELETE FROM category WHERE id=? AND org_id=?", [req.params.id, req.ctx.orgId]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, message: "Category deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
