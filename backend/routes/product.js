const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

// GET /api/products  — list with search, pagination, category filter (public)
router.get("/products/", async (req, res) => {
 // #swagger.tags = ['Products']
  const { page = 1, limit = 10, search = "", category = "" } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let where = "WHERE 1=1";
    const params = [];
    if (search) {
      where += " AND (p.name LIKE ? OR p.barcode LIKE ? OR p.hsn_code LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) { where += " AND p.category=?"; params.push(category); }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM product p ${where}`, params);
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name FROM product p LEFT JOIN category c ON p.category=c.id ${where} ORDER BY p.name ASC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true, data: rows,
      pagination: { total: countRows[0].total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(countRows[0].total / parseInt(limit)) },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/products/dropdown  — id+name+rates for billing screen
router.get("/products/dropdown", async (req, res) => {
 // #swagger.tags = ['Products']
  try {
    const [rows] = await pool.query(
      "SELECT id, name, sale_rate, purc_rate, hsn_code, barcode, c_qty FROM product ORDER BY name ASC"
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/products/barcode/:barcode  — scan barcode to fetch product
router.get("/products/barcode/:barcode", async (req, res) => {
 // #swagger.tags = ['Products']
  try {
    const [rows] = await pool.query("SELECT * FROM product WHERE barcode=?", [req.params.barcode]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/products/low-stock  — products where c_qty <= threshold (default 5)
router.get("/products/low-stock", auth, async (req, res) => {
 // #swagger.tags = ['Products']
  const threshold = parseInt(req.query.threshold) || 5;
  try {
    const [rows] = await pool.query("SELECT * FROM product WHERE c_qty <= ? ORDER BY c_qty ASC", [threshold]);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/products/:id
router.get("/products/:id", async (req, res) => {
 // #swagger.tags = ['Products']
  try {
    const [rows] = await pool.query(
      "SELECT p.*, c.name AS category_name FROM product p LEFT JOIN category c ON p.category=c.id WHERE p.id=?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/products
router.post("/products/", auth, async (req, res) => {
 // #swagger.tags = ['Products']
  const { name, category, purc_rate, sale_rate, hsn_code, barcode, o_qty } = req.body;
  if (!name || !purc_rate || !sale_rate)
    return res.status(400).json({ success: false, message: "name, purc_rate and sale_rate required" });
  try {
    if (barcode) {
      const [ex] = await pool.query("SELECT id FROM product WHERE barcode=?", [barcode]);
      if (ex.length) return res.status(409).json({ success: false, message: "Barcode already exists" });
    }
    const qty = o_qty || 0;
    const [r] = await pool.query(
      "INSERT INTO product (name,category,purc_rate,sale_rate,hsn_code,barcode,o_qty,p_qty,s_qty,c_qty) VALUES (?,?,?,?,?,?,?,0,0,?)",
      [name, category||null, purc_rate, sale_rate, hsn_code||null, barcode||null, qty, qty]
    );
    res.status(201).json({ success: true, message: "Product created", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/products/:id
router.put("/products/:id", auth, async (req, res) => {
 // #swagger.tags = ['Products']
  const { name, category, purc_rate, sale_rate, hsn_code, barcode, o_qty, p_qty, s_qty, c_qty } = req.body;
  if (!name || !purc_rate || !sale_rate)
    return res.status(400).json({ success: false, message: "name, purc_rate and sale_rate required" });
  try {
    if (barcode) {
      const [ex] = await pool.query("SELECT id FROM product WHERE barcode=? AND id!=?", [barcode, req.params.id]);
      if (ex.length) return res.status(409).json({ success: false, message: "Barcode used by another product" });
    }
    const [r] = await pool.query(
      "UPDATE product SET name=?,category=?,purc_rate=?,sale_rate=?,hsn_code=?,barcode=?,o_qty=?,p_qty=?,s_qty=?,c_qty=? WHERE id=?",
      [name, category||null, purc_rate, sale_rate, hsn_code||null, barcode||null, o_qty||0, p_qty||0, s_qty||0, c_qty||0, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, message: "Product updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PATCH /api/products/:id  — partial update (e.g. just stock qty)
router.patch("/products/:id", auth, async (req, res) => {
 // #swagger.tags = ['Products']
  const allowed = ["name","category","purc_rate","sale_rate","hsn_code","barcode","o_qty","p_qty","s_qty","c_qty"];
  const updates = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ success: false, message: "No valid fields" });
  try {
    const vals = updates.map(k => req.body[k]);
    vals.push(req.params.id);
    await pool.query(`UPDATE product SET ${updates.map(k=>`${k}=?`).join(",")} WHERE id=?`, vals);
    res.json({ success: true, message: "Product updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/products/:id
router.delete("/products/:id", auth, async (req, res) => {
 // #swagger.tags = ['Products']
  try {
    const [r] = await pool.query("DELETE FROM product WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, message: "Product deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
