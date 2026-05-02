import { useEffect } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Card, StatCard, Badge, PageHeader, TableWrap } from "../components/ui";

export default function Dashboard({ products, sales, purchases, accounts }) {
   // Fetch data on component mount
   useEffect(() => {
     fetchDashbordData();
   }, []);
  const fetchDashbordData = async ()=> {

  };
  return (
    <div>
      <PageHeader title="Dashboard" sub="Welcome back — here's your business at a glance." />

      {/* Stat cards — responsive via CSS class */}
      <div className="stat-grid">
        <StatCard label="Today's Sales"     value={fmt(0)}     color={C.green} bg={C.greenBg} icon="↑" sub="Revenue today" />
        <StatCard label="Today's Purchase"  value={fmt(0)} color={C.blue}  bg={C.blueBg}  icon="↓" sub="Purchased today" />
        <StatCard label="Total Payable" value={fmt(0)}     color={C.red} bg={C.redBg}  icon="↓" sub="To Supplier" />
        <StatCard label="Total Receivable"       value={fmt(0)}    color={C.green}   bg={C.greenBg} icon="↑" sub="From customers" />
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
                {[].map(s => {
                  return (
                    <tr key={s.id}>
                      <td><span className="mono" style={{ color: C.accent, fontSize: 12 }}>{s.invoiceNo}</span></td>
                      <td style={{ fontWeight: 600, color: C.text }}>{customername}</td>
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
          {[].map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 13, color: C.sub }}>{p.name}</span>
              <Badge color={p.qty === 0 ? C.red : C.amber}>{p.qty} units</Badge>
            </div>
          ))}
          {[].length === 0 && (
            <p style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>✓ All Product stock levels healthy</p>
          )}
        </Card>
      </div>
    </div>
  );
}
