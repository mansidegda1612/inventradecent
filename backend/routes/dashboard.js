const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

router.use(auth);

// GET /api/dashboard/stats  — key numbers for the home dashboard cards
router.get("/dashboard/stats", async (req, res) => {
 // #swagger.tags = ['Dashboard']
  try {
    const [[{ totalProducts }]] = await pool.query("SELECT COUNT(*) AS totalProducts FROM product");
    const [[{ totalCustomers }]] = await pool.query("SELECT COUNT(*) AS totalCustomers FROM customer");
    const [[{ totalBills }]]    = await pool.query("SELECT COUNT(DISTINCT transaction_id) AS totalBills FROM transaction");

    const [[{ todaySales }]] = await pool.query(
      "SELECT COALESCE(SUM(final_amount),0) AS todaySales FROM transaction WHERE DATE(date)=CURDATE() AND s_qty > 0"
    );
    const [[{ monthSales }]] = await pool.query(
      "SELECT COALESCE(SUM(final_amount),0) AS monthSales FROM transaction WHERE MONTH(date)=MONTH(CURDATE()) AND YEAR(date)=YEAR(CURDATE()) AND s_qty > 0"
    );
    const [[{ totalReceivable }]] = await pool.query(
      "SELECT COALESCE(SUM(closing),0) AS totalReceivable FROM customer WHERE closing > 0"
    );
    const [[{ lowStockCount }]] = await pool.query(
      "SELECT COUNT(*) AS lowStockCount FROM product WHERE c_qty <= 5"
    );

    res.json({
      success: true,
      data: { totalProducts, totalCustomers, totalBills, todaySales, monthSales, totalReceivable, lowStockCount },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/dashboard/sales-chart  — last 7 days or 12 months daily/monthly sale totals
router.get("/dashboard/sales-chart", async (req, res) => {
 // #swagger.tags = ['Dashboard']
  const { period = "week" } = req.query; // week | month
  try {
    let rows;
    if (period === "month") {
      [rows] = await pool.query(
        `SELECT DATE_FORMAT(date,'%Y-%m') AS label, COALESCE(SUM(final_amount),0) AS total
         FROM transaction WHERE s_qty > 0 AND date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY label ORDER BY label ASC`
      );
    } else {
      [rows] = await pool.query(
        `SELECT DATE(date) AS label, COALESCE(SUM(final_amount),0) AS total
         FROM transaction WHERE s_qty > 0 AND DATE(date) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY label ORDER BY label ASC`
      );
    }
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/dashboard/top-products  — top 5 products by qty sold
router.get("/dashboard/top-products", async (req, res) => {
 // #swagger.tags = ['Dashboard']
  try {
    const [rows] = await pool.query(
      `SELECT p.name, SUM(t.s_qty) AS total_sold, SUM(t.final_amount) AS total_revenue
       FROM transaction t JOIN product p ON t.product_id=p.id
       WHERE t.s_qty > 0
       GROUP BY t.product_id, p.name ORDER BY total_sold DESC LIMIT 5`
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/dashboard/top-customers  — top 5 customers by purchase value
router.get("/dashboard/top-customers", async (req, res) => {
 // #swagger.tags = ['Dashboard']
  try {
    const [rows] = await pool.query(
      `SELECT c.name, SUM(t.final_amount) AS total_purchase
       FROM transaction t JOIN customer c ON t.customer_id=c.id
       WHERE t.s_qty > 0
       GROUP BY t.customer_id, c.name ORDER BY total_purchase DESC LIMIT 5`
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/dashboard/recent-transactions  — last 10 bills
router.get("/dashboard/recent-transactions", async (req, res) => {
 // #swagger.tags = ['Dashboard']
  try {
    const [rows] = await pool.query(
      `SELECT t.transaction_id, t.bill_no, t.date, c.name AS customer_name,
              SUM(t.final_amount) AS total_amount, COUNT(t.id) AS item_count
       FROM transaction t LEFT JOIN customer c ON t.customer_id=c.id
       GROUP BY t.transaction_id, t.bill_no, t.date, c.name
       ORDER BY t.date DESC LIMIT 10`
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
