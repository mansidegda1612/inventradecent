const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

router.use(auth);


router.get("/dashboard/stats", async (req, res) => {
  // #swagger.tags = ['Dashboard']
  try {
    // Total counts
    const [[{ totalProducts }]] = await pool.query(
      "SELECT COUNT(*) AS totalProducts FROM product"
    );
    const [[{ totalCustomers }]] = await pool.query(
      "SELECT COUNT(*) AS totalCustomers FROM customer"
    );
    // Count distinct sale bills only
    const [[{ totalBills }]] = await pool.query(
      "SELECT COUNT(*) AS totalBills FROM `transaction` WHERE trans_type = 'SI'"
    );

    // Today's sales — trans_type 'SI'
    const [[{ todaySales }]] = await pool.query(
      `SELECT COALESCE(SUM(final_amount), 0) AS todaySales
       FROM \`transaction\`
       WHERE trans_type = 'SI' AND DATE(date) = CURDATE()`
    );

    // Today's purchases — trans_type 'PI'
    const [[{ todayPurchases }]] = await pool.query(
      `SELECT COALESCE(SUM(final_amount), 0) AS todayPurchases
       FROM \`transaction\`
       WHERE trans_type = 'PI' AND DATE(date) = CURDATE()`
    );

    // This month's sales
    const [[{ monthSales }]] = await pool.query(
      `SELECT COALESCE(SUM(final_amount), 0) AS monthSales
       FROM \`transaction\`
       WHERE trans_type = 'SI'
         AND MONTH(date) = MONTH(CURDATE())
         AND YEAR(date)  = YEAR(CURDATE())`
    );

    // Total receivable — customers with positive closing balance
    const [[{ totalReceivable }]] = await pool.query(
      "SELECT COALESCE(SUM(closing), 0) AS totalReceivable FROM customer WHERE closing > 0"
    );
    //totalPayable - customer with Nagative closing balance
    const [[{ totalPayable }]] = await pool.query(
      "SELECT COALESCE(SUM(closing), 0) AS totalPayable FROM customer WHERE closing < 0"
    );

    // Low-stock count — products where c_qty <= 5
    const [[{ lowStockCount }]] = await pool.query(
      "SELECT COUNT(*) AS lowStockCount FROM product WHERE c_qty <= lowstockqty"
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
  try {
    let rows;
    if (period === "month") {
      [rows] = await pool.query(
        `SELECT DATE_FORMAT(date, '%Y-%m') AS label,
                COALESCE(SUM(final_amount), 0) AS total
         FROM \`transaction\`
         WHERE trans_type = 'SI'
           AND date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY label
         ORDER BY label ASC`
      );
    } else {
      [rows] = await pool.query(
        `SELECT DATE(date) AS label,
                COALESCE(SUM(final_amount), 0) AS total
         FROM \`transaction\`
         WHERE trans_type = 'SI'
           AND DATE(date) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY label
         ORDER BY label ASC`
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
       WHERE t.trans_type = 'SI'
       GROUP BY ti.product_id, p.name
       ORDER BY total_sold DESC
       LIMIT 5`
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
       WHERE t.trans_type = 'SI'
       GROUP BY t.customer_id, c.name
       ORDER BY total_purchase DESC
       LIMIT 5`
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
       WHERE t.trans_type = 'SI'
       GROUP BY t.id, t.bill_no, t.date, c.name, cd.CustName, t.final_amount
       ORDER BY t.date DESC
       LIMIT 10`
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
       WHERE c_qty <= lowstockqty
       ORDER BY c_qty ASC`
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
