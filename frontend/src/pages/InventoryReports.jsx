import { useState } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Btn, Card, Badge, PageHeader } from "../components/ui";

export default function InventoryReports({ products, categories, sales, purchases }) {
  const [tab, setTab] = useState("stock");

  const stockMovement = products.map(p => {
    const sold   = sales.flatMap(s => s.items).filter(i => i.productId === p.id).reduce((a, b) => a + b.qty, 0);
    const bought = purchases.flatMap(s => s.items).filter(i => i.productId === p.id).reduce((a, b) => a + b.qty, 0);
    return { ...p, sold, bought };
  });

  return (
    <div>
      <PageHeader title="Inventory Reports" sub="Real-time stock tracking and movement analysis." />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["stock", "Current Stock"], ["low", "Low Stock"], ["movement", "Stock Movement"]].map(([id, label]) => (
          <Btn key={id} small variant={tab === id ? "primary" : "ghost"} onClick={() => setTab(id)}>{label}</Btn>
        ))}
      </div>

      {tab === "stock" && (
        <Card>
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
          <div style={{ textAlign: "right", padding: "12px 16px", borderTop: `1px solid ${C.border}`, fontWeight: 700 }}>
            Total Stock Value: <span style={{ color: C.green }}>{fmt(products.reduce((a, p) => a + p.qty * p.rate, 0))}</span>
          </div>
        </Card>
      )}

      {tab === "low" && (
        <Card>
          {products.filter(p => p.qty < 20).length === 0
            ? <p style={{ color: C.green, fontWeight: 600 }}>✓ All products are well-stocked.</p>
            : (
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
            )}
        </Card>
      )}

      {tab === "movement" && (
        <Card>
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
        </Card>
      )}
    </div>
  );
}
