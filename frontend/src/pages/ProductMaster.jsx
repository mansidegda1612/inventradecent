import { useState, useEffect } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Btn, Card, Badge, Modal, Field, PageHeader, TableWrap, DataGrid } from "../components/ui";

export default function ProductMaster({ products, setProducts, categories }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", ProductId: "", barcode: "", gst: 18, rate: 0, qty: 0 });
  const [edit, setEdit] = useState(null);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const genBarcode = () => "BAR" + String(Date.now()).slice(-6);

  // Fetch data on component mount
  useEffect(() => {
    fetchProduct();
  }, []);

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg: msg, type: type });
    setTimeout(() => {
      setToasts({ open: false });
    }, 3000);
  };

  // Fetch accounts from API
  const fetchProduct = async () => {
    try {
      setLoading(true);
      const res = await callAPI("products", "GET");
      if (res.success) {
        setList(res?.data ?? []);
        setTotal(res?.pagination?.total ?? 0);
      }
    } catch (err) {
      console.error("Error fetching Product:", err);
    } finally {
      setLoading(false);
    }
  };

  const open = (p) => {
    if (p) {
      setForm({ ...p });
      setEdit(p.id);
    } else {
      setForm({ name: "", ProductId: categories[0]?.id || "", barcode: genBarcode(), gst: 18, rate: 0, qty: 0 });
      setEdit(null);
    }
    setModal(true);
  };

  const save = () => {
    if (!form.name || !form.barcode) return;
    const p = {
      ...form,
      ProductId: Number(form.ProductId),
      gst: Number(form.gst),
      rate: Number(form.rate),
      qty: Number(form.qty),
    };
    if (edit) setProducts(products.map((x) => (x.id === edit ? { ...p, id: edit } : x)));
    else setProducts([...products, { ...p, id: Date.now() }]);
    setModal(false);
  };

  return (
    <div>
      <PageHeader title="Product Master" sub="Manage your product catalogue." action={<Btn onClick={() => open(null)}>+ Add Product</Btn>} />

      <Card noPad>
        {/* <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Product</th>
                <th>Barcode</th>
                <th>GST%</th>
                <th>Rate</th>
                <th>Qty</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const cat = categories.find((c) => c.id === p.ProductId);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: C.text }}>{p.name}</td>
                    <td>
                      <Badge color={C.blue}>{cat?.name || "—"}</Badge>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 12, color: C.accent }}>
                        {p.barcode}
                      </span>
                    </td>
                    <td style={{ color: C.muted }}>{p.gst}%</td>
                    <td style={{ fontWeight: 600, color: C.text }}>{fmt(p.rate)}</td>
                    <td>
                      <Badge color={p.qty < 10 ? C.red : p.qty < 20 ? C.amber : C.green}>{p.qty}</Badge>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn small variant="ghost" onClick={() => open(p)}>
                          Edit
                        </Btn>
                        <Btn small danger onClick={() => setProducts(products.filter((x) => x.id !== p.id))}>
                          Delete
                        </Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap> */}

        <DataGrid
          title=""
          columns={[
            {
              key: "name",
              label: "Product Name",
              render: (value, row) => {
                return <span style={{ fontWeight: 600, color: C.text }}>{value}</span>;
              },
            },
            { key: "category", label: "Category" },
            { key: "Barcode", label: "Barcode" },
            { key: "GST%", label: "GST%" },
            { key: "Rate", label: "Rate" },
            { key: "Qty", label: "Qty" },
          ]}
          data={list} // each item must have an `id` field
          pageSize={15}
          lazy={true}
          total={total}
          selectable={true}
          onFetch={() => {
            console.log("fetchcalled");
            fetchProduct();
          }}
          HeaderButtons={[
            {
              key: "Add",
              label: "Add Product",
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
              onClick: (ids, all, focused) => deleteAccount(false, focused),
            },
          ]}
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Product" : "Add Product"} width={600}>
        <div className="form-grid-2">
          <Field label="Product Name" required>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Product">
            <select value={form.ProductId} onChange={(e) => setForm({ ...form, ProductId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-grid-21">
          <Field label="Barcode" required>
            <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </Field>
          <Field label="GST %">
            <select value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })}>
              {[0, 5, 12, 18, 28].map((g) => (
                <option key={g} value={g}>
                  {g}%
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-grid-2">
          <Field label="Rate (₹)" required>
            <input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          </Field>
          <Field label="Opening Qty">
            <input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>
            Cancel
          </Btn>
          <Btn onClick={save}>Save Product</Btn>
        </div>
      </Modal>
    </div>
  );
}
