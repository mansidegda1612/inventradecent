import { useState } from "react";
import { C } from "../utils/theme";
import { Btn, Card, Badge, Modal, Field, PageHeader } from "../components/ui";

export default function CategoryMaster({ categories, setCategories, products }) {
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ name: "", description: "" });
  const [edit, setEdit]   = useState(null);

  const open = (c) => {
    if (c) { setForm({ ...c }); setEdit(c.id); }
    else   { setForm({ name: "", description: "" }); setEdit(null); }
    setModal(true);
  };

  const save = () => {
    if (!form.name) return;
    if (edit) setCategories(categories.map(c => c.id === edit ? { ...form, id: edit } : c));
    else      setCategories([...categories, { ...form, id: Date.now() }]);
    setModal(false);
  };

  return (
    <div>
      <PageHeader
        title="Category Master"
        sub="Organise products into categories."
        action={<Btn onClick={() => open(null)}>+ Add Category</Btn>}
      />

      <Card>
        <table>
          <thead>
            <tr><th>Category Name</th><th>Description</th><th>Products</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {categories.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600, color: C.text }}>{c.name}</td>
                <td style={{ color: C.muted }}>{c.description}</td>
                <td><Badge color={C.accent}>{products.filter(p => p.categoryId === c.id).length}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small variant="ghost" onClick={() => open(c)}>Edit</Btn>
                    <Btn small danger onClick={() => setCategories(categories.filter(x => x.id !== c.id))}>Delete</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Category" : "Add Category"}>
        <Field label="Category Name" required>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Description">
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save}>Save</Btn>
        </div>
      </Modal>
    </div>
  );
}
