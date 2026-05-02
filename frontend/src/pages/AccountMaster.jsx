import { useState, useEffect, useRef } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Btn, Card, Badge, Modal, Field, PageHeader, TableWrap, ToastProvider, ConfirmModal, DataGrid, Dropdown } from "../components/ui";
import { callAPI } from "../utils/callserver";
import GroupMaster from "./GroupMaster";

export default function AccountMaster() {

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", group: 1, city: "", contact_no: "", gst: "", opening: 0 });
  const [edit, setEdit] = useState(null);
  const [focusedData, setfocusedData] = useState({});
  const [total, setTotal] = useState(0);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg] = useState("Are You Sure You want to Delete this Account?");
  const loadModelref = useRef({});
  const [groupData, setGroupData] = useState({});
  const groupRef = useRef(null); // ✅ ref to call GroupMaster methods

  // ✅ Called by GroupMaster after any add/edit/delete → re-fetch dropdown
  const handleGroupSaved = async () => {
    const res = await callAPI("groups", "GET");
    if (res.success) setGroupData(res?.data ?? []);
  };


  const show = (msg, type = "success") => {
    setToasts({ open: true, msg: msg, type: type });
    setTimeout(() => {
      setToasts({ open: false });
    }, 3000);
  };

  // Fetch accounts from API
  const fetchAccounts = async (loadModel) => {
    try {
      loadModelref.current = loadModel
      //console.log(loadModel);
      let url = "customers";
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
      console.error("Error fetching accounts:", err);
    } finally {
      setLoading(false);
    }
  };

  // Open modal for add/edit
  const open = async (a) => {
    const res = await callAPI("groups", "GET");
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
      group: form.group,
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
        res = await callAPI(`pro/${edit}`, "PUT", model);
        console.log("Update response:", res);
      } else {
        // Create new account
        res = await callAPI("customers", "POST", model);
        console.log("Create response:", res);
      }
      show(res.message, res.success ? "success" : "error" );
      if (res.success) {
        setModal(false);
        await fetchAccounts(loadModelref.current); // Refresh the grid
      } 
    } catch (err) {
      show(`Error ${edit ? 'updating' : 'creating'} account`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Delete account
  const deleteAccount = async (confirm, data) => {
    setfocusedData(data);
    if (!confirm)
      setConfirmOpen(true)//"Are you sure you want to delete this account?");
    else {
      try {
        setLoading(true);
        const res = await callAPI(`customers/${focusedData.id}`, "DELETE");

        show(res.message, res.success ? "success" : "error" );
        if (res.success) {
          await fetchAccounts(loadModelref.current); // Refresh the grid
        } 
      } catch (err) {
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
        <DataGrid
          title=""
          columns={[
            {
              key: "name", label: "Name", render: (value, row) => {
                return <span style={{ fontWeight: 600, color: C.text }}>{value}</span>
              }
            },
            { key: "group_name", label: "Group" },
            { key: "city", label: "City" },
            { key: "gstin", label: "GST No." },
            { key: "contact_no", label: "Contact No" },
            { key: "opening", label: "Opening Balance" },

          ]}
          data={list}          // each item must have an `id` field
          lazy={true}
          total={total}
          // selectable={true}
          onFetch={(loadModel) => { fetchAccounts(loadModel); }}
          HeaderButtons={[
            {
              key: "Add", label: "Add Account", icon: "+", variant: "primary", hotkey: "ctrl+a",
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

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Account" : "Add Account"}>
        <Field label="Name" required>
          <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="form-grid-2">
          <Field label="Group">
            <Dropdown
              value={form.group}
              onChange={(v, opt) => { setForm({ ...form, group: v }) }}
              clearable
              options={groupData}
              footerButtons={[
                // ✅ These now call GroupMaster methods via ref
                {
                  icon: "+", label: "Add", hotkey: "ctrl+a",
                  onClick: () => groupRef.current?.openAdd()
                },
                {
                  icon: "⬇", label: "Edit", hotkey: "ctrl+e",
                  onClick: (idx, focused) => {
                    if (!focused) return;
                    groupRef.current?.openEdit(focused);
                  }
                },
                {
                  icon: "🗑", label: "Delete", hotkey: "ctrl+d",
                  onClick: (idx, focused) => {
                    if (!focused) return;
                    groupRef.current?.openDelete(focused);
                  }
                },
              ]}
            />
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


      {/* ✅ Render GroupMaster anywhere — it only renders modals, no visible UI */}
      <GroupMaster ref={groupRef} onSaved={handleGroupSaved} />


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