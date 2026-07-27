const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/AuthMiddleware");
const loadContext = require("../middleware/loadContext");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");
const requireRight = require("../middleware/requireRight");
const { orgScope } = require("../utils/orgScope");

router.use(auth, loadContext, requireActiveSubscription);

// GET /api/customers  — with search, optional pagination, group filter
// If page & limit are NOT passed from the GUI, all matching records are returned.
router.get("/customers/", requireRight("accounts.view"), async (req, res) => {
  // #swagger.tags = ['Customers']
  const { page, limit, search = "", group = "" } = req.query;

  // Pagination only kicks in when both page & limit are explicitly provided.
  const usePagination = page !== undefined && limit !== undefined;
  const pageNum = usePagination ? parseInt(page) : null;
  const limitNum = usePagination ? parseInt(limit) : null;
  const offset = usePagination ? (pageNum - 1) * limitNum : 0;

  try {
    const scope = orgScope(req.ctx, "c");
    let where = scope.where;
    const params = [...scope.params];

    if (search) {
      where += " AND (c.name LIKE ? OR c.contact_no LIKE ? OR c.city LIKE ? OR c.gstin LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (group) { where += " AND c.group=?"; params.push(group); }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM customer c ${where}`, params);

    const listParams = [...params];
    let limitClause = "";
    if (usePagination) {
      limitClause = " LIMIT ? OFFSET ?";
      listParams.push(limitNum, offset);
    }

    const [rows] = await pool.query(
      `SELECT c.*, g.name AS group_name FROM customer c LEFT JOIN \`group\` g ON c.group=g.id ${where} ORDER BY c.name ASC${limitClause}`,
      listParams
    );

    res.json({
      success: true,
      data: rows,
      pagination: usePagination
        ? {
            total: countRows[0].total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(countRows[0].total / limitNum),
          }
        : {
            total: countRows[0].total,
            page: 1,
            limit: countRows[0].total,
            totalPages: 1,
          },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/customers/dropdown  — id+name only for bill dropdowns
router.get("/customers/dropdown", async (req, res) => {
  // #swagger.tags = ['Customers']
  try {
    const [rows] = await pool.query(
      "SELECT id, name, contact_no, gstin FROM customer WHERE org_id=? ORDER BY name ASC",
      [req.ctx.orgId]
    );
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
      "SELECT c.*, g.name AS group_name FROM customer c LEFT JOIN `group` g ON c.group=g.id WHERE c.id=? AND c.org_id=?",
      [req.params.id, req.ctx.orgId]
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
    let where = "WHERE t.customer_id=? AND t.org_id=?";
    const params = [req.params.id, req.ctx.orgId];
    if (from) { where += " AND DATE(t.date)>=?"; params.push(from); }
    if (to) { where += " AND DATE(t.date)<=?"; params.push(to); }

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
router.post("/customers/", requireRight("accounts.create"), async (req, res) => {
  // #swagger.tags = ['Customers']
  const { name, contact_no, city, gstin, group, address, opening } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [r] = await pool.query(
      "INSERT INTO customer (name,contact_no,city,gstin,`group`,address,opening,closing,org_id) VALUES (?,?,?,?,?,?,?,?,?)",
      [name, contact_no || null, city || null, gstin || null, group || null, address || null, opening || 0, opening || 0, req.ctx.orgId]
    );
    res.status(201).json({ success: true, message: "Customer created", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/customers/:id
router.put("/customers/:id", requireRight("accounts.edit"), async (req, res) => {
  // #swagger.tags = ['Customers']
  const { name, contact_no, city, gstin, group, address, opening } = req.body;
  let credit = 0, debit = 0;
  try {
    const [rows] = await pool.query(
      "SELECT c.* FROM customer c WHERE c.id=? AND c.org_id=?",
      [req.params.id, req.ctx.orgId]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: "Customer not found" });
    else {
      credit = rows[0].credit;
      debit = rows[0].debit;
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
  let closing = opening + debit - credit;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const [r] = await pool.query(
      "UPDATE customer SET name=?,contact_no=?,city=?,gstin=?,`group`=?,address=?,opening=?,closing=? WHERE id=? AND org_id=?",
      [name, contact_no || null, city || null, gstin || null, group || null, address || null, opening || 0, closing || 0, req.params.id, req.ctx.orgId]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Customer not found" });
    res.json({ success: true, message: "Customer updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/customers/:id
router.delete("/customers/:id", requireRight("accounts.delete"), async (req, res) => {
  // #swagger.tags = ['Customers']
  try {
    const [r] = await pool.query("DELETE FROM customer WHERE id=? AND org_id=?", [req.params.id, req.ctx.orgId]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Customer not found" });
    res.json({ success: true, message: "Customer deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;