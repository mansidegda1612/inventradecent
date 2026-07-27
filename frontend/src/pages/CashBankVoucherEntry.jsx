import { useState, useRef } from "react";
import { fmt, fmtDateShort } from "../utils/format";
import { callAPI } from "../utils/callserver";
import { Card, PageHeader, DataGrid, ToastProvider, ConfirmModal } from "../components/ui/index";
import VoucherFormModal from "./VoucherFormModal";

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC CASH / BANK VOUCHER ENTRY
// type="CR" → Cash/Bank Receipt (from a customer, settles SI bills)
// type="CP" → Cash/Bank Payment (to a supplier,  settles PI bills)
// The add/edit form now lives in the reusable <VoucherFormModal>, so the
// Sale/Purchase lists can pop the very same form open pre-filled. This page
// is just the listing + delete around it.
// ─────────────────────────────────────────────────────────────────────────────
export default function CashBankVoucherEntry({ type = "CR" }) {
  const isReceipt = type === "CR";
  const pageTitle = isReceipt ? "Cash / Bank Receipt" : "Cash / Bank Payment";
  const pageSub = isReceipt
    ? "Record money received from customers and adjust against their bills"
    : "Record money paid to suppliers and adjust against their bills";

  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadModelRef = useRef({});
  const voucherRef = useRef(null);

  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [focusedData, setfocusedData] = useState({});

  const show = (msg, kind = "success") => {
    setToasts({ open: true, msg, type: kind });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  const fetchTransactions = async (loadModel) => {
    try {
      loadModelRef.current = loadModel;
      let url = "transactions";
      url += `?page=${loadModel.page}`;
      url += `&limit=${loadModel.pageSize}`;
      url += `&from=${loadModel.dateFrom}`;
      url += `&to=${loadModel.dateTo}`;
      url += `&type=${type}`;
      url += loadModel.search ? `&search=${loadModel.search}` : "";
      setLoading(true);
      const res = await callAPI(url, "GET");
      if (res.success) {
        if (loadModel.exportAll) return res?.data;
        setList(res?.data ?? []);
        setTotal(res?.pagination?.total ?? 0);
      }
    } catch (err) {
      console.error("Error fetching vouchers:", err);
    } finally {
      setLoading(false);
    }
  };

  const deleteVoucher = async (confirm, data) => {
    setfocusedData(data);
    if (!confirm) { setConfirmOpen(true); return; }
    try {
      setLoading(true);
      const res = await callAPI(`transactions/${focusedData.transaction_id ?? focusedData.id}`, "DELETE");
      show(res.message, res.success ? "success" : "error");
      if (res.success) await fetchTransactions(loadModelRef.current);
    } catch (err) {
      show("Error deleting voucher", "error");
      console.error(err);
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div>
      <PageHeader title={pageTitle} sub={pageSub} />

      <Card noPad>
        <DataGrid
          title=""
          dateFilter={true}
          columns={[
            { key: "payment_mode", label: "Mode", render: (v) => <span className="u-text u-bold">{v}</span> },
            { key: "bill_no", label: "Voucher No", render: (v) => <span className="u-text u-bold">{v}</span> },
            { key: "date", label: "Date", render: (v) => <span>{fmtDateShort(v)}</span> },
            { key: "customer_name", label: isReceipt ? "Customer" : "Supplier" },
            { key: "ref_no", label: "Ref No" },
            { key: "final_amount", label: "Amount", render: (v) => <span className="u-text u-bold">{fmt(v)}</span> },
          ]}
          data={list}
          lazy={true}
          total={total}
          onFetch={(loadModel) => fetchTransactions(loadModel)}
          HeaderButtons={[
            {
              key: "Add", label: isReceipt ? "Add Receipt" : "Add Payment", icon: "+",
              variant: "primary", hotkey: "ctrl+a",
              onClick: () => voucherRef.current?.openAdd(),
            },
          ]}
          footerButtons={[
            { key: "edit", label: "Edit", icon: "⬇", hotkey: "ctrl+e", onClick: (ids, all, focused) => voucherRef.current?.openEdit(focused) },
            { key: "del", label: "Delete", icon: "🗑", variant: "danger", hotkey: "ctrl+d", onClick: (ids, all, focused) => deleteVoucher(false, focused) },
          ]}
        />
      </Card>

      <VoucherFormModal type={type} ref={voucherRef} onSaved={() => fetchTransactions(loadModelRef.current)} />

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteVoucher(true)}
        title={isReceipt ? "Delete Receipt" : "Delete Payment"}
        message="Are you sure? The customer/supplier ledger balance will be reversed."
      />
    </div>
  );
}
