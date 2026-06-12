/**
 * Account Reports API Routes
 * Base path: /api/reports/accounts
 *
 * Endpoints:
 *   GET /api/reports/accounts/ledger?accountId=&from=&to=
 *   GET /api/reports/accounts/outstanding?from=&to=
 *   GET /api/reports/accounts/supplier-balance?from=&to=
 *   GET /api/reports/accounts/summary?from=&to=
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

// ─── GET /ledger ─────────────────────────────────────────────────────────────
// Returns:
//   account  — account master row
//   txns     — all transactions for this account in the date range
//   opening  — opening balance
//   closing  — running closing balance

router.get("/reports/accounts/ledger", async (req, res) => {
  try {
    const { accountId, from, to } = req.query;
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

    // Fetch transactions
    const txns = await q(
      `SELECT t.id,
              t.trans_type,
              t.cash_debit,
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
    let running = Number(acc.opening) || 0;
    const txnsWithBalance = txns.map(t => {
      const amt = Number(t.final_amount) || 0;
      if (t.trans_type === "SI") {
        running += amt;   // sale increases receivable (Dr to customer)
      } else if (t.trans_type === "PI") {
        running -= amt;   // purchase increases payable
      }
      return { ...t, running_balance: parseFloat(running.toFixed(2)) };
    });

    res.json({
      account: acc,
      txns: txnsWithBalance,
      closing: parseFloat(running.toFixed(2)),
    });
  } catch (err) {
    console.error("Ledger error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /outstanding ────────────────────────────────────────────────────────
// Returns all customer accounts with their outstanding balance.
// Outstanding = opening + sum(sales final_amount) in period
// Groups: customers are those whose `group` row name contains "customer"
//         (or group.id = 15 based on your data — we'll use group name match)

router.get("/reports/accounts/outstanding", async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = from && to
      ? "AND DATE(t.date) BETWEEN ? AND ?"
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
      [...dateParams]
    );

    // outstanding = opening + period_sales  (positive = receivable)
    const data = rows.map(r => ({
      ...r,
      opening:      parseFloat(r.opening),
      period_sales: parseFloat(r.period_sales),
      outstanding:  parseFloat((Number(r.opening) + Number(r.period_sales)).toFixed(2)),
    }));

    const total_outstanding = data.reduce((s, r) => s + r.outstanding, 0);

    res.json({ data, total_outstanding: parseFloat(total_outstanding.toFixed(2)) });
  } catch (err) {
    console.error("Outstanding error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /supplier-balance ───────────────────────────────────────────────────
// Returns all supplier accounts with payable balance.

router.get("/reports/accounts/supplier-balance", async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = from && to
      ? "AND DATE(t.date) BETWEEN ? AND ?"
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
      [...dateParams]
    );

    const data = rows.map(r => ({
      ...r,
      opening:          parseFloat(r.opening),
      period_purchases: parseFloat(r.period_purchases),
      payable: (parseFloat(
        (Math.abs(Number(r.opening)) + Number(r.period_purchases)).toFixed(2)
      )) *(-1),
    }));

    const total_payable = data.reduce((s, r) => s + r.payable, 0);

    res.json({ data, total_payable: parseFloat(total_payable.toFixed(2)) });
  } catch (err) {
    console.error("Supplier balance error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /summary ─────────────────────────────────────────────────────────────
// Quick stats panel: total sales, total purchases, total outstanding, total payable
// within a date range.

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
         COUNT(CASE WHEN trans_type='SI' ${dateFilter} THEN 1 END)                       AS sale_count,
         COUNT(CASE WHEN trans_type='PI' ${dateFilter} THEN 1 END)                       AS purchase_count
       FROM transaction`,
      [...dateParams, ...dateParams]
    );

    res.json({
      total_sales:      parseFloat(stats.total_sales),
      total_purchases:  parseFloat(stats.total_purchases),
      sale_count:       stats.sale_count,
      purchase_count:   stats.purchase_count,
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /accounts-list ──────────────────────────────────────────────────────
// All customer + supplier accounts for dropdowns

router.get("/reports/accounts/accounts-list", async (_req, res) => {
  try {
    const rows = await q(
      `SELECT c.id, c.name, c.city, c.gstin, c.contact_no,
              COALESCE(c.opening, 0) AS opening,
              COALESCE(c.closing, 0) AS closing,
              g.name AS group_name
       FROM   customer c
       LEFT JOIN \`group\` g ON g.id = c.group
       ORDER  BY g.name, c.name`
    );
    res.json(rows);
  } catch (err) {
    console.error("Accounts list error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
