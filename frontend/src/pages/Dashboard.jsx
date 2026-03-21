import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Card, StatCard, Badge, PageHeader, TableWrap } from "../components/ui";

export default function Dashboard({ products, sales, purchases, accounts }) {
  const today          = new Date().toISOString().slice(0, 10);
  const todaySales     = sales.filter(s => s.date === today).reduce((a, b) => a + b.total, 0);
  const todayPurchases = purchases.filter(s => s.date === today).reduce((a, b) => a + b.total, 0);
  const stockValue     = products.reduce((a, p) => a + p.qty * p.rate, 0);
  const outstanding    = accounts.filter(a => a.type === "customer").reduce((s, a) => s + a.opening, 0);
  const recentSales    = [...sales].sort((a, b) => b.id - a.id).slice(0, 5);

  return (
    <div>
      <PageHeader title="Dashboard" sub="Welcome back — here's your business at a glance." />

      {/* Stat cards — responsive via CSS class */}
      <div className="stat-grid">
        <StatCard label="Today's Sales"     value={fmt(todaySales)}     color={C.green} bg={C.greenBg} icon="↑" sub="Revenue today" />
        <StatCard label="Today's Purchase"  value={fmt(todayPurchases)} color={C.blue}  bg={C.blueBg}  icon="↓" sub="Purchased today" />
        <StatCard label="Total Stock Value" value={fmt(stockValue)}     color={C.amber} bg={C.amberBg} icon="⬡" sub={`${products.length} products`} />
        <StatCard label="Outstanding"       value={fmt(outstanding)}    color={C.red}   bg={C.redBg}   icon="◉" sub="From customers" />
      </div>

      {/* Bottom row */}
      <div className="two-col">
        <Card title="Recent Sales" noPad>
          <TableWrap>
            <table>
              <thead>
                <tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {recentSales.map(s => {
                  const cust = accounts.find(a => a.id === s.customerId);
                  return (
                    <tr key={s.id}>
                      <td><span className="mono" style={{ color: C.accent, fontSize: 12 }}>{s.invoiceNo}</span></td>
                      <td style={{ fontWeight: 600, color: C.text }}>{cust?.name || "—"}</td>
                      <td style={{ color: C.hint }}>{s.date}</td>
                      <td style={{ color: C.green, fontWeight: 700 }}>{fmt(s.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        <Card title="Low Stock Alert">
          {products.filter(p => p.qty < 10).map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 13, color: C.sub }}>{p.name}</span>
              <Badge color={p.qty === 0 ? C.red : C.amber}>{p.qty} units</Badge>
            </div>
          ))}
          {products.filter(p => p.qty < 10).length === 0 && (
            <p style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>✓ All stock levels healthy</p>
          )}
        </Card>
      </div>
    </div>
  );
}
