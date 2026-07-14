const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/AuthMiddleware");

router.use(auth);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions
// List all bills/vouchers with filters: page, limit, search, customer_id, from, to, type
// type = "SI" | "PI" | "CR" | "CP"   (CR = Cash/Bank Receipt, CP = Cash/Bank Payment)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transactions/", async (req, res) => {
  // #swagger.tags = ['Transactions']
  const {
    page, limit,
    search = "", customer_id = "",
    from = "", to = "",
    type = "",
  } = req.query;

  // Pagination only kicks in when both page & limit are explicitly provided
  // from the GUI. Otherwise all matching records are returned.
  const usePagination = page !== undefined && limit !== undefined;
  const pageNum = usePagination ? parseInt(page) : null;
  const limitNum = usePagination ? parseInt(limit) : null;
  const offset = usePagination ? (pageNum - 1) * limitNum : 0;

  try {
    let where = "WHERE 1=1";
    const params = [];

    if (search) {
      where += " AND (t.bill_no LIKE ? OR IFNULL(c.name, cc.CustName) LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (customer_id) { where += " AND t.customer_id = ?"; params.push(customer_id); }
    if (from) { where += " AND DATE(t.date) >= ?"; params.push(from); }
    if (to) { where += " AND DATE(t.date) <= ?"; params.push(to); }
    if (type === "SI") { where += " AND t.trans_type = 'SI'"; }
    if (type === "PI") { where += " AND t.trans_type = 'PI'"; }
    if (type === "CR") { where += " AND t.trans_type = 'CR'"; }   // NEW — Cash/Bank Receipt
    if (type === "CP") { where += " AND t.trans_type = 'CP'"; }   // NEW — Cash/Bank Payment

    // Total count
    const [countRows] = await pool.query(
      `SELECT 
      COUNT(*) AS total 
      FROM \`transaction\`  t
      LEFT JOIN customer          c  ON t.customer_id = c.id 
      LEFT JOIN cashcustdetail          cc  ON t.id = cc.transaction_id
      ${where}`,
      params
    );

    const listParams = [...params];
    let limitClause = "";
    if (usePagination) {
      limitClause = " LIMIT ? OFFSET ?";
      listParams.push(limitNum, offset);
    }

    // Main list — aggregate item totals from transaction_items
    // (CR/CP rows have no transaction_items, so item_count/CGST/SGST
    //  simply come back as 0 for them — no special-casing needed here)
    const [rows] = await pool.query(
      `SELECT
         t.id               AS transaction_id,
         t.trans_type,
         t.cash_debit AS cord,
         IF(t.cash_debit = "C" ,"Cash" , "Debit") AS cash_debit,
         t.payment_mode,
         t.ref_no,
         t.narration,
         t.bill_no,
         t.date, 
         t.customer_id,
        ANY_VALUE(IFNULL(c.name ,cc.custname))            AS customer_name,
        c.contact_no,
         t.taxable_amount,
         t.discount,
         t.ROUNDOFF,
         t.final_amount,
         t.userid,
         ANY_VALUE(u.name)             AS created_by,
         COUNT(ti.id)       AS item_count,
         SUM(ti.CGST)       AS total_cgst,
         SUM(ti.SGST)       AS total_sgst
       FROM \`transaction\` t
       LEFT JOIN customer          c  ON t.customer_id = c.id
       LEFT JOIN cashcustdetail          cc  ON t.id = cc.transaction_id
       LEFT JOIN user              u  ON t.userid      = u.id
       LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
       ${where}
       GROUP BY t.id
       ORDER BY t.date DESC${limitClause}`,
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/next-bill-no
// Auto-generate the next bill number  e.g. BILL-0042
// (Unchanged — SI/PI only, exactly as before)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transactions/next-bill-no", async (req, res) => {
  // #swagger.tags = ['Transactions']
  try {

    const [rows] = await pool.query(
      "SELECT bill_no FROM `transaction` WHERE  trans_type = 'SI' ORDER BY id DESC LIMIT 1"
    );
    let nextNo = "BILL-0001";
    if (rows.length && rows[0].bill_no) {
      const parts = rows[0].bill_no.split("-");
      const num = parseInt(parts[parts.length - 1]) + 1;
      nextNo = `BILL-${String(num).padStart(4, "0")}`;
    }
    res.json({ success: true, data: { bill_no: nextNo } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/pending-bills   ⟵ NEW
// Outstanding SI (or PI) bills for a party, with live pending_amount for
// bill-wise adjustment on a CR/CP voucher.
//
// Query: customer_id (required), bill_type = "SI" | "PI" (required),
//        exclude_voucher_id (optional — pass the voucher's own id while
//        editing, so its own prior adjustments are added back as available)
//
// NOTE: registered ABOVE the "/transactions/:transaction_id" route below,
// same reason "next-bill-no" already sits above it — otherwise Express
// would treat "pending-bills" as a :transaction_id value.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/transactions/pending-bills", async (req, res) => {
  // #swagger.tags = ['Transactions']
  const { customer_id, bill_type, exclude_voucher_id = 0 } = req.query;

  if (!customer_id || !["SI", "PI"].includes(bill_type)) {
    return res.status(400).json({
      success: false,
      message: "customer_id and bill_type ('SI' or 'PI') are required",
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT
         t.id AS transaction_id,
         t.bill_no,
         t.date,
         t.final_amount,
         IFNULL(SUM(
           CASE WHEN ta.voucher_transaction_id <> ? THEN ta.adjusted_amount ELSE 0 END
         ), 0) AS adjusted_amount
       FROM \`transaction\` t
       LEFT JOIN transaction_adjustments ta ON ta.bill_transaction_id = t.id
       WHERE t.customer_id = ? AND t.trans_type = ?
       GROUP BY t.id
       HAVING (t.final_amount - adjusted_amount) > 0.01
       ORDER BY t.date ASC`,
      [exclude_voucher_id, customer_id, bill_type]
    );

    const data = rows.map((r) => ({
      ...r,
      pending_amount: parseFloat(r.final_amount) - parseFloat(r.adjusted_amount),
    }));

    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/:transaction_id
// Full detail — master header + line items (SI/PI) + adjustments (CR/CP)
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
         c.contact_no,
         c.city,
         cc.custname As customer_name_cash,
         u.name    AS created_by
       FROM \`transaction\` t
       LEFT JOIN customer c ON t.customer_id = c.id
        LEFT JOIN cashcustdetail   cc  ON t.id = cc.transaction_id
       LEFT JOIN user     u ON t.userid      = u.id
       WHERE t.id = ?`,
      [tid]
    );
    if (!master.length)
      return res.status(404).json({ success: false, message: "Transaction not found" });

    // Line items (SI/PI/SR/PR) — empty array for CR/CP, which is fine
    const [items] = await pool.query(
      `SELECT
         ti.*,
         p.name     AS product_name,
         p.hsn_code,
         p.gstPer
       FROM transaction_items ti
       LEFT JOIN product p ON ti.product_id = p.id
       WHERE ti.transaction_id = ?
       ORDER BY ti.id ASC`,
      [tid]
    );

    // Bill-wise adjustments (CR/CP) — empty array for SI/PI/SR/PR, fine  ⟵ NEW
    const [adjustments] = await pool.query(
      `SELECT
         ta.id,
         ta.bill_transaction_id,
         ta.adjusted_amount,
         bt.bill_no       AS bill_bill_no,
         bt.date          AS bill_date,
         bt.final_amount  AS bill_final_amount
       FROM transaction_adjustments ta
       JOIN \`transaction\` bt ON bt.id = ta.bill_transaction_id
       WHERE ta.voucher_transaction_id = ?`,
      [tid]
    );

    res.json({
      success: true,
      data: { ...master[0], items, adjustments },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transactions
// Create a new bill OR voucher — routed by trans_type:
//   trans_type = "SI" | "PI" | "SR" | "PR"  → existing bill logic (UNCHANGED)
//   trans_type = "CR" | "CP"                → new voucher logic (NEW)
//
// Bill body (unchanged):
// {
//   trans_type, cash_debit, bill_no, date, customer_id,
//   taxable_amount, discount, roundoff, final_amount,
//   items: [ { product_id, qty, rate, taxable_amount, CGST, SGST } ]
// }
//
// Voucher body (new):
// {
//   trans_type,          -- "CR" | "CP"
//   payment_mode,        -- "Cash" | "Bank"
//   bill_no, date, customer_id, ref_no, narration,
//   final_amount,         -- total cash/bank amount received or paid
//   adjustments: [ { bill_transaction_id, amount } ]
// }
// Ledger mapping (matches how SI/PI already post — debit/credit are running
// ledger totals, not "who owes who"):
//   SI → debit ↑   (invoicing a customer is a debit entry)
//   PI → credit ↑  (being invoiced by a supplier is a credit entry)
//   CR → credit ↑, closing ↓   (a receipt is a credit entry)
//   CP → debit ↑,  closing ↑   (a payment is a debit entry)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/transactions/", async (req, res) => {
  // #swagger.tags = ['Transactions']
  const { trans_type } = req.body;

  // ═══════════════════════════════════════════════════════════════════════
  // NEW — Cash/Bank Receipt (CR) / Cash/Bank Payment (CP)
  // Fully separate code path. Returns before touching any SI/PI logic below.
  // ═══════════════════════════════════════════════════════════════════════
  if (trans_type === "CR" || trans_type === "CP") {
    const {
      payment_mode = "Cash",
      bill_no, date, customer_id,
      ref_no = "", narration = "",
      final_amount,
      adjustments = [],
    } = req.body;

    if (!bill_no || !customer_id || !final_amount) {
      return res.status(400).json({
        success: false,
        message: "bill_no, customer_id and final_amount are required",
      });
    }

    const totalAdjusted = adjustments.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    if (totalAdjusted > parseFloat(final_amount) + 0.01) {
      return res.status(400).json({
        success: false,
        message: "Total adjusted amount cannot exceed the voucher amount",
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [masterResult] = await conn.query(
        `INSERT INTO \`transaction\`
           (trans_type, cash_debit, payment_mode, date, bill_no, customer_id,
            taxable_amount, ROUNDOFF, discount, final_amount, ref_no, narration,
            userid, creation_date, updation_date)
         VALUES (?,?,?,?,?,?,0,0,0,?,?,?,?,NOW(),NOW())`,
        [
          trans_type, "D", payment_mode,
          date || new Date(), bill_no, customer_id,
          parseFloat(final_amount), ref_no, narration,
          req.user.id,
        ]
      );
      const transaction_id = masterResult.insertId;

      for (const adj of adjustments) {
        const amt = parseFloat(adj.amount) || 0;
        if (amt <= 0) continue;
        await conn.query(
          `INSERT INTO transaction_adjustments
             (voucher_transaction_id, bill_transaction_id, adjusted_amount,
              creation_date, updation_date)
           VALUES (?,?,?,NOW(),NOW())`,
          [transaction_id, adj.bill_transaction_id, amt]
        );
      }

      // Ledger effect (double-entry consistent with how SI/PI already post):
      // SI → debit ↑ (invoicing a customer is a debit entry)
      // PI → credit ↑ (being invoiced by a supplier is a credit entry)
      // CR (receipt from customer) → a receipt is a credit entry → credit ↑, closing ↓
      // CP (payment to supplier)   → a payment is a debit entry  → debit ↑,  closing ↑
      if (trans_type === "CR") {
        await conn.query(
          "UPDATE customer SET credit = credit + ?, closing = closing - ? WHERE id = ?",
          [final_amount, final_amount, customer_id]
        );
      } else {
        await conn.query(
          "UPDATE customer SET debit = debit + ?, closing = closing + ? WHERE id = ?",
          [final_amount, final_amount, customer_id]
        );
      }

      await conn.commit();
      conn.release();
      return res.status(201).json({
        success: true,
        message: "Voucher saved",
        data: { transaction_id, bill_no },
      });
    } catch (e) {
      await conn.rollback();
      conn.release();
      return res.status(500).json({ success: false, message: e.message });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXISTING — SI / PI / SR / PR  (UNCHANGED from before)
  // ═══════════════════════════════════════════════════════════════════════
  const {
    cash_debit = "D",
    bill_no, date, customer_id, customer_name_cash, isGSTBill,
    expenses,
    final_amount, items,
  } = req.body;

  if (!bill_no || (cash_debit == "D" && !customer_id) || (cash_debit == "C" && !customer_name_cash) || !items?.length)
    return res.status(400).json({
      success: false,
      message: "bill_no, customer_id , customer_Name and items[] are required",
    });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const exp = {};
    for (const item of expenses) {
      exp[item.key] = item.amount;
    }
    // ── Compute totals from items (source of truth) ──────────────────────────
    const taxable_total = items.reduce((s, i) => s + (parseFloat(i.taxable_amount) || 0), 0);
    const final_total = parseFloat(final_amount) ||
      (taxable_total
        + items.reduce((s, i) => s + (parseFloat(i.CGST) || 0) + (parseFloat(i.SGST) || 0), 0)
        - parseFloat(exp.discount)
        + parseFloat(exp.roundoff));

    // ── Insert master ─────────────────────────────────────────────────────────
    const [masterResult] = await conn.query(
      `INSERT INTO \`transaction\`
         (trans_type, cash_debit, date, bill_no, isGSTBill,customer_id,
          taxable_amount, ROUNDOFF, discount, final_amount,
          userid, creation_date, updation_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [
        trans_type, cash_debit,
        date || new Date(), bill_no, isGSTBill, customer_id,
        taxable_total, exp.roundoff, exp.discount, final_total,
        req.user.id,
      ]
    );
    const transaction_id = masterResult.insertId;
    if (customer_id == 0) {
      const [CustomerResult] = await conn.query(
        `INSERT INTO \`cashcustdetail\`
         (transaction_id, custName)
         VALUES (?,?)`,
        [
          transaction_id, customer_name_cash,
        ]
      );
    }


    // ── Insert line items + update stock ──────────────────────────────────────
    for (const item of items) {
      const {
        product_id,
        qty = 0,
        rate = 0,
        taxable_amount = 0,
        CGST = 0,
        SGST = 0,
      } = item;

      await conn.query(
        `INSERT INTO transaction_items
           (transaction_id, product_id, qty, rate, taxable_amount, CGST, SGST,
            creation_date, updation_date)
         VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
        [transaction_id, product_id, qty, rate, taxable_amount, CGST, SGST]
      );

      // Stock: sale = reduce c_qty, purchase = increase c_qty
      if (trans_type === "SI") {
        const sign = trans_type === "SI" ? -1 : +1;
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ?, s_qty = s_qty + ? WHERE id = ?",
          [sign * qty, qty, product_id]   // s_qty always increases (tracks total units sold/returned)
        );
      } else if (trans_type === "PI") {
        const sign = trans_type === "PI" ? +1 : -1;
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ?, p_qty = p_qty + ? WHERE id = ?",
          [sign * qty, qty, product_id]   // p_qty always increases (tracks total units purchased/returned)
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
// Update a bill OR voucher — routed by trans_type, same split as POST above.
// ─────────────────────────────────────────────────────────────────────────────
router.put("/transactions/:transaction_id", async (req, res) => {
  // #swagger.tags = ['Transactions']
  const { trans_type } = req.body;
  const tid = req.params.transaction_id;

  // ═══════════════════════════════════════════════════════════════════════
  // NEW — Cash/Bank Receipt (CR) / Cash/Bank Payment (CP)
  // ═══════════════════════════════════════════════════════════════════════
  if (trans_type === "CR" || trans_type === "CP") {
    const {
      payment_mode = "Cash",
      bill_no, date, customer_id,
      ref_no = "", narration = "",
      final_amount,
      adjustments = [],
    } = req.body;

    if (!bill_no || !customer_id || !final_amount) {
      return res.status(400).json({
        success: false,
        message: "bill_no, customer_id and final_amount are required",
      });
    }

    const totalAdjusted = adjustments.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    if (totalAdjusted > parseFloat(final_amount) + 0.01) {
      return res.status(400).json({
        success: false,
        message: "Total adjusted amount cannot exceed the voucher amount",
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [oldMaster] = await conn.query("SELECT * FROM `transaction` WHERE id = ?", [tid]);
      if (!oldMaster.length) {
        conn.release();
        return res.status(404).json({ success: false, message: "Voucher not found" });
      }
      const old = oldMaster[0];

      // Reverse old ledger effect (mirror image of the apply logic below)
      if (old.trans_type === "CR") {
        await conn.query(
          "UPDATE customer SET credit = credit - ?, closing = closing + ? WHERE id = ?",
          [old.final_amount, old.final_amount, old.customer_id]
        );
      } else if (old.trans_type === "CP") {
        await conn.query(
          "UPDATE customer SET debit = debit - ?, closing = closing - ? WHERE id = ?",
          [old.final_amount, old.final_amount, old.customer_id]
        );
      }

      // Drop old adjustment rows, insert new ones
      await conn.query("DELETE FROM transaction_adjustments WHERE voucher_transaction_id = ?", [tid]);

      // Update master row
      await conn.query(
        `UPDATE \`transaction\` SET
           trans_type    = ?,
           payment_mode  = ?,
           date          = ?,
           bill_no       = ?,
           customer_id   = ?,
           final_amount  = ?,
           ref_no        = ?,
           narration     = ?,
           userid        = ?,
           updation_date = NOW()
         WHERE id = ?`,
        [
          trans_type, payment_mode,
          date || new Date(), bill_no, customer_id,
          parseFloat(final_amount), ref_no, narration,
          req.user.id, tid,
        ]
      );

      for (const adj of adjustments) {
        const amt = parseFloat(adj.amount) || 0;
        if (amt <= 0) continue;
        await conn.query(
          `INSERT INTO transaction_adjustments
             (voucher_transaction_id, bill_transaction_id, adjusted_amount,
              creation_date, updation_date)
           VALUES (?,?,?,NOW(),NOW())`,
          [tid, adj.bill_transaction_id, amt]
        );
      }

      // Apply new ledger effect
      if (trans_type === "CR") {
        await conn.query(
          "UPDATE customer SET credit = credit + ?, closing = closing - ? WHERE id = ?",
          [final_amount, final_amount, customer_id]
        );
      } else {
        await conn.query(
          "UPDATE customer SET debit = debit + ?, closing = closing + ? WHERE id = ?",
          [final_amount, final_amount, customer_id]
        );
      }

      await conn.commit();
      conn.release();
      return res.json({
        success: true,
        message: "Voucher updated",
        data: { transaction_id: tid },
      });
    } catch (e) {
      await conn.rollback();
      conn.release();
      return res.status(500).json({ success: false, message: e.message });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXISTING — SI / PI / SR / PR  (UNCHANGED from before)
  // ═══════════════════════════════════════════════════════════════════════
  const {
    cash_debit = "D",
    bill_no, date, customer_id, customer_name_cash, isGSTBill,
    expenses,
    final_amount, items,
  } = req.body;

  if (!bill_no || (cash_debit == "D" && !customer_id) || (cash_debit == "C" && !customer_name_cash) || !items?.length)
    return res.status(400).json({
      success: false,
      message: "bill_no, customer_id, customer_Name and items[] are required",
    });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

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
          "UPDATE product SET c_qty = c_qty + ?, s_qty = s_qty - ? WHERE id = ?",
          [oi.qty, oi.qty, oi.product_id]
        );
      } else if (old.trans_type === "PI") {
        await conn.query(
          "UPDATE product SET c_qty = c_qty - ?, p_qty = p_qty - ? WHERE id = ?",
          [oi.qty, oi.qty, oi.product_id]
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

    const exp = {};
    for (const item of expenses) {
      exp[item.key] = item.amount;
    }

    // ── Compute new totals ────────────────────────────────────────────────────
    const taxable_total = items.reduce((s, i) => s + (parseFloat(i.taxable_amount) || 0), 0);
    const final_total = parseFloat(final_amount) ||
      (taxable_total
        + items.reduce((s, i) => s + (parseFloat(i.CGST) || 0) + (parseFloat(i.SGST) || 0), 0)
        - parseFloat(exp.discount)
        + parseFloat(exp.roundoff));

    // ── Update master ─────────────────────────────────────────────────────────
    await conn.query(
      `UPDATE \`transaction\` SET
         trans_type     = ?,
         cash_debit   = ?,
         date           = ?,
         bill_no        = ?,
         isGSTBill      = ?,
         customer_id    = ?,
         taxable_amount = ?,
         ROUNDOFF       = ?,
         discount       = ?,
         final_amount   = ?,
         userid         = ?,
         updation_date  = NOW()
       WHERE id = ?`,
      [
        trans_type, cash_debit,
        date || new Date(), bill_no, isGSTBill, customer_id,
        taxable_total, exp.roundoff, exp.discount, final_total,
        req.user.id, tid,
      ]
    );

    await conn.query(
      `UPDATE \`cashcustdetail\` SET
         custname  = ?
       WHERE transaction_id = ?`,
      [
        customer_name_cash,
        tid
      ]
    );

    // ── Insert new line items + update stock ──────────────────────────────────
    for (const item of items) {
      const {
        product_id,
        qty = 0,
        rate = 0,
        taxable_amount = 0,
        CGST = 0,
        SGST = 0,
      } = item;

      await conn.query(
        `INSERT INTO transaction_items
           (transaction_id, product_id, qty, rate, taxable_amount, CGST, SGST,
            creation_date, updation_date)
         VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
        [tid, product_id, qty, rate, taxable_amount, CGST, SGST]
      );

      if (trans_type === "SI") {
        const sign = trans_type === "SI" ? -1 : +1;
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ?, s_qty = s_qty + ? WHERE id = ?",
          [sign * qty, qty, product_id]   // s_qty always increases (tracks total units sold/returned)
        );
      } else if (trans_type === "PI") {
        const sign = trans_type === "PI" ? +1 : -1;
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ?, p_qty = p_qty + ? WHERE id = ?",
          [sign * qty, qty, product_id]   // p_qty always increases (tracks total units purchased/returned)
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
    res.json({ success: true, message: "Transaction updated" , data: { "transaction_id" : tid }, });
  } catch (e) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/transactions/:transaction_id
// Cancel a bill or voucher — reverses stock/ledger, then deletes.
// SI/PI/SR/PR branches unchanged; CR/CP branch added.
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

    // Fetch items for stock reversal (empty for CR/CP — fine)
    const [items] = await conn.query(
      "SELECT * FROM transaction_items WHERE transaction_id = ?", [tid]
    );

    // Reverse stock
    for (const item of items) {
      if (master.trans_type === "SI") {
        await conn.query(
          "UPDATE product SET c_qty = c_qty + ?, s_qty = s_qty - ? WHERE id = ?",
          [item.qty, item.qty, item.product_id]
        );
      } else if (master.trans_type === "PI") {
        await conn.query(
          "UPDATE product SET c_qty = c_qty - ?, p_qty = p_qty - ? WHERE id = ?",
          [item.qty, item.qty, item.product_id]
        );
      }
    }

    // Reverse customer / voucher ledger balance
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
    } else if (master.trans_type === "CR") {          // NEW
      // Reversing a receipt = undo the credit entry, closing goes back up
      await conn.query(
        "UPDATE customer SET credit = credit - ?, closing = closing + ? WHERE id = ?",
        [master.final_amount, master.final_amount, master.customer_id]
      );
    } else if (master.trans_type === "CP") {           // NEW
      // Reversing a payment = undo the debit entry, closing goes back down
      await conn.query(
        "UPDATE customer SET debit = debit - ?, closing = closing - ? WHERE id = ?",
        [master.final_amount, master.final_amount, master.customer_id]
      );
    }

    // Delete items first (FK), then master.
    // transaction_adjustments rows (for CR/CP) clean up automatically via
    // ON DELETE CASCADE on voucher_transaction_id — no manual delete needed.
    await conn.query("DELETE FROM transaction_items WHERE transaction_id = ?", [tid]);
    await conn.query("DELETE FROM cashcustdetail WHERE transaction_id = ?", [tid]);
    await conn.query("DELETE FROM `transaction` WHERE id = ?", [tid]);

    await conn.commit();
    conn.release();
    res.json({ success: true, message: "Transaction deleted and stock/ledger reversed" });
  } catch (e) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;