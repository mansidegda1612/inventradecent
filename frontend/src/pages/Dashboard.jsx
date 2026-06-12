import { useEffect, useState } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Card, StatCard, Badge, PageHeader, TableWrap } from "../components/ui";
import { callAPI } from "../utils/callserver";

export default function Dashboard({ products, sales, purchases, accounts }) {
  const [stats, setStats]               = useState(null);
  const [recentSales, setRecentSales]   = useState([]);
  const [lowStock, setLowStock]         = useState([]);
  const [loading, setLoading]           = useState(true);

  // Fetch all dashboard data on mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Key stat cards
      const statsRes = await callAPI("dashboard/stats", "GET");
      if (statsRes.success) setStats(statsRes.data);

      // 2. Recent sales (last 10 bills)
      const salesRes = await callAPI("dashboard/recent-transactions", "GET");
      if (salesRes.success) setRecentSales(salesRes.data ?? []);

      // 3. Low-stock products
      const stockRes = await callAPI("dashboard/low-stock", "GET");
      if (stockRes.success) setLowStock(stockRes.data ?? []);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Derived values — fall back to 0 while loading
  const todaySales      = stats?.todaySales      ?? 0;
  const todayPurchases  = stats?.todayPurchases  ?? 0;
  const totalPayable    = stats?.totalPayable    ?? 0;
  const totalReceivable = stats?.totalReceivable ?? 0;

  return (
    <div>
      <PageHeader title="Dashboard" sub="Welcome back — here's your business at a glance." />

      {/* Stat cards — responsive via CSS class */}
      <div className="stat-grid">
        <StatCard
          label="Today's Sales"
          value={fmt(todaySales)}
          color={C.green}
          bg={C.greenBg}
          icon="↑"
          sub="Revenue today"
        />
        <StatCard
          label="Today's Purchase"
          value={fmt(todayPurchases)}
          color={C.blue}
          bg={C.blueBg}
          icon="↓"
          sub="Purchased today"
        />
        <StatCard
          label="Total Payable"
          value={fmt(Math.abs(totalPayable))}
          color={C.red}
          bg={C.redBg}
          icon="↓"
          sub="To Supplier"
        />
        <StatCard
          label="Total Receivable"
          value={fmt(totalReceivable)}
          color={C.green}
          bg={C.greenBg}
          icon="↑"
          sub="From customers"
        />
      </div>

      {/* Bottom row */}
      <div className="two-col">
        {/* Recent Sales Table */}
        <Card title="Recent Sales" noPad>
          <TableWrap>
            <table style={{textAlign: "left"}}>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={4} style={{ color: C.hint, textAlign: "center", padding: "16px 0" }}>
                      No recent sales found.
                    </td>
                  </tr>
                ) : (
                  recentSales.map((s) => (
                    <tr key={s.transaction_id}>
                      <td>
                        <span className="mono" style={{ color: C.accent, fontSize: 12 }}>
                          {s.bill_no}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: C.text }}>{s.customer_name}</td>
                      <td style={{ color: C.hint }}>{s.date}</td>
                      <td style={{ color: C.green, fontWeight: 700 }}>{fmt(s.total_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        {/* Low Stock Alert */}
        <Card title="Low Stock Alert">
          {lowStock.length === 0 ? (
            <p style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>
              ✓ All Product stock levels healthy
            </p>
          ) : (
            lowStock.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 0",
                  borderBottom: `1px solid ${C.borderLight}`,
                }}
              >
                <span style={{ fontSize: 13, color: C.sub }}>{p.name}</span>
                <Badge color={p.c_qty === 0 ? C.red : C.amber}>{p.c_qty} units</Badge>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}