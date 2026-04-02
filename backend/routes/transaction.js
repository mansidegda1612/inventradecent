const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

router.use(auth);

// GET /api/transactions  — list with filters: date range, customer, bill_no, type (sale/purchase)
router.get("/transactions/", async (req, res) => {
 // #swagger.tags = ['Transactions']
  const { page = 1, limit = 10, search = "", customer_id = "", from = "", to = "", type = "" } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let where = "WHERE 1=1";
    const params = [];

    if (search)      { where += " AND t.bill_no LIKE ?"; params.push(`%${search}%`); }
    if (customer_id) { where += " AND t.customer_id=?";  params.push(customer_id); }
    if (from)        { where += " AND DATE(t.date)>=?";   params.push(from); }
    if (to)          { where += " AND DATE(t.date)<=?";   params.push(to); }
    if (type === "sale")     { where += " AND t.s_qty > 0"; }
    if (type === "purchase") { where += " AND t.p_qty > 0"; }

    const [countRows] = await pool.query(`SELECT COUNT(DISTINCT t.transaction_id) AS total FROM transaction t ${where}`, params);
    const [rows] = await pool.query(
      `SELECT t.transaction_id, t.bill_no, t.date, t.customer_id, c.name AS customer_name,
              SUM(t.final_amount) AS total_amount, SUM(t.taxable_amount) AS taxable_total,
              SUM(t.CGST) AS total_cgst, SUM(t.SGST) AS total_sgst,
              t.discount, t.roundoff, COUNT(t.id) AS item_count,
              MAX(t.userid) AS userid, u.name AS created_by
       FROM transaction t
       LEFT JOIN customer c ON t.customer_id = c.id
       LEFT JOIN user u ON t.userid = u.id
       ${where}
       GROUP BY t.transaction_id, t.bill_no, t.date, t.customer_id, c.name, t.discount, t.roundoff, t.userid, u.name
       ORDER BY t.date DESC LIMIT ? OFFSET ?`,
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

// GET /api/transactions/next-bill-no  — auto-generate next bill number
router.get("/transactions/next-bill-no", async (req, res) => {
 // #swagger.tags = ['Transactions']
  try {
    const [rows] = await pool.query("SELECT bill_no FROM transaction ORDER BY id DESC LIMIT 1");
    let nextNo = "BILL-0001";
    if (rows.length && rows[0].bill_no) {
      const parts = rows[0].bill_no.split("-");
      const num   = parseInt(parts[parts.length - 1]) + 1;
      nextNo = `BILL-${String(num).padStart(4, "0")}`;
    }
    res.json({ success: true, data: { bill_no: nextNo } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/transactions/:transaction_id  — full bill with all line items
router.get("/transactions/:transaction_id", async (req, res) => {
 // #swagger.tags = ['Transactions']
  try {
    const [rows] = await pool.query(
      `SELECT t.*, p.name AS product_name, p.hsn_code, c.name AS customer_name,
              c.gstin, c.address, c.city, u.name AS created_by
       FROM transaction t
       LEFT JOIN product p  ON t.product_id  = p.id
       LEFT JOIN customer c ON t.customer_id = c.id
       LEFT JOIN user u     ON t.userid      = u.id
       WHERE t.transaction_id = ?
       ORDER BY t.id ASC`,
      [req.params.transaction_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Transaction not found" });
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/transactions  — create a full bill (multiple line items in one call)
// Body: { bill_no, date, customer_id, discount, roundoff, items: [{ product_id, s_qty, p_qty, rate, taxable_amount, CGST, SGST, final_amount }] }
router.post("/transactions/", async (req, res) => {
 // #swagger.tags = ['Transactions']
  const { bill_no, date, customer_id, discount = 0, roundoff = 0, items } = req.body;

  if (!bill_no || !customer_id || !items?.length)
    return res.status(400).json({ success: false, message: "bill_no, customer_id and items[] required" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Get next transaction_id
    const [lastTx] = await conn.query("SELECT MAX(transaction_id) AS maxId FROM transaction");
    const transaction_id = (lastTx[0].maxId || 0) + 1;

    const billDate = date || new Date();

    for (const item of items) {
      const { product_id, s_qty = 0, p_qty = 0, rate, taxable_amount, CGST, SGST, final_amount } = item;

      await conn.query(
        `INSERT INTO transaction (transaction_id, date, bill_no, customer_id, product_id, s_qty, p_qty, rate,
         taxable_amount, CGST, SGST, roundoff, discount, final_amount, userid, creation_date, updation_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [transaction_id, billDate, bill_no, customer_id, product_id, s_qty, p_qty, rate,
         taxable_amount || 0, CGST || 0, SGST || 0, roundoff, discount, final_amount || 0, req.user.id]
      );

      // Update product stock
      if (s_qty > 0) await conn.query("UPDATE product SET s_qty=s_qty+?, c_qty=c_qty-? WHERE id=?", [s_qty, s_qty, product_id]);
      if (p_qty > 0) await conn.query("UPDATE product SET p_qty=p_qty+?, c_qty=c_qty+? WHERE id=?", [p_qty, p_qty, product_id]);
    }

    // Update customer balance
    const totalFinal = items.reduce((s, i) => s + (parseFloat(i.final_amount) || 0), 0);
    await conn.query(
      "UPDATE customer SET debit=debit+?, closing=closing+? WHERE id=?",
      [totalFinal, totalFinal, customer_id]
    );

    await conn.commit();
    conn.release();

    res.status(201).json({ success: true, message: "Transaction saved", data: { transaction_id, bill_no } });
  } catch (e) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/transactions/:transaction_id  — update a full bill (delete old rows, insert new)
router.put("/transactions/:transaction_id", async (req, res) => {
 // #swagger.tags = ['Transactions']
  const { bill_no, date, customer_id, discount = 0, roundoff = 0, items } = req.body;
  if (!bill_no || !customer_id || !items?.length)
    return res.status(400).json({ success: false, message: "bill_no, customer_id and items[] required" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tid = req.params.transaction_id;

    // Reverse old stock
    const [oldItems] = await conn.query("SELECT * FROM transaction WHERE transaction_id=?", [tid]);
    for (const old of oldItems) {
      if (old.s_qty > 0) await conn.query("UPDATE product SET s_qty=s_qty-?, c_qty=c_qty+? WHERE id=?", [old.s_qty, old.s_qty, old.product_id]);
      if (old.p_qty > 0) await conn.query("UPDATE product SET p_qty=p_qty-?, c_qty=c_qty-? WHERE id=?", [old.p_qty, old.p_qty, old.product_id]);
    }
    const oldTotal = oldItems.reduce((s, i) => s + (parseFloat(i.final_amount) || 0), 0);
    await conn.query("UPDATE customer SET debit=debit-?, closing=closing-? WHERE id=?", [oldTotal, oldTotal, customer_id]);

    // Delete old rows and insert new
    await conn.query("DELETE FROM transaction WHERE transaction_id=?", [tid]);
    const billDate = date || new Date();

    for (const item of items) {
      const { product_id, s_qty = 0, p_qty = 0, rate, taxable_amount, CGST, SGST, final_amount } = item;
      await conn.query(
        `INSERT INTO transaction (transaction_id, date, bill_no, customer_id, product_id, s_qty, p_qty, rate,
         taxable_amount, CGST, SGST, roundoff, discount, final_amount, userid, creation_date, updation_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [tid, billDate, bill_no, customer_id, product_id, s_qty, p_qty, rate,
         taxable_amount||0, CGST||0, SGST||0, roundoff, discount, final_amount||0, req.user.id]
      );
      if (s_qty > 0) await conn.query("UPDATE product SET s_qty=s_qty+?, c_qty=c_qty-? WHERE id=?", [s_qty, s_qty, product_id]);
      if (p_qty > 0) await conn.query("UPDATE product SET p_qty=p_qty+?, c_qty=c_qty+? WHERE id=?", [p_qty, p_qty, product_id]);
    }

    const newTotal = items.reduce((s, i) => s + (parseFloat(i.final_amount) || 0), 0);
    await conn.query("UPDATE customer SET debit=debit+?, closing=closing+? WHERE id=?", [newTotal, newTotal, customer_id]);

    await conn.commit();
    conn.release();
    res.json({ success: true, message: "Transaction updated" });
  } catch (e) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/transactions/:transaction_id  — cancel a bill (reverses stock + balance)
router.delete("/transactions/:transaction_id", async (req, res) => {
 // #swagger.tags = ['Transactions']
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tid = req.params.transaction_id;

    const [rows] = await conn.query("SELECT * FROM transaction WHERE transaction_id=?", [tid]);
    if (!rows.length) { conn.release(); return res.status(404).json({ success: false, message: "Transaction not found" }); }

    for (const row of rows) {
      if (row.s_qty > 0) await conn.query("UPDATE product SET s_qty=s_qty-?, c_qty=c_qty+? WHERE id=?", [row.s_qty, row.s_qty, row.product_id]);
      if (row.p_qty > 0) await conn.query("UPDATE product SET p_qty=p_qty-?, c_qty=c_qty-? WHERE id=?", [row.p_qty, row.p_qty, row.product_id]);
    }
    const total = rows.reduce((s, i) => s + (parseFloat(i.final_amount) || 0), 0);
    await conn.query("UPDATE customer SET debit=debit-?, closing=closing-? WHERE id=?", [total, total, rows[0].customer_id]);

    await conn.query("DELETE FROM transaction WHERE transaction_id=?", [tid]);
    await conn.commit();
    conn.release();
    res.json({ success: true, message: "Transaction deleted and stock reversed" });
  } catch (e) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
