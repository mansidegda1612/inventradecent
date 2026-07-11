import { useState, useImperativeHandle, forwardRef } from "react";
import { Btn, Modal, Field, Dropdown, ConfirmModal, ToastProvider } from "../components/ui/index";
import PermissionMatrix from "../components/ui/PermissionMatrix";
import { callAPI } from "../utils/callserver";

const emptyForm = { name: "", user_id: "", password: "", userrole: null, rights: [], is_active: true };

const UserFormModal = forwardRef(function UserFormModal({ onSaved }, ref) {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [roleData, setRoleData] = useState([]);
  const [roleRightsPreview, setRoleRightsPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  const fetchRoles = async () => {
    const res = await callAPI("userroles", "GET");
    if (res.success) setRoleData((res.data ?? []).map(r => ({ id: r.id, name: r.role, rights: r.rights })));
    return res.data ?? [];
  };

  const updateRolePreview = (roleId, roles) => {
    const role = (roles || roleData).find(r => r.id === roleId);
    setRoleRightsPreview(Array.isArray(role?.rights) ? role.rights : []);
  };

  useImperativeHandle(ref, () => ({
    openAdd: async () => {
      const roles = await fetchRoles();
      setForm({ ...emptyForm, userrole: roles[0]?.id ?? null });
      updateRolePreview(roles[0]?.id, roles.map(r => ({ id: r.id, rights: r.rights })));
      setEdit(null);
      setModal(true);
    },
    openEdit: async (row) => {
      if (!row) return;
      const roles = await fetchRoles();
      setForm({
        name: row.name || "",
        user_id: row.user_id || "",
        password: "",
        userrole: row.userrole,
        rights: Array.isArray(row.rights) ? row.rights : [],
        is_active: row.is_active !== 0,
      });
      updateRolePreview(row.userrole, roles.map(r => ({ id: r.id, rights: r.rights })));
      setEdit(row.id);
      setModal(true);
    },
    openDelete: (row) => {
      if (!row) return;
      setDeleteTarget(row);
      setConfirmOpen(true);
    },
    openResetPassword: (row) => {
      if (!row) return;
      setResetTarget(row);
      setNewPassword("");
      setResetOpen(true);
    },
  }));

  const save = async () => {
    if (!form.name || !form.user_id) { show("Name and Login ID are required!", "error"); return; }
    if (!edit && !form.password) { show("Password is required for a new user!", "error"); return; }

    const model = {
      name: form.name,
      user_id: form.user_id,
      userrole: form.userrole,
      rights: form.rights,
      is_active: form.is_active,
      ...(edit ? {} : { password: form.password }),
    };

    try {
      setLoading(true);
      const res = edit
        ? await callAPI(`users/${edit}`, "PUT", model)
        : await callAPI("users", "POST", model);
      show(res.message, res.success ? "success" : "error");
      if (res.success) { setModal(false); onSaved?.(); }
    } catch {
      show("Error saving user", "error");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setLoading(true);
      const res = await callAPI(`users/${deleteTarget.id}`, "DELETE");
      show(res.message, res.success ? "success" : "error");
      if (res.success) { setConfirmOpen(false); onSaved?.(); setDeleteTarget(null); }
    } catch {
      show("Error deleting user", "error");
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async () => {
    if (!resetTarget || !newPassword) { show("Enter a new password", "error"); return; }
    try {
      setLoading(true);
      const res = await callAPI(`users/${resetTarget.id}/reset-password`, "PATCH", { newPassword });
      show(res.message, res.success ? "success" : "error");
      if (res.success) { setResetOpen(false); setResetTarget(null); }
    } catch {
      show("Error resetting password", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit User" : "Add User"} width={700}>
        <div className="form-grid-2">
          <Field label="Name" required>
            <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Login ID" required>
            <input value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} />
          </Field>
        </div>

        {!edit && (
          <Field label="Password" required>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
          </Field>
        )}

        <div className="form-grid-2">
          <Field label="Role" required>
            <Dropdown
              value={form.userrole}
              onChange={(v) => { setForm({ ...form, userrole: v }); updateRolePreview(v); }}
              options={roleData}
            />
          </Field>
          <Field label="Status">
            <Dropdown
              value={form.is_active}
              onChange={(v) => setForm({ ...form, is_active: v })}
              options={[{ id: true, name: "Active" }, { id: false, name: "Disabled" }]}
            />
          </Field>
        </div>

        <Field label="Role's default rights (read-only reference)">
          <div className="perm-preview">
            {roleRightsPreview.includes("*")
              ? <span className="u-accent u-bold">All rights</span>
              : roleRightsPreview.length
                ? <span className="u-muted u-fs12">{roleRightsPreview.join(", ")}</span>
                : <span className="u-hint">No rights on this role yet</span>}
          </div>
        </Field>

        <Field label="Extra rights for this user (in addition to the role above)">
          <PermissionMatrix value={form.rights} onChange={(rights) => setForm({ ...form, rights })} />
        </Field>

        <div className="u-modal-footer-actions">
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={loading}>{loading ? "Saving…" : "Save"}</Btn>
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
      />

      {/* ── Reset password ── */}
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title={`Reset Password — ${resetTarget?.name || ""}`}>
        <Field label="New Password" required>
          <input type="password" autoFocus value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </Field>
        <div className="u-modal-footer-actions">
          <Btn variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Btn>
          <Btn onClick={confirmReset} disabled={loading}>{loading ? "Saving…" : "Reset Password"}</Btn>
        </div>
      </Modal>

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </>
  );
});

export default UserFormModal;
