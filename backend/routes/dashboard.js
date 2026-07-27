const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");
const loadContext = require("../middleware/loadContext");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");

const requireRight = require("../middleware/requireRight");

router.use(auth, loadContext, requireActiveSubscription);
// Every endpoint here backs the single Dashboard page. The requireRight must
// be PATH-SCOPED ("/dashboard"), not a blanket router.use — all these routers
// share the "/api" mount, so a path-less gate would also fire on unrelated
// routes merely passing through this router before reaching their own.
router.use("/dashboard", requireRight("dashboard.view"));


router.get("/dashboard/stats", async (req, res) => {
  // #swagger.tags = ['Dashboard']
  const orgId = req.ctx.orgId;
  try {
    // Total counts
    const [[{ totalProducts }]] = await pool.query(
      "SELECT COUNT(*) AS totalProducts FROM product WHERE org_id = ?", [orgId]
    );
    const [[{ totalCustomers }]] = await pool.query(
      "SELECT COUNT(*) AS totalCustomers FROM customer WHERE org_id = ?", [orgId]
    );
    // Count distinct sale bills only
    const [[{ totalBills }]] = await pool.query(
      "SELECT COUNT(*) AS totalBills FROM `transaction` WHERE org_id = ? AND trans_type = 'SI'", [orgId]
    );

    // Today's sales — trans_type 'SI'
    const [[{ todaySales }]] = await pool.query(
      `SELECT COALESCE(SUM(final_amount), 0) AS todaySales
       FROM \`transaction\`
       WHERE org_id = ? AND trans_type = 'SI' AND DATE(date) = CURDATE()`,
      [orgId]
    );

    // Today's purchases — trans_type 'PI'
    const [[{ todayPurchases }]] = await pool.query(
      `SELECT COALESCE(SUM(final_amount), 0) AS todayPurchases
       FROM \`transaction\`
       WHERE org_id = ? AND trans_type = 'PI' AND DATE(date) = CURDATE()`,
      [orgId]
    );

    // This month's sales
    const [[{ monthSales }]] = await pool.query(
      `SELECT COALESCE(SUM(final_amount), 0) AS monthSales
       FROM \`transaction\`
       WHERE org_id = ? AND trans_type = 'SI'
         AND MONTH(date) = MONTH(CURDATE())
         AND YEAR(date)  = YEAR(CURDATE())`,
      [orgId]
    );

    // Total receivable — customers with positive closing balance
    const [[{ totalReceivable }]] = await pool.query(
      "SELECT COALESCE(SUM(closing), 0) AS totalReceivable FROM customer WHERE org_id = ? AND closing > 0", [orgId]
    );
    //totalPayable - customer with Nagative closing balance
    const [[{ totalPayable }]] = await pool.query(
      "SELECT COALESCE(SUM(closing), 0) AS totalPayable FROM customer WHERE org_id = ? AND closing < 0", [orgId]
    );

    // Low-stock count — products where c_qty <= 5
    const [[{ lowStockCount }]] = await pool.query(
      "SELECT COUNT(*) AS lowStockCount FROM product WHERE org_id = ? AND c_qty <= lowstockqty", [orgId]
    );

    res.json({
      success: true,
      data: {
        totalProducts,
        totalCustomers,
        totalBills,
        todaySales,
        todayPurchases,
        monthSales,
        totalReceivable,
        totalPayable,
        lowStockCount,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


router.get("/dashboard/sales-chart", async (req, res) => {
  // #swagger.tags = ['Dashboard']
  const { period = "week" } = req.query;
  const orgId = req.ctx.orgId;
  try {
    let rows;
    if (period === "month") {
      [rows] = await pool.query(
        `SELECT DATE_FORMAT(date, '%Y-%m') AS label,
                COALESCE(SUM(final_amount), 0) AS total
         FROM \`transaction\`
         WHERE org_id = ? AND trans_type = 'SI'
           AND date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY label
         ORDER BY label ASC`,
        [orgId]
      );
    } else {
      [rows] = await pool.query(
        `SELECT DATE(date) AS label,
                COALESCE(SUM(final_amount), 0) AS total
         FROM \`transaction\`
         WHERE org_id = ? AND trans_type = 'SI'
           AND DATE(date) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY label
         ORDER BY label ASC`,
        [orgId]
      );
    }
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


router.get("/dashboard/top-products", async (req, res) => {
  // #swagger.tags = ['Dashboard']
  try {
    const [rows] = await pool.query(
      `SELECT p.name,
              SUM(ti.qty)              AS total_sold,
              SUM(ti.taxable_amount)   AS total_revenue
       FROM transaction_items ti
       JOIN \`transaction\` t  ON ti.transaction_id = t.id
       JOIN product         p  ON ti.product_id     = p.id
       WHERE t.org_id = ? AND t.trans_type = 'SI'
       GROUP BY ti.product_id, p.name
       ORDER BY total_sold DESC
       LIMIT 5`,
      [req.ctx.orgId]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


router.get("/dashboard/top-customers", async (req, res) => {
  // #swagger.tags = ['Dashboard']
  try {
    const [rows] = await pool.query(
      `SELECT c.name,
              SUM(t.final_amount) AS total_purchase
       FROM \`transaction\` t
       JOIN customer c ON t.customer_id = c.id
       WHERE t.org_id = ? AND t.trans_type = 'SI'
       GROUP BY t.customer_id, c.name
       ORDER BY total_purchase DESC
       LIMIT 5`,
      [req.ctx.orgId]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


router.get("/dashboard/recent-transactions", async (req, res) => {
  // #swagger.tags = ['Dashboard']
  try {
    const [rows] = await pool.query(
      `SELECT t.id                                    AS transaction_id,
              t.bill_no,
              DATE_FORMAT(t.date, '%d-%m-%Y')         AS date,
              COALESCE(c.name, cd.CustName, 'Cash')   AS customer_name,
              t.final_amount                          AS total_amount,
              COUNT(ti.id)                            AS item_count
       FROM \`transaction\` t
       LEFT JOIN customer        c  ON t.customer_id = c.id
       LEFT JOIN cashcustdetail  cd ON cd.transaction_id = t.id
       LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
       WHERE t.org_id = ? AND t.trans_type = 'SI'
       GROUP BY t.id, t.bill_no, t.date, c.name, cd.CustName, t.final_amount
       ORDER BY t.date DESC
       LIMIT 10`,
      [req.ctx.orgId]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


router.get("/dashboard/low-stock", async (req, res) => {
  // #swagger.tags = ['Dashboard']
  try {
    const [rows] = await pool.query(
      `SELECT id, name, c_qty
       FROM product
       WHERE org_id = ? AND c_qty <= lowstockqty
       ORDER BY c_qty ASC`,
      [req.ctx.orgId]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
