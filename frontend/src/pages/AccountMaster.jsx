/**
 * AccountMaster
 *
 * Full-page screen: DataGrid listing + Add/Edit/Delete via AccountFormModal ref.
 * Also embeds GroupMaster for inline group management from the Group dropdown.
 *
 * When opened from the sidebar menu → shows DataGrid.
 * AccountFormModal is also importable by other screens (e.g. PurchaseEntry)
 * as a hidden ref-controlled component — no DataGrid rendered there.
 */

import { useState, useRef } from "react";
import { C } from "../utils/theme";
import { Btn, Card, PageHeader, DataGrid, ToastProvider, ConfirmModal, BalancePill } from "../components/ui/index";
import { callAPI } from "../utils/callserver";
import GroupMaster from "./GroupMaster";
import AccountFormModal from "./AccountFormModal";

export default function AccountMaster() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });

  const loadModelRef = useRef({});
  const accountRef = useRef(null);  // → AccountFormModal
  const groupRef = useRef(null);  // → GroupMaster

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  // ── Fetch list (called by DataGrid lazy mode) ─────────────────────────────
  const fetchAccounts = async (loadModel) => {
    try {
      loadModelRef.current = loadModel;
      let url = `customers?page=${loadModel.page}&limit=${loadModel.pageSize}`;
      if (loadModel.search) url += `&search=${loadModel.search}`;
      setLoading(true);
      const res = await callAPI(url, "GET");
      if (loadModel.exportAll) {
        return res?.data;
      }
      else {
        setList(res?.data ?? []);
        setTotal(res?.pagination?.total ?? 0);
      }
    } catch (err) {
      console.error("Error fetching accounts:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── Called by AccountFormModal after any save/delete ──────────────────────
  const handleAccountSaved = async () => {
    await fetchAccounts(loadModelRef.current);
  };

  // ── Called by GroupMaster after group changes (refreshes group dropdown) ──
  const handleGroupSaved = async () => {
    // AccountFormModal re-fetches groups when it opens, so nothing extra needed here.
    // But if you have a group column in the grid you may want to refresh:
    await fetchAccounts(loadModelRef.current);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Account Master"
        sub="Manage customers and suppliers."
      />

      <Card noPad>
        <DataGrid
          title=""
          columns={[
            {
              key: "name", label: "Name",
              render: (v) => <span style={{ fontWeight: 600, color: C.text }}>{v}</span>,
            },
            { key: "group_name", label: "Group" },
            { key: "city", label: "City" },
            { key: "gstin", label: "GST No." },
            { key: "contact_no", label: "Contact No" },
            {
              key: "opening", label: "Opening Balance",
              render: (v) => <BalancePill value={v} />,
            },
          ]}
          data={list}
          lazy
          total={total}
          loading={loading}
          onFetch={fetchAccounts}
          HeaderButtons={[
            {
              key: "Add", label: "Add Account", icon: "+",
              variant: "primary", hotkey: "ctrl+a",
              onClick: () => accountRef.current?.openAdd(),
            },
          ]}
          footerButtons={[
            {
              key: "edit", label: "Edit", icon: "⬇", hotkey: "ctrl+e",
              onClick: (ids, all, focused) => accountRef.current?.openEdit(focused),
            },
            {
              key: "del", label: "Delete", icon: "🗑", variant: "danger", hotkey: "ctrl+d",
              onClick: (ids, all, focused) => accountRef.current?.openDelete(focused),
            },
          ]}
        />
      </Card>

      {/*
        AccountFormModal: invisible until openAdd/openEdit/openDelete is called.
        onSaved refreshes the grid.
        groupRef lets AccountFormModal manage groups inline from its Group dropdown.
      */}
      <AccountFormModal
        ref={accountRef}
        onSaved={handleAccountSaved}
        groupRef={groupRef}   // pass down so the dropdown footer buttons work
      />

      {/* GroupMaster: invisible, manages group CRUD via ref */}
      <GroupMaster ref={groupRef} onSaved={handleGroupSaved} />

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </div>
  );
}