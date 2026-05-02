const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

router.use(auth);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions
// List all bills with filters: page, limit, search, customer_id, from, to, type
// type = "sale" | "purchase"
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transactions/", async (req, res) => {
  // #swagger.tags = ['Transactions']
  const {
    page = 1, limit = 10,
    search = "", customer_id = "",
    from = "", to = "",
    type = "",
  } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let where = "WHERE 1=1";
    const params = [];

    if (search)      { where += " AND t.bill_no LIKE ?";    params.push(`%${search}%`); }
    if (customer_id) { where += " AND t.customer_id = ?";   params.push(customer_id); }
    if (from)        { where += " AND DATE(t.date) >= ?";   params.push(from); }
    if (to)          { where += " AND DATE(t.date) <= ?";   params.push(to); }
    if (type === "sale")     { where += " AND t.trans_type = 'SI'"; }
    if (type === "purchase") { where += " AND t.trans_type = 'PI'"; }

    // Total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM \`transaction\` t ${where}`,
      params
    );

    // Main list — aggregate item totals from transaction_items
    const [rows] = await pool.query(
      `SELECT
         t.id               AS transaction_id,
         t.trans_type,
         t.credit_debit,
         t.bill_no,
         t.date,
         t.customer_id,
         c.name             AS customer_name,
         t.taxable_amount,
         t.discount,
         t.ROUNDOFF,
         t.final_amount,
         t.userid,
         u.name             AS created_by,
         COUNT(ti.id)       AS item_count,
         SUM(ti.CGST)       AS total_cgst,
         SUM(ti.SGST)       AS total_sgst
       FROM \`transaction\` t
       LEFT JOIN customer          c  ON t.customer_id = c.id
       LEFT JOIN user              u  ON t.userid      = u.id
       LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
       ${where}
       GROUP BY t.id
       ORDER BY t.date DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total:      countRows[0].total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(countRows[0].total / parseInt(limit)),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/next-bill-no
// Auto-generate the next bill number  e.g. BILL-0042
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transactions/next-bill-no", async (req, res) => {
  // #swagger.tags = ['Transactions']
  try {
    const [rows] = await pool.query(
      "SELECT bill_no FROM `transaction` ORDER BY id DESC LIMIT 1"
    );
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/:transaction_id
// Full bill detail — master header + all line items
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transactions/:transaction_id", async (req, res) => {
  // #swagger.tags = ['Transactions']
  try {
    const tid = req.params.transaction_id;

    // Master row
    const [master] = await pool.query(
      `SELECT
         t.*,
         c.name    AS customer_name,
         c.gstin,
         c.address,
         c.city,
         u.name    AS created_by
       FROM \`transaction\` t
       LEFT JOIN customer c ON t.customer_id = c.id
       LEFT JOIN user     u ON t.userid      = u.id
       WHERE t.id = ?`,
      [tid]
    );
    if (!master.length)
      return res.status(404).json({ success: false, message: "Transaction not found" });

    // Line items
    const [items] = await pool.query(
      `SELECT
         ti.*,
         p.name     AS product_name,
         p.hsn_code
       FROM transaction_items ti
       LEFT JOIN product p ON ti.product_id = p.id
       WHERE ti.transaction_id = ?
       ORDER BY ti.id ASC`,
      [tid]
    );

    res.json({
      success: true,
      data: { ...master[0], items },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transactions
// Create a new bill (master + line items) in a single call
//
// Body:
// {
//   trans_type,        -- "SI" | "PI" | "SR" | "PR"
//   credit_debit,      -- "D" | "C"
//   bill_no,
//   date,
//   customer_id,
//   taxable_amount,    -- total of all items (can be computed here or sent from client)
//   discount,
//   roundoff,
//   final_amount,
//   items: [
//     { product_id, qty, rate, taxable_amount, CGST, SGST }
//   ]
// }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/transactions/", async (req, res) => {
  // #swagger.tags = ['Transactions']
  const {
    trans_type, credit_debit = "D",
    bill_no, date, customer_id,
    discount = 0, roundoff = 0,
    final_amount, items,
  } = req.body;

  if (!bill_no || !customer_id || !items?.length)
    return res.status(400).json({
      success: false,
      message: "bill_no, customer_id and items[] are required",
    });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ── Compute totals from items (source of truth) ──────────────────────────
    const taxable_total = items.reduce((s, i) => s + (parseFloat(i.taxable_amount) || 0), 0);
    const final_total   = parseFloat(final_amount) ||
      (taxable_total
        + items.reduce((s, i) => s + (parseFloat(i.CGST) || 0) + (parseFloat(i.SGST) || 0), 0)
        - parseFloat(discount)
        + parseFloat(roundoff));

    // ── Insert master ─────────────────────────────────────────────────────────
    const [masterResult] = await conn.query(
      `INSERT INTO \`transaction\`
         (trans_type, credit_debit, date, bill_no, customer_id,
          taxable_amount, ROUNDOFF, discount, final_amount,
          userid, creation_date, updation_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [
        trans_type, credit_debit,
        date || new Date(), bill_no, customer_id,
        taxable_total, roundoff, discount, final_total,
        req.user.id,
      ]
    );
    const transaction_id = masterResult.insertId;

    // ── Insert line items + update stock ──────────────────────────────────────
    for (const item of items) {
      const {
        product_id,
        qty       = 0,
        rate      = 0,
        taxable_amount = 0,
        CGST      = 0,
        SGST      = 0,
      } = item;

      await conn.query(
        `INSERT INTO transaction_items
           (transaction_id, product_id, qty, rate, taxable_amount, CGST, SGST,
            creation_date, updation_date)
         VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
        [transaction_id, product_id, qty, rate, taxable_amount, CGST, SGST]
      );

      // Stock: sale = reduce c_qty, purchase = increase c_qty
      if (trans_type === "SI" || trans_type === "SR") {
        const sign = trans_type === "SI" ? -1 : +1; // SR = sales return → add back
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ? WHERE id = ?",
          [sign * qty, product_id]
        );
      } else if (trans_type === "PI" || trans_type === "PR") {
        const sign = trans_type === "PI" ? +1 : -1; // PR = purchase return → reduce
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ? WHERE id = ?",
          [sign * qty, product_id]
        );
      }
    }

    // ── Update customer balance ───────────────────────────────────────────────
    // Sale (SI) → customer owes us → debit increases
    // Purchase (PI) → we owe supplier → credit increases
    if (trans_type === "SI") {
      await conn.query(
        "UPDATE customer SET debit = debit + ?, closing = closing + ? WHERE id = ?",
        [final_total, final_total, customer_id]
      );
    } else if (trans_type === "PI") {
      await conn.query(
        "UPDATE customer SET credit = credit + ?, closing = closing - ? WHERE id = ?",
        [final_total, final_total, customer_id]
      );
    }

    await conn.commit();
    conn.release();
    res.status(201).json({
      success: true,
      message: "Transaction saved",
      data: { transaction_id, bill_no },
    });
  } catch (e) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/transactions/:transaction_id
