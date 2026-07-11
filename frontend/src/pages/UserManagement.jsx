import { useRef, useState } from "react";
import { Card, PageHeader, DataGrid, ToastProvider, Badge } from "../components/ui/index";
import { callAPI } from "../utils/callserver";
import { useAuth } from "../context/AuthContext";
import UserFormModal from "./UserFormModal";

export default function UserManagement() {
  const { hasRight } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const loadModelRef = useRef({});
  const userRef = useRef(null);

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  const fetchUsers = async (loadModel) => {
    try {
      loadModelRef.current = loadModel || {};
      setLoading(true);
      const res = await callAPI("users", "GET");
      const rows = res?.data ?? [];
      setList(rows);
      setTotal(rows.length);
      return rows;
    } catch {
      show("Error fetching users", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaved = () => fetchUsers(loadModelRef.current);

  return (
    <div>
      <PageHeader title="User Management" sub="Create users, assign a role, and grant any extra rights." />

      <Card noPad>
        <DataGrid
          title=""
          columns={[
            { key: "name", label: "Name", render: v => <span className="u-text u-bold">{v}</span> },
            { key: "user_id", label: "Login ID" },
            { key: "role_name", label: "Role", render: v => v || <span className="u-hint">—</span> },
            {
              key: "rights", label: "Extra Rights",
              render: v => {
                const arr = Array.isArray(v) ? v : [];
                return arr.length
                  ? <span className="u-muted u-fs12">+{arr.length} extra</span>
                  : <span className="u-hint">Role default</span>;
              },
            },
            {
              key: "is_active", label: "Status",
              render: v => v ? <Badge color="#1D9E75">Active</Badge> : <Badge color="#E24B4A">Disabled</Badge>,
            },
            {
              key: "last_login", label: "Last Login",
              render: v => v ? new Date(v).toLocaleString() : <span className="u-hint">Never</span>,
            },
          ]}
          data={list}
          total={total}
          loading={loading}
          onFetch={fetchUsers}
          HeaderButtons={hasRight("users.create") ? [
            { key: "Add", label: "Add User", icon: "+", variant: "primary", onClick: () => userRef.current?.openAdd() },
          ] : []}
          footerButtons={[
            ...(hasRight("users.edit") ? [{
              key: "edit", label: "Edit", icon: "⬇",
              onClick: (ids, all, focused) => userRef.current?.openEdit(focused),
            }] : []),
            ...(hasRight("users.edit") ? [{
              key: "reset", label: "Reset Password", icon: "⟲",
              onClick: (ids, all, focused) => userRef.current?.openResetPassword(focused),
            }] : []),
            ...(hasRight("users.delete") ? [{
              key: "del", label: "Delete", icon: "🗑", variant: "danger",
              onClick: (ids, all, focused) => userRef.current?.openDelete(focused),
            }] : []),
          ]}
        />
      </Card>

      <UserFormModal ref={userRef} onSaved={handleSaved} />
      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </div>
  );
}
