const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

router.use(auth);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/financial?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns a single payload with everything the Financial Reports page needs:
//
//  pl  — Profit & Loss
//    sales_revenue       total SI final_amount in period
//    sales_taxable       taxable portion of sales
//    sales_gst           CGST+SGST collected on sales
//    sales_discount      discounts given on sales
//    purchase_cost       total PI final_amount in period (COGS proxy)
//    purchase_taxable    taxable portion of purchases
//    purchase_gst        CGST+SGST paid on purchases
//    purchase_discount   discounts received on purchases
//    gross_profit        sales_revenue - purchase_cost
//    net_profit          gross_profit  (expand later for expenses)
//    bill_count_sales    number of SI bills
//    bill_count_purchases number of PI bills
//
//  bs  — Balance Sheet
//    assets:
//      stock_value         SUM(c_qty * purc_rate) from product
//      accounts_receivable SUM of debit-side customer closing balances (closing > 0)
//      cash_sales          cash sales revenue in period (cash_debit = C, trans_type = SI)
//    liabilities:
//      accounts_payable    SUM of credit-side supplier closing balances (closing < 0)
//      gst_payable         net GST collected - GST paid (output - input tax)
//    equity:
//      total_assets - total_liabilities
//
//  monthly — array of { month, sales, purchases, profit } for the chart
//
//  top_products — top 5 products by sales qty in period
//  top_customers — top 5 customers by sales value in period
// ─────────────────────────────────────────────────────────────────────────────

