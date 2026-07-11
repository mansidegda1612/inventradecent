/**
 * routes/reports/inventory.js
 *
 * Mount in your main router:
 *   const inventoryReports = require("./reports/inventory");
 *   app.use("/api/reports/inventory", inventoryReports);
 *
 * Endpoints
 * ──────────
 *   GET /api/reports/inventory/current-stock
 *   GET /api/reports/inventory/stock-movement?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   GET /api/reports/inventory/low-stock?threshold=10
 */

const express = require("express");
const router  = express.Router();
const db   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");    // your mysql2/promise pool


router.use(auth);        // your mysql2/promise pool

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


// ─────────────────────────────────────────────────────────────────────────────
// 1.  GET /current-stock
//     Returns every product with its closing qty and stock value,
//     plus a summary { totalStockValue, lowCount, outCount }.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/inventory/current-stock", async (req, res) => {
  try {
    const { page, limit } = req.query;

    const [rows] = await db.query(`
      SELECT
        p.id,
        p.name,
        c.name          AS category,
        p.barcode,
        p.purc_rate,
        p.sale_rate,
        p.o_qty,
        p.p_qty,
        p.s_qty,
        p.c_qty,
        p.lowstockqty,
        ROUND(p.c_qty * p.sale_rate, 2) AS stock_value
      FROM product p
      LEFT JOIN category c ON c.id = p.category
      ORDER BY p.name
    `);

    const totalStockValue = rows.reduce((s, r) => s + Number(r.stock_value || 0), 0);
    const lowCount        = rows.filter(r => Number(r.c_qty) > 0  && Number(r.c_qty) < r.lowstockqty).length;
    const outCount        = rows.filter(r => Number(r.c_qty) <= 0).length;

    const { data, pagination } = paginate(rows, page, limit);

    return res.json({
      rows: data,
      pagination,
      summary: {
        totalStockValue: parseFloat(totalStockValue.toFixed(2)),
        lowCount,
        outCount,
      },
    });
  } catch (err) {
    console.error("inventory/current-stock", err);
    return res.status(500).json({ error: "Failed to fetch stock data" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.  GET /stock-movement?from=YYYY-MM-DD&to=YYYY-MM-DD
//     For each product shows: opening qty, total purchased, total sold,
//     closing qty and the monetary value of sales / purchases in the period.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/inventory/stock-movement", async (req, res) => {
  const from = req.query.from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to   = req.query.to   || new Date().toISOString().slice(0, 10);
  const { page, limit } = req.query;

  try {
    const [rows] = await db.query(`
      SELECT
        p.id,
        p.name,
        c.name  AS category,
        p.o_qty,
        p.c_qty,
        p.lowstockqty,

        -- purchased qty & value in the date range
        COALESCE(
          SUM(CASE WHEN t.trans_type = 'PI' AND DATE(t.date) BETWEEN ? AND ?
                   THEN ti.qty END), 0
        )                                                           AS purchased,

        ROUND(COALESCE(
          SUM(CASE WHEN t.trans_type = 'PI' AND DATE(t.date) BETWEEN ? AND ?
                   THEN ti.qty * ti.rate END), 0
        ), 2)                                                       AS purchase_value,

        -- sold qty & value in the date range
        COALESCE(
          SUM(CASE WHEN t.trans_type = 'SI' AND DATE(t.date) BETWEEN ? AND ?
                   THEN ti.qty END), 0
        )                                                           AS sold,

        ROUND(COALESCE(
          SUM(CASE WHEN t.trans_type = 'SI' AND DATE(t.date) BETWEEN ? AND ?
                   THEN ti.qty * ti.rate END), 0
        ), 2)                                                       AS sale_value

      FROM product p
      LEFT JOIN category c ON c.id = p.category
      LEFT JOIN transaction_items ti ON ti.product_id = p.id
      LEFT JOIN \`transaction\`   t  ON t.id = ti.transaction_id
      GROUP BY p.id, p.name, c.name, p.o_qty, p.c_qty
      ORDER BY p.name
    `, [from, to, from, to, from, to, from, to]);

    const { data, pagination } = paginate(rows, page, limit);
    return res.json({ rows: data, pagination });
  } catch (err) {
    console.error("inventory/stock-movement", err);
    return res.status(500).json({ error: "Failed to fetch movement data" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3.  GET /low-stock?threshold=10
//     Returns products whose closing qty is below the threshold (default 10),
//     including out-of-stock items (c_qty <= 0).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/inventory/low-stock", async (req, res) => {
  const { page, limit } = req.query;

  try {
    const [rows] = await db.query(`
      SELECT
        p.id,
        p.name,
        c.name  AS category,
        p.barcode,
        p.sale_rate,
        p.c_qty,
        p.lowstockqty
      FROM product p
      LEFT JOIN category c ON c.id = p.category
      WHERE p.c_qty <= p.lowstockqty
      ORDER BY p.c_qty ASC, p.name ASC
    `);

    const lowCount = rows.filter(r => Number(r.c_qty) > 0).length;
    const outCount = rows.filter(r => Number(r.c_qty) <= 0).length;

    const { data, pagination } = paginate(rows, page, limit);

    return res.json({
      rows: data,
      pagination,
      summary: { lowCount, outCount },
    });
  } catch (err) {
    console.error("inventory/low-stock", err);
    return res.status(500).json({ error: "Failed to fetch low-stock data" });
  }
});

module.exports = router;