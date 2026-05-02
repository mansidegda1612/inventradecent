import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { C } from "../utils/theme";
import { Btn, Modal, Field, ToastProvider, ConfirmModal } from "../components/ui";
import { callAPI } from "../utils/callserver";

// ✅ Wrap with forwardRef so parent can call openAdd / openEdit / openDelete
const GroupMaster = forwardRef(function GroupMaster({ onSaved }, ref) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "" });
  const [edit, setEdit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg] = useState("Are You Sure You want to Delete this Group?");
  const focusedDataRef = useRef(null); // ✅ use ref instead of state for delete target

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  // ── OPEN ADD ──────────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ name: "" });
    setEdit(null);
    setModal(true);
  };

  // ── OPEN EDIT ─────────────────────────────────────────────────────────────
  const openEdit = (row) => {
    if (!row) { show("Select a group to edit", "error"); return; }
    setForm({ name: row.name || "" });
    setEdit(row.id);
    setModal(true);
  };

  // ── OPEN DELETE ───────────────────────────────────────────────────────────
  const openDelete = (row) => {
    if (!row) { show("Select a group to delete", "error"); return; }
    focusedDataRef.current = row;
    setConfirmOpen(true);
  };

  // ✅ Expose these 3 methods to the parent via ref
  useImperativeHandle(ref, () => ({
    openAdd,
    openEdit,
    openDelete,
  }));

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.name) { show("Name is required!", "error"); return; }

    const model = { name: form.name };
    try {
      setLoading(true);
      const res = edit
        ? await callAPI(`groups/${edit}`, "PUT", model)
        : await callAPI("groups", "POST", model);

        show(res.message, res.success ? "success" : "error" );
      if (res.success) {
        setModal(false);
        onSaved?.(); // ✅ notify parent to refresh dropdown
      } 
    } catch {
      show(`Error ${edit ? "updating" : "creating"} Group`, "error");
    } finally {
      setLoading(false);
    }
  };

  // ── DELETE (confirmed) ────────────────────────────────────────────────────
  const confirmDelete = async () => {
    try {
      setLoading(true);
      const res = await callAPI(`groups/${focusedDataRef.current.id}`, "DELETE");
      show(res.message, res.success ? "success" : "error" );
      if (res.success) {
        onSaved?.(); // ✅ notify parent to refresh dropdown
      } 
    } catch {
      show("Error deleting Group", "error");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Group" : "Add Group"}>
        <Field label="Group Name" required>
          <input
            autoFocus
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Btn>
        </div>
      </Modal>

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
        message={confirmMsg}
      />
    </>
  );
});

export default GroupMaster;