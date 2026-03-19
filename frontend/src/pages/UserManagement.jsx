import { useState } from "react";
import { C } from "../utils/theme";
import { Btn, Card, Badge, Modal, Field, PageHeader } from "../components/ui";

export default function UserManagement({ users, setUsers }) {
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ name: "", email: "", role: "user", active: true });
  const [edit, setEdit]   = useState(null);

  const open = (u) => {
    if (u) { setForm({ ...u }); setEdit(u.id); }
    else   { setForm({ name: "", email: "", role: "user", active: true }); setEdit(null); }
    setModal(true);
  };

  const save = () => {
    if (!form.name || !form.email) return;
    if (edit) setUsers(users.map(u => u.id === edit ? { ...form, id: edit } : u));
    else      setUsers([...users, { ...form, id: Date.now() }]);
    setModal(false);
  };

  const toggle = (id) => setUsers(users.map(u => u.id === id ? { ...u, active: !u.active } : u));

  return (
    <div>
      <PageHeader
        title="User Management"
        sub="Manage system users and role-based access."
        action={<Btn onClick={() => open(null)}>+ Add User</Btn>}
      />

      <Card>
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600, color: C.text }}>{u.name}</td>
                <td style={{ color: C.muted }}>{u.email}</td>
                <td><Badge color={u.role === "admin" ? C.accent : C.blue}>{u.role}</Badge></td>
                <td><Badge color={u.active ? C.green : C.red}>{u.active ? "Active" : "Disabled"}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small variant="ghost" onClick={() => open(u)}>Edit</Btn>
                    <Btn small variant="ghost" onClick={() => toggle(u.id)}>
                      {u.active ? "Disable" : "Enable"}
                    </Btn>
                    {u.id !== 1 && (
                      <Btn small danger onClick={() => setUsers(users.filter(x => x.id !== u.id))}>
                        Delete
                      </Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit User" : "Add User"}>
        <Field label="Full Name" required>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email" required>
          <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Role">
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
        </Field>
        <Field label="Status">
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
            <span>Active</span>
          </label>
        </Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save}>Save</Btn>
        </div>
      </Modal>
    </div>
  );
}
