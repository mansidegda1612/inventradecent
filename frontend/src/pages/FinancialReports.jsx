import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Card, PageHeader } from "../components/ui";

function Row({ label, value, color, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: `1px solid ${C.borderLight}` }}>
      <span style={{ color: bold ? C.text : C.muted, fontSize: 13, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || C.text, fontSize: bold ? 15 : 13 }}>
        {fmt(Math.abs(value))}
      </span>
    </div>
  );
}

export default function FinancialReports({ sales, purchases, products }) {
  const totalSales     = sales.reduce((a, s) => a + s.total, 0);
  const totalPurchases = purchases.reduce((a, p) => a + p.total, 0);
  const grossProfit    = totalSales - totalPurchases;
  const expenses       = totalPurchases * 0.05;
  const netProfit      = grossProfit - expenses;
  const stockValue     = products.reduce((a, p) => a + p.qty * p.rate, 0);

  return (
    <div>
      <PageHeader title="Financial Reports" sub="Profit & Loss and Balance Sheet overview." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* P&L */}
        <Card title="Profit & Loss Statement">
          <Row label="Total Sales Revenue"        value={totalSales}     color={C.green} />
          <Row label="Cost of Goods Sold"          value={totalPurchases} color={C.red} />
          <Row label="Gross Profit"                value={grossProfit}    color={grossProfit >= 0 ? C.green : C.red} bold />
          <Row label="Operating Expenses (est. 5%)" value={expenses}     color={C.red} />
          <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "14px 16px", marginTop: 10,
            background: netProfit >= 0 ? C.greenBg : C.redBg,
            borderRadius: 10,
            border: `1px solid ${netProfit >= 0 ? C.green : C.red}30`,
          }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: C.text }}>Net Profit</span>
            <span style={{ fontWeight: 900, fontSize: 20, color: netProfit >= 0 ? C.green : C.red }}>
              {fmt(Math.abs(netProfit))}
            </span>
          </div>
        </Card>

        {/* Balance Sheet */}
        <Card title="Balance Sheet Overview">
          <p style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Assets</p>
          <Row label="Stock / Inventory"    value={stockValue}          color={C.green} />
          <Row label="Accounts Receivable"  value={totalSales * 0.3}    color={C.blue} />
          <Row label="Cash & Bank"          value={totalSales * 0.7}    color={C.blue} />
          <Row label="Total Assets"         value={stockValue + totalSales} color={C.green} bold />

          <p style={{ fontSize: 11, fontWeight: 700, color: C.red, margin: "16px 0 10px", textTransform: "uppercase", letterSpacing: ".08em" }}>Liabilities</p>
          <Row label="Accounts Payable"     value={totalPurchases * 0.3} color={C.red} />
          <Row label="Outstanding Expenses" value={expenses}             color={C.red} />

          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 0", marginTop: 4 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: C.text }}>Owner's Equity</span>
            <span style={{ fontWeight: 800, fontSize: 16, color: C.accent }}>
              {fmt(stockValue + totalSales - totalPurchases * 0.3 - expenses)}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