router.get("/reports/financial", async (req, res) => {
  const { from = "", to = "" } = req.query;

  try {
    // ── date params ──────────────────────────────────────────────────────────
    const dateWhere = (alias = "t") => {
      const parts = [];
      if (from) parts.push(`DATE(${alias}.date) >= ${pool.escape(from)}`);
      if (to)   parts.push(`DATE(${alias}.date) <= ${pool.escape(to)}`);
      return parts.length ? "AND " + parts.join(" AND ") : "";
    };

    // ── 1. Sales summary (SI) ─────────────────────────────────────────────
    const [salesRows] = await pool.query(`
      SELECT
        COUNT(DISTINCT t.id)              AS bill_count,
        COALESCE(SUM(t.final_amount),0)   AS revenue,
        COALESCE(SUM(t.taxable_amount),0) AS taxable,
        COALESCE(SUM(t.discount),0)       AS discount,
        COALESCE(SUM(ti.CGST),0)          AS cgst,
        COALESCE(SUM(ti.SGST),0)          AS sgst
      FROM \`transaction\` t
      LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
      WHERE t.trans_type = 'SI'
      ${dateWhere()}
    `);

    // ── 2. Purchase summary (PI) ──────────────────────────────────────────
    const [purchaseRows] = await pool.query(`
      SELECT
        COUNT(DISTINCT t.id)              AS bill_count,
        COALESCE(SUM(t.final_amount),0)   AS cost,
        COALESCE(SUM(t.taxable_amount),0) AS taxable,
        COALESCE(SUM(t.discount),0)       AS discount,
        COALESCE(SUM(ti.CGST),0)          AS cgst,
        COALESCE(SUM(ti.SGST),0)          AS sgst
      FROM \`transaction\` t
      LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
      WHERE t.trans_type = 'PI'
      ${dateWhere()}
    `);

    // ── 3. Cash sales (cash_debit = C, SI) ───────────────────────────────
    const [cashSalesRows] = await pool.query(`
      SELECT COALESCE(SUM(final_amount),0) AS cash_sales
      FROM \`transaction\` t
      WHERE trans_type = 'SI' AND cash_debit = 'C'
      ${dateWhere()}
    `);

    // ── 4. Stock value (current, not date-filtered – it's a snapshot) ────
    const [stockRows] = await pool.query(`
      SELECT COALESCE(SUM(c_qty * purc_rate),0) AS stock_value
      FROM product
    `);

    // ── 5. Accounts receivable: customers with positive closing balance ──
    const [arRows] = await pool.query(`
      SELECT COALESCE(SUM(closing),0) AS accounts_receivable
      FROM customer
      WHERE closing > 0
    `);

    // ── 6. Accounts payable: customers/suppliers with negative closing ───
    const [apRows] = await pool.query(`
      SELECT COALESCE(SUM(ABS(closing)),0) AS accounts_payable
      FROM customer
      WHERE closing < 0
    `);

    // ── 7. Monthly trend (last 12 months, or filtered range grouped by month)
    const monthFilter = from && to
      ? `WHERE DATE(t.date) >= ${pool.escape(from)} AND DATE(t.date) <= ${pool.escape(to)}`
      : `WHERE DATE(t.date) >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`;

    const [monthlyRows] = await pool.query(`
      SELECT
        DATE_FORMAT(t.date,'%Y-%m')         AS month,
        SUM(CASE WHEN t.trans_type='SI' THEN t.final_amount ELSE 0 END) AS sales,
        SUM(CASE WHEN t.trans_type='PI' THEN t.final_amount ELSE 0 END) AS purchases
      FROM \`transaction\` t
      ${monthFilter}
      GROUP BY DATE_FORMAT(t.date,'%Y-%m')
      ORDER BY month ASC
    `);

    // ── 8. Top 5 products by sales qty in period ─────────────────────────
    const [topProducts] = await pool.query(`
      SELECT
        p.name,
        COALESCE(SUM(ti.qty),0)                AS total_qty,
        COALESCE(SUM(ti.taxable_amount),0)     AS total_value
      FROM transaction_items ti
      JOIN \`transaction\` t ON t.id = ti.transaction_id
      JOIN product p         ON p.id = ti.product_id
      WHERE t.trans_type = 'SI'
      ${dateWhere()}
      GROUP BY p.id, p.name
      ORDER BY total_value DESC
      LIMIT 5
    `);

    // ── 9. Top 5 customers by sales value in period ───────────────────────
    // Split into two clean queries (credit customers + cash customers) then
    // merge in JS — avoids the only_full_group_by issue with COALESCE across joins.

    const [topCreditCustomers] = await pool.query(`
      SELECT
        c.name                          AS name,
        COALESCE(SUM(t.final_amount),0) AS total_value,
        COUNT(t.id)                     AS bill_count
      FROM \`transaction\` t
      JOIN customer c ON c.id = t.customer_id
      WHERE t.trans_type = 'SI' AND t.cash_debit = 'D'
      ${dateWhere()}
      GROUP BY t.customer_id, c.name
      ORDER BY total_value DESC
      LIMIT 5
    `);

    const [topCashCustomers] = await pool.query(`
      SELECT
        COALESCE(cd.CustName, 'Walk-in') AS name,
        COALESCE(SUM(t.final_amount),0)  AS total_value,
        COUNT(t.id)                      AS bill_count
      FROM \`transaction\` t
      LEFT JOIN cashcustdetail cd ON cd.transaction_id = t.id
      WHERE t.trans_type = 'SI' AND t.cash_debit = 'C'
      ${dateWhere()}
      GROUP BY cd.CustName
      ORDER BY total_value DESC
      LIMIT 5
    `);

    // merge, sort, take top 5
    const topCustomers = [...topCreditCustomers, ...topCashCustomers]
      .sort((a, b) => parseFloat(b.total_value) - parseFloat(a.total_value))
      .slice(0, 5);

    // ── assemble ─────────────────────────────────────────────────────────
    const s  = salesRows[0];
    const p  = purchaseRows[0];

    const salesRevenue    = parseFloat(s.revenue)  || 0;
    const purchaseCost    = parseFloat(p.cost)      || 0;
    const grossProfit     = salesRevenue - purchaseCost;

    const salesGST        = (parseFloat(s.cgst) + parseFloat(s.sgst)) || 0;
    const purchaseGST     = (parseFloat(p.cgst) + parseFloat(p.sgst)) || 0;
    const netGSTPayable   = salesGST - purchaseGST;   // output tax - input tax

    const stockValue      = parseFloat(stockRows[0].stock_value)         || 0;
    const ar              = parseFloat(arRows[0].accounts_receivable)    || 0;
    const ap              = parseFloat(apRows[0].accounts_payable)       || 0;
    const cashSales       = parseFloat(cashSalesRows[0].cash_sales)      || 0;

    const totalAssets     = stockValue + ar + cashSales;
    const totalLiabilities= ap + (netGSTPayable > 0 ? netGSTPayable : 0);
    const equity          = totalAssets - totalLiabilities;

    const monthly = monthlyRows.map(m => ({
      month:     m.month,
      sales:     parseFloat(m.sales)     || 0,
      purchases: parseFloat(m.purchases) || 0,
      profit:    (parseFloat(m.sales) || 0) - (parseFloat(m.purchases) || 0),
    }));

    res.json({
      success: true,
      data: {
        pl: {
          sales_revenue:        salesRevenue,
          sales_taxable:        parseFloat(s.taxable)   || 0,
          sales_gst:            salesGST,
          sales_discount:       parseFloat(s.discount)  || 0,
          bill_count_sales:     parseInt(s.bill_count)  || 0,
          purchase_cost:        purchaseCost,
          purchase_taxable:     parseFloat(p.taxable)   || 0,
          purchase_gst:         purchaseGST,
          purchase_discount:    parseFloat(p.discount)  || 0,
          bill_count_purchases: parseInt(p.bill_count)  || 0,
          gross_profit:         grossProfit,
          net_profit:           grossProfit,           // extend for operating expenses later
        },
        bs: {
          assets: {
            stock_value:          stockValue,
            accounts_receivable:  ar,
            cash_and_bank:        cashSales,
            total:                totalAssets,
          },
          liabilities: {
            accounts_payable:     ap,
            gst_payable:          netGSTPayable > 0 ? netGSTPayable : 0,
            total:                totalLiabilities,
          },
          equity,
        },
        monthly,
        top_products:  topProducts.map(r => ({ name: r.name, qty: parseFloat(r.total_qty)||0, value: parseFloat(r.total_value)||0 })),
        top_customers: topCustomers.map(r => ({ name: r.name, value: parseFloat(r.total_value)||0, bills: parseInt(r.bill_count)||0 })),
      },
    });
  } catch (e) {
    console.error("[/api/reports/financial]", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;