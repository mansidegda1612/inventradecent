import { useRef, useState } from "react";
import { Card, PageHeader, DataGrid, ToastProvider } from "../components/ui/index";
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

  return (
    <div>
      <PageHeader title="Role Management" sub="Define roles and the rights each one grants." />

      <Card noPad>
        <DataGrid
          title=""
          columns={[
            { key: "role", label: "Role Name", render: v => <span className="u-text u-bold">{v}</span> },
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
              onClick: (ids, all, focused) => roleRef.current?.openEdit(focused),
            }] : []),
            ...(hasRight("roles.delete") ? [{
              key: "del", label: "Delete", icon: "🗑", variant: "danger",
              onClick: (ids, all, focused) => roleRef.current?.openDelete(focused),
            }] : []),
          ]}
        />
      </Card>

      <RoleFormModal ref={roleRef} onSaved={handleSaved} />
      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </div>
  );
}
