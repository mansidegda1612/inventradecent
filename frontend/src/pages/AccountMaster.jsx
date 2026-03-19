import { useState } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Btn, Card, Badge, Modal, Field, PageHeader } from "../components/ui";

export default function AccountMaster({ accounts, setAccounts }) {
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ name: "", type: "customer", city: "", gst: "", opening: 0 });
  const [edit, setEdit]   = useState(null);
  const [filter, setFilter] = useState("all");

  const open = (a) => {
    if (a) { setForm({ ...a }); setEdit(a.id); }
    else   { setForm({ name: "", type: "customer", city: "", gst: "", opening: 0 }); setEdit(null); }
    setModal(true);
  };

  const save = () => {
    if (!form.name) return;
    if (edit) setAccounts(accounts.map(a => a.id === edit ? { ...form, id: edit } : a));
    else      setAccounts([...accounts, { ...form, id: Date.now(), opening: Number(form.opening) }]);
    setModal(false);
  };

  const list = filter === "all" ? accounts : accounts.filter(a => a.type === filter);

  return (
    <div>
      <PageHeader
        title="Account Master"
        sub="Manage customers and suppliers."
        action={<Btn onClick={() => open(null)}>+ Add Account</Btn>}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["all", "customer", "supplier"].map(t => (
          <Btn key={t} small variant={filter === t ? "primary" : "ghost"} onClick={() => setFilter(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Btn>
        ))}
      </div>

      <Card>
        <table>
          <thead>
            <tr><th>Name</th><th>Type</th><th>City</th><th>GST No.</th><th>Opening Balance</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600, color: C.text }}>{a.name}</td>
                <td><Badge color={a.type === "customer" ? C.green : C.blue}>{a.type}</Badge></td>
                <td style={{ color: C.muted }}>{a.city}</td>
                <td><span className="mono" style={{ fontSize: 12, color: C.muted }}>{a.gst || "—"}</span></td>
                <td style={{ fontWeight: 600, color: C.text }}>{fmt(a.opening)}</td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small variant="ghost" onClick={() => open(a)}>Edit</Btn>
                    <Btn small danger onClick={() => setAccounts(accounts.filter(x => x.id !== a.id))}>Delete</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Account" : "Add Account"}>
        <Field label="Name" required>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Type">
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
            </select>
          </Field>
          <Field label="City">
            <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          </Field>
        </div>
        <Field label="GST Number">
          <input value={form.gst} onChange={e => setForm({ ...form, gst: e.target.value })} placeholder="e.g. 24AAJCM3827R1ZW" />
        </Field>
        <Field label="Opening Balance (₹)">
          <input type="number" value={form.opening} onChange={e => setForm({ ...form, opening: e.target.value })} />
        </Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save}>Save</Btn>
        </div>
      </Modal>
    </div>
  );
}
