import { useState } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Btn, Card, Badge, Modal, Field, PageHeader, TableWrap } from "../components/ui";

export default function PurchaseEntry({ purchases, setPurchases, products, setProducts, accounts }) {
  const suppliers = accounts.filter(a => a.type === "supplier");

  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState({ supplierId: suppliers[0]?.id || "", billNo: "", date: new Date().toISOString().slice(0, 10), items: [] });
  const [itemForm, setItemForm] = useState({ productId: products[0]?.id || "", qty: 1, rate: 0 });

  const addItem = () => {
    if (!itemForm.productId || !itemForm.qty) return;
    const prod = products.find(p => p.id === Number(itemForm.productId));
    setForm(f => ({
      ...f,
      items: [...f.items, {
        productId: Number(itemForm.productId),
        qty:  Number(itemForm.qty),
        rate: Number(itemForm.rate || prod?.rate || 0),
        name: prod?.name,
      }],
    }));
    setItemForm({ productId: products[0]?.id || "", qty: 1, rate: 0 });
  };

  const calcTotal = (items) =>
    items.reduce((a, item) => {
      const prod = products.find(p => p.id === item.productId);
      const base = item.qty * item.rate;
      return a + base + (base * (prod?.gst || 0) / 100);
    }, 0);

  const save = () => {
    if (!form.billNo || !form.supplierId || !form.items.length) return;
    setPurchases([...purchases, { ...form, id: Date.now(), supplierId: Number(form.supplierId), total: calcTotal(form.items) }]);
    // Update stock
    const updProds = [...products];
    form.items.forEach(item => {
      const idx = updProds.findIndex(p => p.id === item.productId);
      if (idx >= 0) updProds[idx] = { ...updProds[idx], qty: updProds[idx].qty + item.qty };
    });
    setProducts(updProds);
    setForm({ supplierId: suppliers[0]?.id || "", billNo: "", date: new Date().toISOString().slice(0, 10), items: [] });
    setModal(false);
  };

  return (
    <div>
      <PageHeader
        title="Purchase Entry"
        sub="Record supplier purchases and update stock."
        action={<Btn onClick={() => setModal(true)}>+ New Purchase</Btn>}
      />

      <Card noPad>
          <TableWrap>
            <table>
          <thead>
            <tr><th>Bill No</th><th>Supplier</th><th>Date</th><th>Items</th><th>Total</th></tr>
          </thead>
          <tbody>
            {[...purchases].reverse().map(p => {
              const sup = accounts.find(a => a.id === p.supplierId);
              return (
                <tr key={p.id}>
                  <td><span className="mono" style={{ color: C.accent, fontSize: 12 }}>{p.billNo}</span></td>
                  <td style={{ fontWeight: 600, color: C.text }}>{sup?.name || "—"}</td>
                  <td style={{ color: C.hint }}>{p.date}</td>
                  <td><Badge color={C.blue}>{p.items.length} items</Badge></td>
                  <td style={{ fontWeight: 700, color: C.amber }}>{fmt(p.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </TableWrap>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Purchase Entry" width={680}>
        <div className="form-grid-3">
          <Field label="Supplier" required>
            <select value={form.supplierId} onChange={e => setForm({ ...form, supplierId: e.target.value })}>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Bill No" required>
            <input value={form.billNo} onChange={e => setForm({ ...form, billNo: e.target.value })} placeholder="e.g. PUR-005" />
          </Field>
          <Field label="Date">
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </Field>
        </div>

        {/* Add item row */}
        <div style={{ background: C.bg, borderRadius: 10, padding: 16, marginBottom: 16, border: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>Add Items</p>
          <div className="form-grid-211">
            <Field label="Product">
              <select value={itemForm.productId} onChange={e => {
                const p = products.find(x => x.id === Number(e.target.value));
                setItemForm({ ...itemForm, productId: e.target.value, rate: p?.rate || 0 });
              }}>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Qty">
              <input type="number" value={itemForm.qty} min={1} onChange={e => setItemForm({ ...itemForm, qty: e.target.value })} />
            </Field>
            <Field label="Rate (₹)">
              <input type="number" value={itemForm.rate} onChange={e => setItemForm({ ...itemForm, rate: e.target.value })} />
            </Field>
            <Btn onClick={addItem} style={{ marginBottom: 1 }}>Add</Btn>
          </div>
        </div>

        {/* Items table */}
        {form.items.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {form.items.map((item, i) => {
                  const prod    = products.find(p => p.id === item.productId);
                  const base    = item.qty * item.rate;
                  const gstAmt  = base * (prod?.gst || 0) / 100;
                  return (
                    <tr key={i}>
                      <td style={{ color: C.text }}>{prod?.name}</td>
                      <td>{item.qty}</td>
                      <td>{fmt(item.rate)}</td>
                      <td style={{ color: C.hint }}>{prod?.gst}% ({fmt(gstAmt)})</td>
                      <td style={{ fontWeight: 600 }}>{fmt(base + gstAmt)}</td>
                      <td>
                        <Btn small danger onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>×</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ textAlign: "right", padding: "12px 16px", borderTop: `2px solid ${C.accent}22`, fontWeight: 700, fontSize: 15 }}>
              Total: <span style={{ color: C.amber }}>{fmt(calcTotal(form.items))}</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={!form.items.length || !form.billNo}>Save Purchase</Btn>
        </div>
      </Modal>
    </div>
  );
}
