import { useState, useImperativeHandle, forwardRef } from "react";
import { Btn, Modal, Field, ConfirmModal, ToastProvider } from "../components/ui/index";
import PermissionMatrix from "../components/ui/PermissionMatrix";
import { allPermissionKeys } from "../utils/permissions";
import { callAPI } from "../utils/callserver";
import { useAuth } from "../context/AuthContext";

const RoleFormModal = forwardRef(function RoleFormModal({ onSaved }, ref) {
  const { permissions } = useAuth();
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ role: "", rights: [] });
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  useImperativeHandle(ref, () => ({
    openAdd: () => {
      setForm({ role: "", rights: [] });
      setEdit(null);
      setModal(true);
    },
    openEdit: (row) => {
      if (!row) return;
      setForm({ role: row.role || "", rights: Array.isArray(row.rights) ? row.rights : [] });
      setEdit(row.id);
      setModal(true);
    },
    openDelete: (row) => {
      if (!row) return;
      setDeleteTarget(row);
      setConfirmOpen(true);
    },
  }));

  const save = async () => {
    if (!form.role.trim()) { show("Role name is required!", "error"); return; }
    try {
      setLoading(true);
      const res = edit
        ? await callAPI(`userroles/${edit}`, "PUT", form)
        : await callAPI("userroles", "POST", form);
      show(res.message, res.success ? "success" : "error");
      if (res.success) { setModal(false); onSaved?.(); }
    } catch {
      show("Error saving role", "error");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setLoading(true);
      const res = await callAPI(`userroles/${deleteTarget.id}`, "DELETE");
      show(res.message, res.success ? "success" : "error");
      if (res.success) { setConfirmOpen(false); onSaved?.(); setDeleteTarget(null); }
    } catch {
      show("Error deleting role", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Role" : "Add Role"} width={700}>
        <Field label="Role Name" required>
          <input
            autoFocus
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}
            placeholder="e.g. Sales Executive"
          />
        </Field>

        <div className="u-modal-footer-actions" style={{ justifyContent: "flex-start", marginBottom: 8 }}>
          <Btn small variant="ghost" onClick={() => setForm({ ...form, rights: allPermissionKeys(permissions) })}>
            Select all
          </Btn>
          <Btn small variant="ghost" onClick={() => setForm({ ...form, rights: [] })}>
            Clear all
          </Btn>
        </div>

        <Field label="Rights">
          <PermissionMatrix value={form.rights} onChange={(rights) => setForm({ ...form, rights })} />
        </Field>

        <div className="u-modal-footer-actions">
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={loading}>{loading ? "Saving…" : "Save"}</Btn>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Role"
        message={`Are you sure you want to delete "${deleteTarget?.role}"? This is blocked if any user is still assigned to it.`}
      />

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </>
  );
});

export default RoleFormModal;
