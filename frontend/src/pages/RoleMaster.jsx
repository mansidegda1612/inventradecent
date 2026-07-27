import { useRef, useState, useEffect } from "react";
import { Card, PageHeader, DataGrid, ToastProvider, Badge } from "../components/ui/index";
import { callAPI } from "../utils/callserver";
import { useAuth } from "../context/AuthContext";
import RoleFormModal from "./RoleFormModal";

export default function RoleMaster() {
  const { hasRight } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const loadModelRef = useRef({});
  const roleRef = useRef(null);

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  const fetchRoles = async (loadModel) => {
    try {
      loadModelRef.current = loadModel || {};
      setLoading(true);
      const res = await callAPI("userroles", "GET");
      const rows = res?.data ?? [];
      setList(rows);
      setTotal(rows.length);
      return rows;
    } catch (err) {
      show("Error fetching roles", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaved = () => fetchRoles(loadModelRef.current);

  // Client-side grid (fetchRoles pulls the whole list) — load once on mount,
  // otherwise the grid stays empty until a save triggers a refetch.
  useEffect(() => { fetchRoles(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // System roles (admin/guest, shared across all accounts) are read-only to
  // tenants — the backend rejects edits/deletes, so block it in the UI too.
  const guardSystem = (focused, fn) => {
    if (focused?.is_system) { show("Built-in roles can't be edited or deleted.", "error"); return; }
    fn();
  };

  return (
    <div>
      <PageHeader title="Role Management" sub="Define roles and the rights each one grants." />

      <Card noPad>
        <DataGrid
          title=""
          columns={[
            { key: "role", label: "Role Name", render: v => <span className="u-text u-bold">{v}</span> },
            {
              key: "is_system", label: "Type",
              render: v => v ? <Badge color="#6B7280">Built-in</Badge> : <Badge color="#4F46E5">Custom</Badge>,
            },
            {
              key: "rights", label: "Rights",
              render: v => {
                const arr = Array.isArray(v) ? v : [];
                if (arr.includes("*")) return <span className="u-accent u-bold">All rights</span>;
                return <span className="u-muted u-fs12">{arr.length} right{arr.length === 1 ? "" : "s"}</span>;
              },
            },
          ]}
          data={list}
          total={total}
          loading={loading}
          onFetch={fetchRoles}
          HeaderButtons={hasRight("roles.create") ? [
            { key: "Add", label: "Add Role", icon: "+", variant: "primary", onClick: () => roleRef.current?.openAdd() },
          ] : []}
          footerButtons={[
            ...(hasRight("roles.edit") ? [{
              key: "edit", label: "Edit", icon: "⬇",
              onClick: (ids, all, focused) => guardSystem(focused, () => roleRef.current?.openEdit(focused)),
            }] : []),
            ...(hasRight("roles.delete") ? [{
              key: "del", label: "Delete", icon: "🗑", variant: "danger",
              onClick: (ids, all, focused) => guardSystem(focused, () => roleRef.current?.openDelete(focused)),
            }] : []),
          ]}
        />
      </Card>

      <RoleFormModal ref={roleRef} onSaved={handleSaved} />
      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </div>
  );
}
