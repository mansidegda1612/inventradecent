const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

router.use(auth);

// GET /api/customers  — with search, pagination, group filter
router.get("/customers/", async (req, res) => {
 // #swagger.tags = ['Customers']
  const { page = 1, limit = 10, search = "", group = "" } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let where = "WHERE 1=1";
    const params = [];

    if (search) {
      where += " AND (c.name LIKE ? OR c.contact_no LIKE ? OR c.city LIKE ? OR c.gstin LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (group) { where += " AND c.group=?"; params.push(group); }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM customer c ${where}`, params);
    const [rows] = await pool.query(
      `SELECT c.*, g.name AS group_name FROM customer c LEFT JOIN \`group\` g ON c.group=g.id ${where} ORDER BY c.name ASC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total: countRows[0].total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(countRows[0].total / parseInt(limit)) },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/customers/dropdown  — id+name only for bill dropdowns
router.get("/customers/dropdown", async (req, res) => {
 // #swagger.tags = ['Customers']
  try {
    const [rows] = await pool.query("SELECT id, name, contact_no, gstin FROM customer ORDER BY name ASC");
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/customers/:id  — single customer with ledger summary
router.get("/customers/:id", async (req, res) => {
 // #swagger.tags = ['Customers']
  try {
    const [rows] = await pool.query(
      "SELECT c.*, g.name AS group_name FROM customer c LEFT JOIN `group` g ON c.group=g.id WHERE c.id=?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Customer not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/customers/:id/ledger  — full transaction history for a customer
router.get("/customers/:id/ledger", async (req, res) => {
 // #swagger.tags = ['Customers']
  const { from, to } = req.query;
  try {
    let where = "WHERE t.customer_id=?";
    const params = [req.params.id];
    if (from) { where += " AND DATE(t.date)>=?"; params.push(from); }
    if (to)   { where += " AND DATE(t.date)<=?"; params.push(to); }

    const [rows] = await pool.query(
      `SELECT t.*, p.name AS product_name FROM transaction t
       LEFT JOIN product p ON t.product_id = p.id
       ${where} ORDER BY t.date DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/customers
router.post("/customers/", async (req, res) => {
 // #swagger.tags = ['Customers']
  const { name, contact_no, city, gstin, group, address, opening, credit, debit, closing } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [r] = await pool.query(
      "INSERT INTO customer (name,contact_no,city,gstin,`group`,address,opening,credit,debit,closing) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [name, contact_no||null, city||null, gstin||null, group||null, address||null, opening||0, credit||0, debit||0, closing||0]
    );
    res.status(201).json({ success: true, message: "Customer created", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/customers/:id
router.put("/customers/:id", async (req, res) => {
 // #swagger.tags = ['Customers']
  const { name, contact_no, city, gstin, group, address, opening, credit, debit, closing } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [r] = await pool.query(
      "UPDATE customer SET name=?,contact_no=?,city=?,gstin=?,`group`=?,address=?,opening=?,credit=?,debit=?,closing=? WHERE id=?",
      [name, contact_no||null, city||null, gstin||null, group||null, address||null, opening||0, credit||0, debit||0, closing||0, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Customer not found" });
    res.json({ success: true, message: "Customer updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/customers/:id
router.delete("/customers/:id", async (req, res) => {
 // #swagger.tags = ['Customers']
  try {
    const [r] = await pool.query("DELETE FROM customer WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Customer not found" });
    res.json({ success: true, message: "Customer deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
