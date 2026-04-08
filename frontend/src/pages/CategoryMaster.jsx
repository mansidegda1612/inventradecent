import { useState , useEffect} from "react";
import { C } from "../utils/theme";
import { Btn, Card, Badge, Modal, Field, PageHeader, TableWrap, DataGrid } from "../components/ui";

export default function CategoryMaster({ categories, setCategories, products }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [edit, setEdit] = useState(null);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);



   // Fetch data on component mount
    useEffect(() => {
      fetchCategory();
    }, []);
  
    const show = (msg, type = "success") => {
      setToasts({ open: true, msg: msg, type: type });
      setTimeout(() => {
        setToasts({ open: false });
      }, 3000);
    };
  
    // Fetch accounts from API
    const fetchCategory = async () => {
      try {
        setLoading(true);
        const res = await callAPI("category", "GET");
        if (res.success) {
          setList(res?.data ?? []);
          setTotal(res?.pagination?.total ?? 0)
        }
      } catch (err) {
        console.error("Error fetching Category:", err);
      } finally {
        setLoading(false);
      }
    };

  const open = (c) => {
    if (c) { setForm({ ...c }); setEdit(c.id); }
    else { setForm({ name: "", description: "" }); setEdit(null); }
    setModal(true);
  };

  const save = () => {
    if (!form.name) return;
    if (edit) setCategories(categories.map(c => c.id === edit ? { ...form, id: edit } : c));
    else setCategories([...categories, { ...form, id: Date.now() }]);
    setModal(false);
  };

  return (
    <div>
      <PageHeader
        title="Category Master"
        sub="Organise products into categories."
        // action={<Btn onClick={() => open(null)}>+ Add Category</Btn>}
      />

      <Card noPad>
        {/* <TableWrap>
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
        </TableWrap> */}

        <DataGrid
          title=""
          columns={[
            {
              key: "name", label: "Category Name", render: (value, row) => {
                return <span style={{ fontWeight: 600, color: C.text }}>{value}</span>
              }
            },
            { key: "description", label: "Description" },
            { key: "products", label: "Products" },
            // { key: "gstin", label: "GST No." },
            // { key: "contact_no", label: "Contact No" },
            // { key: "opening", label: "Opening Balance" },

          ]}
          data={list}          // each item must have an `id` field
          pageSize={15}
          lazy={true}
          total={total}
          selectable={true}
          onFetch={() => { console.log("fetchcalled"); fetchCategory(); }}
          HeaderButtons={[
            {
              key: "Add", label: "Add Category", icon: "+", variant: "primary", hotkey: "ctrl+a",
              onClick: (ids, all, focused) => open(null)
            },
          ]}
          footerButtons={[
            {
              key: "edit", label: "Edit", icon: "⬇", hotkey: "ctrl+e",
              onClick: (ids, all, focused) => open(focused)
            },
            {
              key: "del", label: "Delete", icon: "🗑", variant: "danger", hotkey: "ctrl+d",
              onClick: (ids, all, focused) => deleteAccount(false, focused)
            },
          ]} />
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
