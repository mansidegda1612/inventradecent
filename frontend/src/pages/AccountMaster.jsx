import { useState, useEffect } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Btn, Card, Badge, Modal, Field, PageHeader, TableWrap, ToastProvider, ConfirmModal, DataGrid } from "../components/ui";
import { callAPI } from "../utils/callserver";

export default function AccountMaster() {

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", type: "customer", city: "", contact_no: "", gst: "", opening: 0 });
  const [edit, setEdit] = useState(null);
  const [total, setTotal] = useState(0);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg] = useState("Are You Sure You want to Delete this Account?");

  // Fetch data on component mount
  useEffect(() => {
    fetchAccounts();
  }, []);

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg: msg, type: type });
    setTimeout(() => {
      setToasts({ open: false });
    }, 3000);
  };

  // Fetch accounts from API
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await callAPI("customers", "GET");
      if (res.success) {
        setList(res?.data ?? []);
        setTotal(res?.pagination?.total ?? 0)
      }
    } catch (err) {
      console.error("Error fetching accounts:", err);
    } finally {
      setLoading(false);
    }
  };

  // Open modal for add/edit
  const open = (a) => {
    if (a) {
      setForm({
        name: a.name || "",
        type: a.type || "customer",
        city: a.city || "",
        contact_no: a.contact_no || "",
        gst: a.gstin || "",
        opening: a.opening || 0
      });
      setEdit(a.id);
    } else {
      setForm({ name: "", type: "customer", city: "", contact_no: "", gst: "", opening: 0 });
      setEdit(null);
    }
    setModal(true);
  };

  // Save account (Create or Update)
  const save = async () => {
    if (!form.name) {
      show("Name is required!", "error");
      return;
    }

    const model = {
      name: form.name,
      contact_no: form.contact_no,
      city: form.city,
      gstin: form.gst,
      group: 1,
      address: form.city || "N/A",
      opening: Number(form.opening) || 0,
      credit: 0,
      debit: 0,
      closing: Number(form.opening) || 0
    };

    try {
      setLoading(true);

      let res;
      if (edit) {
        // Update existing account
        res = await callAPI(`customers/${edit}`, "PUT", model);
        console.log("Update response:", res);
      } else {
        // Create new account
        res = await callAPI("customers", "POST", model);
        console.log("Create response:", res);
      }

      if (res.success) {
        setModal(false);
        show(res.message);
        await fetchAccounts(); // Refresh the grid
      } else {
        show(`Failed to ${edit ? 'update' : 'create'} account`, "error");
      }
    } catch (err) {
      console.error(`Error ${edit ? 'updating' : 'creating'} account:`, err);
      show(`Error ${edit ? 'updating' : 'creating'} account`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Delete account
  const deleteAccount = async (confirm, id) => {
    console.log(id);
    if (!confirm)
      setConfirmOpen(true)//"Are you sure you want to delete this account?");
    else {
      try {
        setLoading(true);
        const res = await callAPI(`customers/${id}`, "DELETE");
        console.log("Delete response:", res);

        if (res.success) {
          await fetchAccounts(); // Refresh the grid
        } else {
          show("Failed to delete account", "error");
        }
      } catch (err) {
        console.error("Error deleting account:", err);
        show("Error deleting account", "error");
      } finally {
        setLoading(false);
        setConfirmOpen(false);
      }
    }
  };


  return (
    <div>
      <PageHeader
        title="Account Master"
        sub="Manage customers and suppliers."
      // action={<Btn onClick={() => open(null)}>+ Add Account</Btn>}
      />


      <Card noPad>
        {/* <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>City</th>
                <th>Contact No</th>
                <th>GST No.</th>
                <th>Opening Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: 20 }}>
                    Loading...
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: 20, color: C.muted }}>
                    No accounts found
                  </td>
                </tr>
              ) : (
                filteredList.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600, color: C.text }}>{a.name}</td>
                    <td><Badge color={a.type === "customer" ? C.green : C.blue}>{a.type}</Badge></td>
                    <td style={{ color: C.muted }}>{a.city || "—"}</td>
                    <td style={{ color: C.muted }}>{a.contact_no || "—"}</td>
                    <td><span className="mono" style={{ fontSize: 12, color: C.muted }}>{a.gstin || "—"}</span></td>
                    <td style={{ fontWeight: 600, color: C.text }}>{fmt(a.opening)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn small variant="ghost" onClick={() => open(a)}>Edit</Btn>
                        <Btn small danger onClick={() => deleteAccount(false ,a.id)}>Delete</Btn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>  */}
        {/* <DataGrid
          columns={[
            { key: "name", label: "Name" , render :(value,row)=>{ console.log(value , row);
              return <span  style={{ fontWeight: 600, color: C.text }}>{value}</span>}},
            { key: "type", label: "Type" },
            { key: "city", label: "City" },
            { key: "gstin", label: "GST No." },
            { key: "contact_no", label: "Contact No" },
            { key: "opening", label: "Opening Balance" },
      
          ]}
          data={list}
          total = {total}
          pageSize={15}
          onSelectionChange={(rows) => console.log(rows)}
          headerActions={<div><Btn onClick={() => open(null)}>+ Add Account</Btn></div>}
          footerActions={<div style={{ display: "flex", gap: 8 }}>
                        <Btn small variant="ghost" onClick={() => open(a)}>Edit</Btn>
                        <Btn small danger onClick={() => deleteAccount(false ,a.id)}>Delete</Btn>
                      </div>}
        /> */}

        <DataGrid
          title=""
          columns={[
            {
              key: "name", label: "Name", render: (value, row) => {
                return <span style={{ fontWeight: 600, color: C.text }}>{value}</span>
              }
            },
            { key: "type", label: "Type" },
            { key: "city", label: "City" },
            { key: "gstin", label: "GST No." },
            { key: "contact_no", label: "Contact No" },
            { key: "opening", label: "Opening Balance" },

          ]}
          data={list}          // each item must have an `id` field
          pageSize={15}
          lazy= {true}
          total={total}
          selectable = {true}
          onFetch= {()=>{console.log("fetchcalled"); fetchAccounts();}}
          HeaderButtons = {[
             {
              key: "Add", label: "Add Account", icon: "+",variant:"primary",hotkey: "ctrl+a",
              onClick: (ids, all) => open(null)
            },
          ]}
          footerButtons={[
            {
              key: "edit", label: "Edit", icon: "⬇",hotkey: "ctrl+e",
              onClick: (ids, all) => open(ids)
            },
            {
              key: "del", label: "Delete", icon: "🗑", variant: "danger", hotkey: "ctrl+d", 
              onClick: ids => deleteAccount(false , ids)
            },
          ]} />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Account" : "Add Account"}>
        <Field label="Name" required>
          <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="form-grid-2">
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
        <Field label="Contact Number">
          <input value={form.contact_no} onChange={e => setForm({ ...form, contact_no: e.target.value })} />
        </Field>
        <Field label="GST Number">
          <input value={form.gst} onChange={e => setForm({ ...form, gst: e.target.value })} placeholder="e.g. 24AAJCM3827R1ZW" />
        </Field>
        <Field label="Opening Balance (₹)">
          <input type="number" value={form.opening} onChange={e => setForm({ ...form, opening: e.target.value })} />
        </Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Btn>
        </div>
      </Modal>

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} >
      </ToastProvider>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { deleteAccount(true) }}
        message={confirmMsg}
      />
    </div>
  );
}