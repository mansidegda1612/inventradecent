import { useState, useRef } from "react";
import { C } from "../utils/theme";
import { fmt, fmtNum, fmtDateShort } from "../utils/format";
import { callAPI } from "../utils/callserver";
import {
  Card,
  Modal,
  PageHeader,
  DataGrid,
  ToastProvider,
  ConfirmModal,
} from "../components/ui/index";

import {
  VoucherHeader,
  BillAdjustmentGrid,
  VoucherSummary,
  TransactionActions,      // reused as-is — same Save/Cancel/Print shape
} from "../components/ui/Transactioncomponents";

import {
  getEmptyVoucherForm,
  calcVoucherTotals,
  autoAllocateFIFO,
} from "../utils/TransactionUtils";

import AccountFormModal from "./AccountFormModal";

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC CASH / BANK VOUCHER ENTRY
// type="CR" → Cash/Bank Receipt (from a customer, settles SI bills)
// type="CP" → Cash/Bank Payment (to a supplier,  settles PI bills)
// Thin wrappers CashReceiptEntry.jsx / CashPaymentEntry.jsx just set `type`.
// ─────────────────────────────────────────────────────────────────────────────

export default function CashBankVoucherEntry({ type = "CR" }) {
  const isReceipt = type === "CR";
  const billType = isReceipt ? "SI" : "PI"; // which bills this voucher can settle
  const pageTitle = isReceipt ? "Cash / Bank Receipt" : "Cash / Bank Payment";
  const pageSub = isReceipt
    ? "Record money received from customers and adjust against their bills"
    : "Record money paid to suppliers and adjust against their bills";

  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadModelRef = useRef({});

  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(getEmptyVoucherForm(type));

  const [customers, setCustomers] = useState([]);
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const accountRef = useRef(null);

  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [focusedData, setfocusedData] = useState({});

  const { totalAdjusted, voucherAmount, onAccount } = calcVoucherTotals(
    form.adjustments,
    form.final_amount
  );

  const show = (msg, kind = "success") => {
    setToasts({ open: true, msg, type: kind });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  // ── fetch list ────────────────────────────────────────────────────────────
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

  const fetchCustomers = async () => {
    const res = await callAPI("customers", "GET");
    if (res.success) setCustomers(res.data ?? []);
  };

  const handleAccountSaved = async () => {
    const res = await callAPI("customers", "GET");
    if (res.success) setCustomers(res.data ?? []);
  };

  // ── fetch pending bills for the selected party ─────────────────────────────
  const fetchPendingBills = async (customerId, excludeVoucherId = 0) => {
    if (!customerId) { setBills([]); return; }
    setBillsLoading(true);
    try {
      const url =
        `transactions/pending-bills?customer_id=${customerId}` +
        `&bill_type=${billType}&exclude_voucher_id=${excludeVoucherId}`;
      const res = await callAPI(url, "GET");
      setBills(res.success ? res.data ?? [] : []);
    } catch (err) {
      console.error("Error fetching pending bills:", err);
      setBills([]);
    } finally {
      setBillsLoading(false);
    }
  };

  // ── open modal (add / edit) ─────────────────────────────────────────────────
  const open = async (row) => {
    await fetchCustomers();
    if (row) {
      const res = await callAPI(`transactions/${row.transaction_id}`, "GET");
      if (!res.success) { show("Failed to load voucher", "error"); return; }
      const d = res.data;
      const adjustments = {};
      for (const a of d.adjustments ?? []) {
        adjustments[a.bill_transaction_id] = String(a.adjusted_amount);
      }
      setForm({
        trans_type: type,
        payment_mode: d.payment_mode ?? "Cash",
        bill_no: d.bill_no ?? "",
        date: (d.date ?? "").slice(0, 10),
        customer_id: d.customer_id ?? null,
        ref_no: d.ref_no ?? "",
        narration: d.narration ?? "",
        final_amount: d.final_amount ?? "",
        adjustments,
      });
      setEdit(row.transaction_id);
      await fetchPendingBills(d.customer_id, row.transaction_id);
    } else {
      setForm(getEmptyVoucherForm(type));
      setBills([]);
      setEdit(null);
    }
    setModal(true);
  };

  // ── field updates ───────────────────────────────────────────────────────────
  const updateCustomer = async (customerId) => {
    setForm((f) => ({ ...f, customer_id: customerId, adjustments: {} }));
    await fetchPendingBills(customerId, edit ?? 0);
  };

  const updateAdjustment = (billId, value, pendingAmount) => {
    setForm((f) => {
      const amt = value === "" ? "" : Math.min(parseFloat(value) || 0, pendingAmount);
      return {
        ...f,
        adjustments: { ...f.adjustments, [billId]: amt === "" ? "" : String(amt) },
      };
    });
  };

  const autoAllocate = () => {
    setForm((f) => ({
      ...f,
      adjustments: autoAllocateFIFO(bills, f.final_amount),
    }));
  };

  // ── save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.bill_no) { show("Voucher No is required!", "error"); return; }
    if (!form.customer_id) { show(isReceipt ? "Please select a customer!" : "Please select a supplier!", "error"); return; }
    if (!form.final_amount || parseFloat(form.final_amount) <= 0) { show("Voucher amount is required!", "error"); return; }
    if (totalAdjusted > parseFloat(form.final_amount) + 0.01) {
      show("Adjusted amount cannot exceed voucher amount!", "error");
      return;
    }

    const payload = {
      trans_type: type,
      payment_mode: form.payment_mode,
      bill_no: form.bill_no,
      date: form.date,
      customer_id: form.customer_id,
      ref_no: form.ref_no,
      narration: form.narration,
      final_amount: parseFloat(form.final_amount),
      adjustments: Object.entries(form.adjustments)
        .filter(([, amt]) => parseFloat(amt) > 0)
        .map(([bill_transaction_id, amount]) => ({
          bill_transaction_id: parseInt(bill_transaction_id),
          amount: parseFloat(amount),
        })),
    };

    try {
      setLoading(true);
      // Same endpoints SI/PI already use — trans_type ("CR"/"CP") is what
      // routes it to the new branch inside those existing handlers.
      const res = edit
        ? await callAPI(`transactions/${edit}`, "PUT", payload)
        : await callAPI("transactions", "POST", payload);
      show(res.message, res.success ? "success" : "error");
      if (res.success) {
        setModal(false);
        await fetchTransactions(loadModelRef.current);
      }
      return res;
    } catch (err) {
      show("Error saving voucher", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── delete (reuses the generic /transactions/:id DELETE route) ────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title={pageTitle} sub={pageSub} />

      <Card noPad>
        <DataGrid
          title=""
          dateFilter={true}
          columns={[
            {
              key: "payment_mode", label: "Mode",
              render: (value) => <span className="u-text u-bold">{value}</span>,
            },
            {
              key: "bill_no", label: "Voucher No",
              render: (value) => <span className="u-text u-bold">{value}</span>,
            },
            {
              key: "date", label: "Date",
              render: (value) => <span>{fmtDateShort(value)}</span>,
            },
            { key: "customer_name", label: isReceipt ? "Customer" : "Supplier" },
            { key: "ref_no", label: "Ref No" },
            {
              key: "final_amount", label: "Amount",
              render: (value) => <span className="u-text u-bold">{fmt(value)}</span>,
            },
          ]}
          data={list}
          lazy={true}
          total={total}
          onFetch={(loadModel) => fetchTransactions(loadModel)}
          HeaderButtons={[
            {
              key: "Add", label: isReceipt ? "Add Receipt" : "Add Payment", icon: "+",
              variant: "primary", hotkey: "ctrl+a",
              onClick: () => open(null),
            },
          ]}
          footerButtons={[
            {
              key: "edit", label: "Edit", icon: "⬇", hotkey: "ctrl+e",
              onClick: (ids, all, focused) => open(focused),
            },
            {
              key: "del", label: "Delete", icon: "🗑", variant: "danger", hotkey: "ctrl+d",
              onClick: (ids, all, focused) => deleteVoucher(false, focused),
            },
          ]}
        />
      </Card>

      {/* ── VOUCHER MODAL ──────────────────────────────────────────────────── */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={edit ? `Edit ${pageTitle}` : `New ${pageTitle}`}
        width={1100}
      >
        <div className="tr-layout">
          <VoucherHeader
            type={type}
            paymentMode={form.payment_mode}
            onPaymentModeChange={(v) => setForm({ ...form, payment_mode: v })}
            billNo={form.bill_no}
            onBillNoChange={(v) => setForm({ ...form, bill_no: v })}
            date={form.date}
            onDateChange={(v) => setForm({ ...form, date: v })}
            refNo={form.ref_no}
            onRefNoChange={(v) => setForm({ ...form, ref_no: v })}
            customerId={form.customer_id}
            customers={customers}
            onCustomerChange={updateCustomer}
            narration={form.narration}
            onNarrationChange={(v) => setForm({ ...form, narration: v })}
            accountFormRef={accountRef}
          />

          {/* Voucher amount toolbar */}
          <div className="tr-toolbar">
            <div className="tr-toolbar-field">
              <div className="tr-toolbar-label">
                {isReceipt ? "Amount Received *" : "Amount Paid *"}
              </div>
              <input
                type="number"
                className="tr-barcode-input u-w220"
                value={form.final_amount}
                onChange={(e) => setForm({ ...form, final_amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="tr-main">
            <div className="tr-sidebar">
              <VoucherSummary
                voucherAmount={voucherAmount}
                totalAdjusted={totalAdjusted}
                onAccount={onAccount}
              />
            </div>

            <div className="tr-right">
              <BillAdjustmentGrid
                bills={bills}
                adjustments={form.adjustments}
                onAdjustmentChange={updateAdjustment}
                onAutoAllocate={autoAllocate}
                voucherAmount={voucherAmount}
                loading={billsLoading}
              />
            </div>
          </div>

          <TransactionActions
            onSave={save}
            onCancel={() => setModal(false)}
            loading={loading}
            canSave={!!form.bill_no && !!form.customer_id && !!form.final_amount}
            onPrint={async () => { await save(); }}
          />
        </div>
      </Modal>

      <AccountFormModal ref={accountRef} onSaved={handleAccountSaved} />

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