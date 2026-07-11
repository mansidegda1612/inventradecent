/**
 * Account Reports API Routes
 * Base path: /api/reports/accounts
 *
 * Endpoints:
 *   GET /api/reports/accounts/ledger?accountId=&from=&to=
 *   GET /api/reports/accounts/outstanding?from=&to=
 *   GET /api/reports/accounts/supplier-balance?from=&to=
 *   GET /api/reports/accounts/summary?from=&to=
 *   GET /api/reports/accounts/accounts-list
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UPDATE: all balance/outstanding/payable/summary calculations now also
 * factor in Cash/Bank Receipt (CR) and Cash/Bank Payment (CP) vouchers,
 * not just SI/PI bills. Ledger direction matches how transaction.js posts
 * to customer.debit/customer.credit:
 *   SI → debit ↑   (receivable increases)
 *   PI → credit ↑  (payable increases)
 *   CR → credit ↑, closing ↓  (a receipt reduces what they owe us)
 *   CP → debit ↑,  closing ↑  (a payment reduces what we owe them)
 * ─────────────────────────────────────────────────────────────────────────
 */
const router = require("express").Router();
const db   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");    // your mysql2/promise pool


router.use(auth);

// ─── helpers ────────────────────────────────────────────────────────────────

/** Run a parameterised query and return rows */
async function q(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
}

/**
 * Optional in-memory pagination.
 * If page & limit are NOT passed from the GUI, all rows are returned
 * (pagination.limit === total, totalPages === 1).
 */
function paginate(rows, page, limit) {
  const usePagination = page !== undefined && limit !== undefined;
  const total = rows.length;

  if (!usePagination) {
    return { data: rows, pagination: { total, page: 1, limit: total || 0, totalPages: total ? 1 : 0 } };
  }

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.max(parseInt(limit) || total, 1);
  const start = (pageNum - 1) * limitNum;
  const data = rows.slice(start, start + limitNum);

  return {
    data,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  };
}

// ─── GET /ledger ─────────────────────────────────────────────────────────────
// Returns:
//   account  — account master row
//   txns     — all transactions/vouchers for this account in the date range
//   opening  — opening balance
//   closing  — running closing balance

