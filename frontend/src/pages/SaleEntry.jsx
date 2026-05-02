import { useState, useRef } from "react";
import { C } from "../utils/theme";
import { fmt ,fmtDateShort} from "../utils/format";
import { callAPI } from "../utils/callserver";
import { Btn, Card, Badge, Modal, Field, PageHeader, TableWrap, DataGrid} from "../components/ui";

export default function SaleEntry({ sales, setSales, products, setProducts, accounts }) {
  const customers = accounts.filter(a => a.type === "customer");

  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState({ customerId: customers[0]?.id || "", invoiceNo: "SAL-00" + (sales.length + 3), date: new Date().toISOString().slice(0, 10), items: [] });
  const [barInput, setBarInput] = useState("");
  const barRef = useRef(null);
  const loadModelref = useRef({});
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);


   // Fetch accounts from API
    const fetchTransaction = async (loadModel) => {
      try {
        loadModelref.current = loadModel
      
        let url = "transactions";
        url += `?page=${loadModel.page}`;
        url += `&limit=${loadModel.pageSize}`;
        url += loadModel.search ? `&search=${loadModel.search}` : "";
        //console.log(url);
        setLoading(true);
        const res = await callAPI(url, "GET");
        if (res.success) {
          setList(res?.data ?? []);
          setTotal(res?.pagination?.total ?? 0)
        }
      } catch (err) {
        console.error("Error fetching transactions:", err);
      } finally {
        setLoading(false);
      }
    };

    
  // Open modal for add/edit
  const open = async (a) => {
    //const res = await callAPI("groups", "GET");
    if (res.success)
      setGroupData(res?.data ?? []);
    if (a) {
      setForm({
        name: a.name || "",
        group: a.group || 1,
        city: a.city || "",
        contact_no: a.contact_no || "",
        gst: a.gstin || "",
        opening: a.opening || 0
      });
      setEdit(a.id);
    } else {
      setForm({ name: "", group: 1, city: "", contact_no: "", gst: "", opening: 0 });
      setEdit(null);
    }
    setModal(true);
  };

  const scanBarcode = (val) => {
    const prod = products.find(p => p.barcode === val.trim());
    if (!prod) return;
    setForm(f => {
      const existing = f.items.findIndex(i => i.productId === prod.id);
      if (existing >= 0) {
        const items = [...f.items];
        items[existing] = { ...items[existing], qty: items[existing].qty + 1 };
        return { ...f, items };
      }
      return { ...f, items: [...f.items, { productId: prod.id, qty: 1, rate: prod.rate, name: prod.name }] };
    });
    setBarInput("");
  };

  const calcTotal = (items) =>
    items.reduce((a, item) => {
      const prod = products.find(p => p.id === item.productId);
      const base = item.qty * item.rate;
      return a + base + (base * (prod?.gst || 0) / 100);
    }, 0);

  const save = () => {
    if (!form.invoiceNo || !form.customerId || !form.items.length) return;
    setSales([...sales, { ...form, id: Date.now(), customerId: Number(form.customerId), total: calcTotal(form.items) }]);
    const updProds = [...products];
    form.items.forEach(item => {
      const idx = updProds.findIndex(p => p.id === item.productId);
      if (idx >= 0) updProds[idx] = { ...updProds[idx], qty: Math.max(0, updProds[idx].qty - item.qty) };
    });
    setProducts(updProds);
    setForm({ customerId: customers[0]?.id || "", invoiceNo: "SAL-" + String(Date.now()).slice(-4), date: new Date().toISOString().slice(0, 10), items: [] });
    setModal(false);
  };

  return (
    <div>
      <PageHeader
        title="Sale Entry"
        sub="Barcode-based billing and invoice generation."
      />

      <Card noPad>

         <DataGrid
                   title=""
                   columns={[
                     {
                       key: "bill_no",
                       label: "Bill No",
                       render: (value, row) => {
                         return <span style={{ fontWeight: 600, color: C.text }}>{value}</span>;
                       },
                     },
                    { key: "date", label: "Date" ,
                       render: (value, row) => {
                         return <span>{fmtDateShort(value)}</span>;
                       },
                    },
                     { key: "customer_name", label: "Customer" },
                     { key: "item_count", label: "No Items" },
                     { key: "final_amount", label: "Bill Amount" , render: (value, row) => {
                         return <span style={{ fontWeight: 600, color: C.text }}>{value}</span>;
                       },},
                   ]}
                   data={list} // each item must have an `id` field
                   pageSize={15}
                   lazy={true}
                   total={total}
                   selectable={true}
                   onFetch={(loadModel) => {
                     fetchTransaction(loadModel);
                   }}
                   HeaderButtons={[
                     {
                       key: "Add",
                       label: "Add Sale",
                       icon: "+",
                       variant: "primary",
                       hotkey: "ctrl+a",
                       onClick: (ids, all, focused) => open(null),
                     },
                   ]}
                   footerButtons={[
                     {
                       key: "edit",
                       label: "Edit",
                       icon: "⬇",
                       hotkey: "ctrl+e",
                       onClick: (ids, all, focused) => open(focused),
                     },
                     {
                       key: "del",
                       label: "Delete",
                       icon: "🗑",
                       variant: "danger",
                       hotkey: "ctrl+d",
                       onClick: (ids, all, focused) => deleteTransaction(false, focused),
                     },
                   ]}
                 />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Sale Entry" width={680}>
        <div className="form-grid-3">
          <Field label="Customer" required>
            <select value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })}>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Invoice No" required>
            <input value={form.invoiceNo} onChange={e => setForm({ ...form, invoiceNo: e.target.value })} />
          </Field>
          <Field label="Date">
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </Field>
        </div>

        {/* Barcode scanner */}
        <div style={{ background: C.accentBg, borderRadius: 10, padding: 16, marginBottom: 16, border: `1px solid ${C.accent}28` }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
            📷 Barcode Scanner
          </p>
          <input
            ref={barRef}
            value={barInput}
            onChange={e => setBarInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && scanBarcode(barInput)}
            placeholder="Scan barcode or type barcode number, then press Enter..."
          />
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {products.map(p => (
              <button
                key={p.id}
                onClick={() => scanBarcode(p.barcode)}
                style={{ background: "#fff", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
              >
                <span className="mono" style={{ color: C.accent }}>{p.barcode}</span> {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Items table */}
        {form.items.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {form.items.map((item, i) => {
                  const prod   = products.find(p => p.id === item.productId);
                  const base   = item.qty * item.rate;
                  const gstAmt = base * (prod?.gst || 0) / 100;
                  return (
                    <tr key={i}>
                      <td style={{ color: C.text }}>{prod?.name}</td>
                      <td>
                        <input
                          type="number" value={item.qty} min={1}
                          style={{ width: 60, padding: "4px 8px" }}
                          onChange={e => setForm(f => {
                            const items = [...f.items];
                            items[i] = { ...items[i], qty: Number(e.target.value) };
                            return { ...f, items };
                          })}
                        />
                      </td>
                      <td>{fmt(item.rate)}</td>
                      <td style={{ color: C.hint }}>{prod?.gst}% ({fmt(gstAmt)})</td>
                      <td style={{ fontWeight: 600, color: C.green }}>{fmt(base + gstAmt)}</td>
                      <td>
                        <Btn small danger onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>×</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ textAlign: "right", padding: "12px 16px", borderTop: `2px solid ${C.green}33`, fontWeight: 700, fontSize: 15 }}>
              Total: <span style={{ color: C.green }}>{fmt(calcTotal(form.items))}</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn variant="success" onClick={save} disabled={!form.items.length || !form.invoiceNo}>
            Save & Generate Invoice
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