// Update a bill — reverses old stock/balance, deletes old items, inserts new
// Body: same shape as POST
// ─────────────────────────────────────────────────────────────────────────────
router.put("/transactions/:transaction_id", async (req, res) => {
  // #swagger.tags = ['Transactions']
  const {
    trans_type, credit_debit = "D",
    bill_no, date, customer_id,
    discount = 0, roundoff = 0,
    final_amount, items,
  } = req.body;

  if (!bill_no || !customer_id || !items?.length)
    return res.status(400).json({
      success: false,
      message: "bill_no, customer_id and items[] are required",
    });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tid = req.params.transaction_id;

    // ── Fetch old master (need old trans_type + customer for reversal) ────────
    const [oldMaster] = await conn.query(
      "SELECT * FROM `transaction` WHERE id = ?", [tid]
    );
    if (!oldMaster.length) {
      conn.release();
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }
    const old = oldMaster[0];

    // ── Reverse old stock ─────────────────────────────────────────────────────
    const [oldItems] = await conn.query(
      "SELECT * FROM transaction_items WHERE transaction_id = ?", [tid]
    );
    for (const oi of oldItems) {
      if (old.trans_type === "SI") {
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ? WHERE id = ?",
          [oi.qty, oi.product_id]                   // undo sale
        );
      } else if (old.trans_type === "PI") {
        await conn.query(
          "UPDATE product SET c_qty = c_qty - ? WHERE id = ?",
          [oi.qty, oi.product_id]                   // undo purchase
        );
      }
    }

    // ── Reverse old customer balance ──────────────────────────────────────────
    if (old.trans_type === "SI") {
      await conn.query(
        "UPDATE customer SET debit = debit - ?, closing = closing - ? WHERE id = ?",
        [old.final_amount, old.final_amount, old.customer_id]
      );
    } else if (old.trans_type === "PI") {
      await conn.query(
        "UPDATE customer SET credit = credit - ?, closing = closing + ? WHERE id = ?",
        [old.final_amount, old.final_amount, old.customer_id]
      );
    }

    // ── Delete old line items ─────────────────────────────────────────────────
    await conn.query("DELETE FROM transaction_items WHERE transaction_id = ?", [tid]);

    // ── Compute new totals ────────────────────────────────────────────────────
    const taxable_total = items.reduce((s, i) => s + (parseFloat(i.taxable_amount) || 0), 0);
    const final_total   = parseFloat(final_amount) ||
      (taxable_total
        + items.reduce((s, i) => s + (parseFloat(i.CGST) || 0) + (parseFloat(i.SGST) || 0), 0)
        - parseFloat(discount)
        + parseFloat(roundoff));

    // ── Update master ─────────────────────────────────────────────────────────
    await conn.query(
      `UPDATE \`transaction\` SET
         trans_type     = ?,
         credit_debit   = ?,
         date           = ?,
         bill_no        = ?,
         customer_id    = ?,
         taxable_amount = ?,
         ROUNDOFF       = ?,
         discount       = ?,
         final_amount   = ?,
         userid         = ?,
         updation_date  = NOW()
       WHERE id = ?`,
      [
        trans_type, credit_debit,
        date || new Date(), bill_no, customer_id,
        taxable_total, roundoff, discount, final_total,
        req.user.id, tid,
      ]
    );

    // ── Insert new line items + update stock ──────────────────────────────────
    for (const item of items) {
      const {
        product_id,
        qty            = 0,
        rate           = 0,
        taxable_amount = 0,
        CGST           = 0,
        SGST           = 0,
      } = item;

      await conn.query(
        `INSERT INTO transaction_items
           (transaction_id, product_id, qty, rate, taxable_amount, CGST, SGST,
            creation_date, updation_date)
         VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
        [tid, product_id, qty, rate, taxable_amount, CGST, SGST]
      );

      if (trans_type === "SI") {
        await conn.query(
          "UPDATE product SET c_qty = c_qty - ? WHERE id = ?", [qty, product_id]
        );
      } else if (trans_type === "PI") {
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ? WHERE id = ?", [qty, product_id]
        );
      }
    }

    // ── Apply new customer balance ─────────────────────────────────────────────
    if (trans_type === "SI") {
      await conn.query(
        "UPDATE customer SET debit = debit + ?, closing = closing + ? WHERE id = ?",
        [final_total, final_total, customer_id]
      );
    } else if (trans_type === "PI") {
      await conn.query(
        "UPDATE customer SET credit = credit + ?, closing = closing - ? WHERE id = ?",
        [final_total, final_total, customer_id]
      );
    }

    await conn.commit();
    conn.release();
    res.json({ success: true, message: "Transaction updated" });
  } catch (e) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/transactions/:transaction_id
// Cancel a bill — reverses stock and customer balance, then deletes
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/transactions/:transaction_id", async (req, res) => {
  // #swagger.tags = ['Transactions']
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tid = req.params.transaction_id;

    // Fetch master
    const [masterRows] = await conn.query(
      "SELECT * FROM `transaction` WHERE id = ?", [tid]
    );
    if (!masterRows.length) {
      conn.release();
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }
    const master = masterRows[0];

    // Fetch items for stock reversal
    const [items] = await conn.query(
      "SELECT * FROM transaction_items WHERE transaction_id = ?", [tid]
    );

    // Reverse stock
    for (const item of items) {
      if (master.trans_type === "SI") {
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ? WHERE id = ?",
          [item.qty, item.product_id]
        );
      } else if (master.trans_type === "PI") {
        await conn.query(
          "UPDATE product SET c_qty = c_qty - ? WHERE id = ?",
          [item.qty, item.product_id]
        );
      }
    }

    // Reverse customer balance
    if (master.trans_type === "SI") {
      await conn.query(
        "UPDATE customer SET debit = debit - ?, closing = closing - ? WHERE id = ?",
        [master.final_amount, master.final_amount, master.customer_id]
      );
    } else if (master.trans_type === "PI") {
      await conn.query(
        "UPDATE customer SET credit = credit - ?, closing = closing + ? WHERE id = ?",
        [master.final_amount, master.final_amount, master.customer_id]
      );
    }

    // Delete items first (FK), then master
    await conn.query("DELETE FROM transaction_items WHERE transaction_id = ?", [tid]);
    await conn.query("DELETE FROM `transaction` WHERE id = ?", [tid]);

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