import { useEffect, useState } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Card, StatCard, Badge, PageHeader, TableWrap } from "../components/ui";
import { callAPI } from "../utils/callserver";

/* ─── Skeleton primitives ─────────────────────────────────────── */

// Inject the keyframe once (used by .dash-bone in responsive.css)
if (typeof document !== "undefined" && !document.getElementById("__shimmer_kf")) {
  const style = document.createElement("style");
  style.id = "__shimmer_kf";
  style.textContent = `@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`;
  document.head.appendChild(style);
}

function Bone({ w = "100%", h = 14, style: extra = {} }) {
  return <span className="dash-bone" style={{ width: w, height: h, ...extra }} />;
}

/* Skeleton for a single StatCard */
function StatCardSkeleton() {
  return (
    <div className="dash-statcard-skeleton">
      <Bone w={80} h={11} />
      <Bone w={120} h={28} />
      <Bone w={100} h={11} />
    </div>
  );
}

/* Skeleton row for the Recent Sales table */
function TableRowSkeleton({ cols = 4 }) {
  const widths = ["60px", "120px", "80px", "70px"];
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="dash-skeleton-td">
          <Bone w={widths[i] ?? "80px"} h={12} />
        </td>
      ))}
    </tr>
  );
}

/* ─── Dashboard ───────────────────────────────────────────────── */

export default function Dashboard({ products, sales, purchases, accounts }) {
  const [stats, setStats]             = useState(null);
  const [recentSales, setRecentSales] = useState([]);
  const [lowStock, setLowStock]       = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const statsRes = await callAPI("dashboard/stats", "GET");
      if (statsRes.success) setStats(statsRes.data);

      const salesRes = await callAPI("dashboard/recent-transactions", "GET");
      if (salesRes.success) setRecentSales(salesRes.data ?? []);

      const stockRes = await callAPI("dashboard/low-stock", "GET");
      if (stockRes.success) setLowStock(stockRes.data ?? []);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const todaySales      = stats?.todaySales      ?? 0;
  const todayPurchases  = stats?.todayPurchases  ?? 0;
  const totalPayable    = stats?.totalPayable    ?? 0;
  const totalReceivable = stats?.totalReceivable ?? 0;

  return (
    <div>
      <PageHeader title="Dashboard" sub="Welcome back — here's your business at a glance." />

      {/* Stat cards */}
      <div className="stat-grid">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Bottom row */}
      <div className="two-col">
        {/* Recent Sales Table */}
        <Card title="Recent Sales" noPad className="dash-card-scroll">
          <TableWrap>
            <table className="dash-table-left">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)
                ) : recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="dash-empty-cell">
                      No recent sales found.
                    </td>
                  </tr>
                ) : (
                  recentSales.map((s) => (
                    <tr key={s.transaction_id}>
                      <td>
                        <span className="mono u-accent u-fs12">
                          {s.bill_no}
                        </span>
                      </td>
                      <td className="u-text u-bold">{s.customer_name}</td>
                      <td className="u-hint">{s.date}</td>
                      <td className="u-green u-bold-700">{fmt(s.total_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        {/* Low Stock Alert */}
        <Card title="Low Stock Alert" className="dash-card-scroll">
          {loading ? (
            <div className="dash-lowstock-list">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="dash-lowstock-row">
                  <Bone w={140} h={12} />
                  <Bone w={60} h={22} style={{ borderRadius: 20 }} />
                </div>
              ))}
            </div>
          ) : lowStock.length === 0 ? (
            <p className="dash-healthy-msg">
              ✓ All Product stock levels healthy
            </p>
          ) : (
            lowStock.map((p) => (
              <div key={p.id} className="dash-lowstock-row">
                <span className="dash-lowstock-name">{p.name}</span>
                <Badge color={C.red}>{p.c_qty} units</Badge>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}