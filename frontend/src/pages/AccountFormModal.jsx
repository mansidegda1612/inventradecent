/**
 * AccountFormModal
 *
 * A ref-controlled component that exposes only modals (Add / Edit / Delete).
 * It has NO DataGrid — it is invisible until called via ref.
 *
 * Usage inside another screen:
 *
 *   const accountRef = useRef(null);
 *
 *   <AccountFormModal ref={accountRef} onSaved={handleAccountSaved} />
 *
 *   // Then call:
 *   accountRef.current?.openAdd()
 *   accountRef.current?.openEdit(rowObject)
 *   accountRef.current?.openDelete(rowObject)
 */

import { useState, useImperativeHandle, forwardRef, useRef } from "react";
import { Btn, Modal, Field, Dropdown, ConfirmModal, ToastProvider } from "../components/ui/index";
import { callAPI } from "../utils/callserver";

const AccountFormModal = forwardRef(function AccountFormModal({ onSaved, groupRef }, ref) {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({
    name: "", group: 1, city: "", contact_no: "",
    gst: "", opening: 0, RecPay: "C",
  });
  const [groupData, setGroupData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  const fetchGroups = async () => {
    const res = await callAPI("groups", "GET");
    if (res.success) setGroupData(res.data ?? []);
  };

  // ── Expose methods to parent via ref ──────────────────────────────────────
  useImperativeHandle(ref, () => ({
    openAdd: async () => {
      await fetchGroups();
      setForm({ name: "", group: 1, city: "", contact_no: "", gst: "", opening: 0, RecPay: "C" });
      setEdit(null);
      setModal(true);
    },
    openEdit: async (row) => {
      if (!row) return;
      await fetchGroups();
      setForm({
        name: row.name || "",
        group: row.group || 1,
        city: row.city || "",
        contact_no: row.contact_no || "",
        gst: row.gstin || "",
        opening: Math.abs(row.opening) || 0,
        RecPay: row.opening < 0 ? "D" : "C",
      });
      setEdit(row.id);
      setModal(true);
    },
    openDelete: (row) => {
      if (!row) return;
      setDeleteTarget(row);
      setConfirmOpen(true);
    },
  }));

  // ── Save (create or update) ───────────────────────────────────────────────
  const save = async () => {
    if (!form.name) { show("Name is required!", "error"); return; }

    const model = {
      name: form.name,
      contact_no: form.contact_no,
      city: form.city,
      gstin: form.gst,
      group: form.group,
      address: form.city || "N/A",
      opening: Number(form.RecPay === "D" ? form.opening * -1 : form.opening) || 0,
    };

    try {
      setLoading(true);
      const res = edit
        ? await callAPI(`customers/${edit}`, "PUT", model)
        : await callAPI("customers", "POST", model);

      show(res.message, res.success ? "success" : "error");
      if (res.success) {
        setModal(false);
        onSaved?.("save", { id: edit, ...model });
      }
    } catch (err) {
      show("Error saving account", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setLoading(true);
      const res = await callAPI(`customers/${deleteTarget.id}`, "DELETE");
      show(res.message, res.success ? "success" : "error");
      if (res.success) {
        setConfirmOpen(false);
        onSaved?.("delete", deleteTarget);
        setDeleteTarget(null);
      }
    } catch (err) {
      show("Error deleting account", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Add / Edit Modal ── */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={edit ? "Edit Account" : "Add Account"}
      >
        <Field label="Name" required>
          <input
            autoFocus
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <div className="form-grid-2">
          <Field label="Group">
            <Dropdown
              value={form.group}
              onChange={(v) => setForm({ ...form, group: v })}
              clearable
              options={groupData}
              footerButtons={groupRef ? [
                {
                  icon: "+", label: "Add", hotkey: "ctrl+a",
                  onClick: () => groupRef.current?.openAdd(),
                },
                {
                 icon: "⬇", label: "Edit", hotkey: "ctrl+e",
                  onClick: (idx, focused) => {
                    if (focused) groupRef.current?.openEdit(focused);
                  },
                },
                {
                  icon: "🗑", label: "Delete", hotkey: "ctrl+d",
                  onClick: (idx, focused) => {
                    if (focused) groupRef.current?.openDelete(focused);
                  },
                },
              ] : []}
            />
          </Field>
          <Field label="City">
            <input
              value={form.city}
              onChange={e => setForm({ ...form, city: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Contact Number">
          <input
            value={form.contact_no}
            onChange={e => setForm({ ...form, contact_no: e.target.value })}
            onKeyDown={(e) => {
              const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"];
              if (allowed.includes(e.key)) return;
              if (e.key === "-") { e.preventDefault(); return; }
              const digits = e.target.value.replace(/[^0-9]/g, "");
              if (digits.length >= 10) e.preventDefault();
            }}
          />
        </Field>

        <Field label="GST Number">
          <input
            value={form.gst}
            onChange={e => setForm({ ...form, gst: e.target.value })}
            placeholder="e.g. 24AAJCM3827R1ZW"
          />
        </Field>

        <div className="form-grid-2">
          <Field label="Opening Balance (₹)">
            <input
              type="number"
              value={form.opening}
              onChange={e => setForm({ ...form, opening: e.target.value })}
            />
          </Field>
          <Field label="Rec/Pay">
            <Dropdown
              value={form.RecPay}
              onChange={(v) => setForm({ ...form, RecPay: v })}
              options={[{ id: "C", name: "Receivable" }, { id: "D", name: "Payable" }]}
            />
          </Field>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={loading}>
            {loading ? "Saving…" : "Save"}
          </Btn>
        </div>
      </Modal>

      {/* ── Delete Confirm ── */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Account"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
      />

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </>
  );
});

export default AccountFormModal;