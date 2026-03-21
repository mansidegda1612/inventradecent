import { useState } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Btn, Card, Badge, PageHeader, DateFilter, TableWrap } from "../components/ui";

function defaultFrom() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function InventoryReports({ products, categories, sales, purchases }) {
  const [tab, setTab]   = useState("stock");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo]     = useState(defaultTo);

  // Filter sales & purchases by date range
  const filteredSales     = sales.filter(s => s.date >= from && s.date <= to);
  const filteredPurchases = purchases.filter(p => p.date >= from && p.date <= to);

  const stockMovement = products.map(p => {
    const sold   = filteredSales.flatMap(s => s.items).filter(i => i.productId === p.id).reduce((a, b) => a + b.qty, 0);
    const bought = filteredPurchases.flatMap(s => s.items).filter(i => i.productId === p.id).reduce((a, b) => a + b.qty, 0);
    return { ...p, sold, bought };
  });

  const totalStockValue = products.reduce((a, p) => a + p.qty * p.rate, 0);

  return (
    <div>
      <PageHeader title="Inventory Reports" sub="Real-time stock tracking and movement analysis." />

      {/* Date filter */}
      <DateFilter
        from={from} to={to} setFrom={setFrom} setTo={setTo}
        totalLabel="Stock Value"
        totalValue={fmt(totalStockValue)}
      />

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["stock", "Current Stock"], ["low", "Low Stock"], ["movement", "Stock Movement"]].map(([id, label]) => (
          <Btn key={id} small variant={tab === id ? "primary" : "ghost"} onClick={() => setTab(id)}>{label}</Btn>
        ))}
      </div>

      {/* CURRENT STOCK */}
      {tab === "stock" && (
        <Card noPad>
          <TableWrap>
            <table>
              <thead>
                <tr><th>Product</th><th>Category</th><th>Barcode</th><th>Rate</th><th>Qty</th><th>Stock Value</th></tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const cat = categories.find(c => c.id === p.categoryId);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600, color: C.text }}>{p.name}</td>
                      <td><Badge color={C.blue}>{cat?.name}</Badge></td>
                      <td><span className="mono" style={{ fontSize: 12, color: C.accent }}>{p.barcode}</span></td>
                      <td>{fmt(p.rate)}</td>
                      <td><Badge color={p.qty === 0 ? C.red : p.qty < 10 ? C.amber : C.green}>{p.qty}</Badge></td>
                      <td style={{ fontWeight: 700, color: C.green }}>{fmt(p.qty * p.rate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          <div style={{ textAlign: "right", padding: "12px 20px", borderTop: `1px solid ${C.border}`, fontWeight: 700 }}>
            Total: <span style={{ color: C.green }}>{fmt(totalStockValue)}</span>
          </div>
        </Card>
      )}

      {/* LOW STOCK */}
      {tab === "low" && (
        <Card noPad>
          {products.filter(p => p.qty < 20).length === 0
            ? <div style={{ padding: 20 }}><p style={{ color: C.green, fontWeight: 600 }}>✓ All products are well-stocked.</p></div>
            : (
              <TableWrap>
                <table>
                  <thead><tr><th>Product</th><th>Qty Available</th><th>Rate</th><th>Status</th></tr></thead>
                  <tbody>
                    {products.filter(p => p.qty < 20).map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, color: C.text }}>{p.name}</td>
                        <td>{p.qty}</td>
                        <td>{fmt(p.rate)}</td>
                        <td><Badge color={p.qty === 0 ? C.red : C.amber}>{p.qty === 0 ? "Out of Stock" : "Low Stock"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
        </Card>
      )}

      {/* STOCK MOVEMENT */}
      {tab === "movement" && (
        <Card noPad>
          <TableWrap>
            <table>
              <thead><tr><th>Product</th><th>Opening</th><th>Purchased</th><th>Sold</th><th>Current</th></tr></thead>
              <tbody>
                {stockMovement.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: C.text }}>{p.name}</td>
                    <td style={{ color: C.muted }}>{p.qty - p.bought + p.sold}</td>
                    <td style={{ color: C.blue, fontWeight: 600 }}>+{p.bought}</td>
                    <td style={{ color: C.red, fontWeight: 600 }}>-{p.sold}</td>
                    <td><Badge color={p.qty === 0 ? C.red : C.green}>{p.qty}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