router.get("/reports/accounts/ledger", async (req, res) => {
  try {
    const { accountId, from, to, page, limit } = req.query;
    if (!accountId) return res.status(400).json({ error: "accountId is required" });

    // Fetch account
    const [acc] = await q(
      `SELECT c.id, c.name, c.city, c.gstin, c.contact_no,
              c.opening, c.credit, c.debit, c.closing,
              g.name AS group_name
       FROM   customer c
       LEFT JOIN \`group\` g ON g.id = c.group
       WHERE  c.id = ?`,
      [accountId]
    );
    if (!acc) return res.status(404).json({ error: "Account not found" });

    // Build date filter (optional)
    const dateFilter = from && to
      ? "AND DATE(t.date) BETWEEN ? AND ?"
      : "";
    const dateParams = from && to ? [from, to] : [];

    // Fetch transactions — SI/PI bills AND CR/CP vouchers, same row shape.
    // payment_mode/ref_no/narration are NULL for SI/PI, bill_no/isgstbill
    // are simply not applicable (NULL) for CR/CP — harmless either way.
    const txns = await q(
      `SELECT t.id,
              t.trans_type,
              t.cash_debit,
              t.payment_mode,
              t.ref_no,
              t.narration,
              DATE_FORMAT(t.date, '%Y-%m-%d') AS date,
              t.bill_no,
              t.isgstbill,
              t.taxable_amount,
              t.ROUNDOFF      AS roundoff,
              t.discount,
              t.final_amount,
              t.creation_date
       FROM   transaction t
       WHERE  t.customer_id = ?
         ${dateFilter}
       ORDER  BY t.date, t.id`,
      [accountId, ...dateParams]
    );

    // Compute running balance starting from opening
    // Direction matches customer.debit/credit posting in transaction.js:
    //   SI → +   PI → -   CR → -   CP → +
    let running = Number(acc.opening) || 0;
    const txnsWithBalance = txns.map(t => {
      const amt = Number(t.final_amount) || 0;
      if (t.trans_type === "SI") {
        running += amt;   // sale increases receivable (Dr to customer)
      } else if (t.trans_type === "PI") {
        running -= amt;   // purchase increases payable
      } else if (t.trans_type === "CR") {
        running -= amt;   // receipt reduces what they owe us
      } else if (t.trans_type === "CP") {
        running += amt;   // payment reduces what we owe them
      }
      return { ...t, running_balance: parseFloat(running.toFixed(2)) };
    });

    // Running balance must be computed over the FULL set first (page/limit
    // must never break the running-balance math), then we paginate for display.
    const { data: pagedTxns, pagination } = paginate(txnsWithBalance, page, limit);

    res.json({
      account: acc,
      txns: pagedTxns,
      pagination,
      closing: parseFloat(running.toFixed(2)),
    });
  } catch (err) {
    console.error("Ledger error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /outstanding ────────────────────────────────────────────────────────
// Returns all customer accounts with their outstanding balance.
// Outstanding = opening + period_sales(SI) - period_receipts(CR)
// Groups: customers are those whose `group` row name contains "customer"

router.get("/reports/accounts/outstanding", async (req, res) => {
  try {
    const { from, to, page, limit } = req.query;
    const dateFilter = from && to
      ? "AND DATE(t.date) BETWEEN ? AND ?"
      : "";
    const dateFilterR = from && to
      ? "AND DATE(tr.date) BETWEEN ? AND ?"
      : "";
    const dateParams = from && to ? [from, to] : [];

    const rows = await q(
      `SELECT c.id,
              c.name,
              c.city,
              c.contact_no,
              c.gstin,
              g.name                              AS group_name,
              COALESCE(c.opening, 0)              AS opening,
              COALESCE(SUM(
                CASE WHEN t.trans_type = 'SI' ${dateFilter} THEN t.final_amount ELSE 0 END
              ), 0)                               AS period_sales,
              COALESCE((
                SELECT SUM(tr.final_amount)
                FROM transaction tr
                WHERE tr.customer_id = c.id AND tr.trans_type = 'CR' ${dateFilterR}
              ), 0)                               AS period_receipts,
              COALESCE(c.closing, 0)              AS closing_balance
       FROM   customer c
       LEFT JOIN \`group\` g ON g.id = c.group
       LEFT JOIN transaction t
              ON t.customer_id = c.id AND t.trans_type = 'SI'
       WHERE  LOWER(g.name) LIKE '%customer%'
       GROUP  BY c.id, c.name, c.city, c.contact_no, c.gstin, g.name,
                 c.opening, c.closing
      HAVING closing_balance > 0 
       ORDER  BY c.name`,
      [...dateParams, ...dateParams]
    );

    // outstanding = opening + period_sales - period_receipts  (positive = receivable)
    const data = rows.map(r => ({
      ...r,
      opening:         parseFloat(r.opening),
      period_sales:    parseFloat(r.period_sales),
      period_receipts: parseFloat(r.period_receipts),
      outstanding:     parseFloat(
        (Number(r.opening) + Number(r.period_sales) - Number(r.period_receipts)).toFixed(2)
      ),
    }));

    const total_outstanding = data.reduce((s, r) => s + r.outstanding, 0);
    const { data: pagedData, pagination } = paginate(data, page, limit);

    res.json({ data: pagedData, pagination, total_outstanding: parseFloat(total_outstanding.toFixed(2)) });
  } catch (err) {
    console.error("Outstanding error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /supplier-balance ───────────────────────────────────────────────────
// Returns all supplier accounts with payable balance.
// Payable magnitude = |opening| + period_purchases(PI) - period_payments(CP)

router.get("/reports/accounts/supplier-balance", async (req, res) => {
  try {
    const { from, to, page, limit } = req.query;
    const dateFilter = from && to
      ? "AND DATE(t.date) BETWEEN ? AND ?"
      : "";
    const dateFilterP = from && to
      ? "AND DATE(tp.date) BETWEEN ? AND ?"
      : "";
    const dateParams = from && to ? [from, to] : [];

    const rows = await q(
      `SELECT c.id,
              c.name,
              c.city,
              c.contact_no,
              c.gstin,
              g.name                              AS group_name,
              COALESCE(c.opening, 0)              AS opening,
              COALESCE(SUM(
                CASE WHEN t.trans_type = 'PI' ${dateFilter} THEN t.final_amount ELSE 0 END
              ), 0)                               AS period_purchases,
              COALESCE((
                SELECT SUM(tp.final_amount)
                FROM transaction tp
                WHERE tp.customer_id = c.id AND tp.trans_type = 'CP' ${dateFilterP}
              ), 0)                               AS period_payments,
              COALESCE(c.closing, 0)              AS closing_balance
       FROM   customer c
       LEFT JOIN \`group\` g ON g.id = c.group
       LEFT JOIN transaction t
              ON t.customer_id = c.id AND t.trans_type = 'PI'
       WHERE  LOWER(g.name) LIKE '%supplier%'
       GROUP  BY c.id, c.name, c.city, c.contact_no, c.gstin, g.name,
                 c.opening, c.closing
       HAVING closing_balance < 0 
       ORDER  BY c.name`,
      [...dateParams, ...dateParams]
    );

    const data = rows.map(r => {
      const magnitude =
        Math.abs(Number(r.opening)) + Number(r.period_purchases) - Number(r.period_payments);
      return {
        ...r,
        opening:          parseFloat(r.opening),
        period_purchases: parseFloat(r.period_purchases),
        period_payments:  parseFloat(r.period_payments),
        payable: parseFloat(magnitude.toFixed(2)) * -1,
      };
    });

    const total_payable = data.reduce((s, r) => s + r.payable, 0);
    const { data: pagedData, pagination } = paginate(data, page, limit);

    res.json({ data: pagedData, pagination, total_payable: parseFloat(total_payable.toFixed(2)) });
  } catch (err) {
    console.error("Supplier balance error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /summary ─────────────────────────────────────────────────────────────
// Quick stats panel: total sales, purchases, receipts, payments within range.

router.get("/reports/accounts/summary", async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = from && to
      ? "AND DATE(date) BETWEEN ? AND ?"
      : "";
    const dateParams = from && to ? [from, to] : [];

    const [stats] = await q(
      `SELECT
         COALESCE(SUM(CASE WHEN trans_type='SI' ${dateFilter} THEN final_amount END), 0) AS total_sales,
         COALESCE(SUM(CASE WHEN trans_type='PI' ${dateFilter} THEN final_amount END), 0) AS total_purchases,
         COALESCE(SUM(CASE WHEN trans_type='CR' ${dateFilter} THEN final_amount END), 0) AS total_receipts,
         COALESCE(SUM(CASE WHEN trans_type='CP' ${dateFilter} THEN final_amount END), 0) AS total_payments,
         COUNT(CASE WHEN trans_type='SI' ${dateFilter} THEN 1 END)                       AS sale_count,
         COUNT(CASE WHEN trans_type='PI' ${dateFilter} THEN 1 END)                       AS purchase_count,
         COUNT(CASE WHEN trans_type='CR' ${dateFilter} THEN 1 END)                       AS receipt_count,
         COUNT(CASE WHEN trans_type='CP' ${dateFilter} THEN 1 END)                       AS payment_count
       FROM transaction`,
      [
        ...dateParams, ...dateParams, ...dateParams, ...dateParams,
        ...dateParams, ...dateParams, ...dateParams, ...dateParams,
      ]
    );

    res.json({
      total_sales:      parseFloat(stats.total_sales),
      total_purchases:  parseFloat(stats.total_purchases),
      total_receipts:   parseFloat(stats.total_receipts),
      total_payments:   parseFloat(stats.total_payments),
      sale_count:       stats.sale_count,
      purchase_count:   stats.purchase_count,
      receipt_count:    stats.receipt_count,
      payment_count:    stats.payment_count,
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;