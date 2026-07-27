import { useState, useRef, useImperativeHandle, forwardRef } from "react";
import { Modal, ToastProvider } from "../components/ui/index";
import {
  VoucherHeader,
  BillAdjustmentGrid,
  VoucherSummary,
  TransactionNotes,
  TransactionActions,
} from "../components/ui/Transactioncomponents";
import { getEmptyVoucherForm, calcVoucherTotals, autoAllocateFIFO } from "../utils/TransactionUtils";
import { callAPI } from "../utils/callserver";
import AccountFormModal from "./AccountFormModal";

// Reusable Cash/Bank Receipt (type="CR") or Payment (type="CP") entry modal.
// Used by CashBankVoucherEntry (its Add/Edit) AND by the Sale/Purchase lists,
// which call openForBill(bill) to pop it open pre-filled against one bill so
// the user just verifies and saves — no need to visit the receipt/payment page.
//
//   const ref = useRef();
//   <VoucherFormModal type="CR" ref={ref} onSaved={refresh} />
//   ref.current.openAdd() | openEdit(row) | openForBill(bill)
const VoucherFormModal = forwardRef(function VoucherFormModal({ type = "CR", onSaved }, ref) {
  const isReceipt = type === "CR";
  const billType = isReceipt ? "SI" : "PI";
  const pageTitle = isReceipt ? "Cash / Bank Receipt" : "Cash / Bank Payment";

  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(getEmptyVoucherForm(type));
  const [customers, setCustomers] = useState([]);
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const accountRef = useRef(null);

  const { totalAdjusted, voucherAmount, onAccount } = calcVoucherTotals(form.adjustments, form.final_amount);

  const show = (msg, kind = "success") => {
    setToasts({ open: true, msg, type: kind });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  const fetchCustomers = async () => {
    const res = await callAPI("customers", "GET");
    if (res.success) setCustomers(res.data ?? []);
  };
  const handleAccountSaved = fetchCustomers;

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

  const nextVoucherNo = async () => {
    const res = await callAPI(`transactions/next-bill-no?type=${type}`, "GET");
    return res.success ? res.data.bill_no : "";
  };

  useImperativeHandle(ref, () => ({
    openAdd: async () => {
      await fetchCustomers();
      setForm({ ...getEmptyVoucherForm(type), bill_no: await nextVoucherNo() });
      setBills([]);
      setEdit(null);
      setModal(true);
    },
    openEdit: async (row) => {
      if (!row) return;
      await fetchCustomers();
      const res = await callAPI(`transactions/${row.transaction_id}`, "GET");
      if (!res.success) { show("Failed to load voucher", "error"); return; }
      const d = res.data;
      const adjustments = {};
      for (const a of d.adjustments ?? []) adjustments[a.bill_transaction_id] = String(a.adjusted_amount);
      setForm({
        trans_type: type,
        payment_mode: d.payment_mode ?? "Cash",
        bill_no: d.bill_no ?? "",
        date: (d.date ?? "").slice(0, 10),
        customer_id: d.customer_id ?? null,
        ref_no: d.ref_no ?? "",
        notes: d.notes ?? "",
        final_amount: d.final_amount ?? "",
        adjustments,
      });
      setEdit(row.transaction_id);
      await fetchPendingBills(d.customer_id, row.transaction_id);
      setModal(true);
    },
    // Pre-fill a new voucher against ONE bill selected on the Sale/Purchase list.
    openForBill: async (bill) => {
      if (!bill) return;
      if (bill.cord !== "D" || !bill.customer_id) {
        show(isReceipt
          ? "Receipts apply only to Debit Entry"
          : "Payments apply only to Debit Entry", "error");
        return;
      }
      const outstanding = Number(bill.outstanding) || 0;
      if (outstanding <= 0) { show("This bill is already fully settled.", "error"); return; }
      await fetchCustomers();
      setForm({
        ...getEmptyVoucherForm(type),
        bill_no: await nextVoucherNo(),
        customer_id: bill.customer_id,
        final_amount: String(outstanding),
        adjustments: { [bill.transaction_id]: String(outstanding) },
      });
      setEdit(null);
      await fetchPendingBills(bill.customer_id, 0);
      setModal(true);
    },
  }));

  const updateCustomer = async (customerId) => {
    setForm((f) => ({ ...f, customer_id: customerId, adjustments: {} }));
    await fetchPendingBills(customerId, edit ?? 0);
  };

  const updateAdjustment = (billId, value, pendingAmount) => {
    setForm((f) => {
      const amt = value === "" ? "" : Math.min(parseFloat(value) || 0, pendingAmount);
      return { ...f, adjustments: { ...f.adjustments, [billId]: amt === "" ? "" : String(amt) } };
    });
  };

  const autoAllocate = () => {
    setForm((f) => ({ ...f, adjustments: autoAllocateFIFO(bills, f.final_amount) }));
  };

  const save = async () => {
    if (!form.bill_no) { show("Voucher No is required!", "error"); return; }
    if (!form.customer_id) { show(isReceipt ? "Please select a customer!" : "Please select a supplier!", "error"); return; }
    if (!form.final_amount || parseFloat(form.final_amount) <= 0) { show("Voucher amount is required!", "error"); return; }
    if (totalAdjusted > parseFloat(form.final_amount) + 0.01) {
      show("Adjusted amount cannot exceed voucher amount!", "error"); return;
    }

    const payload = {
      trans_type: type,
      payment_mode: form.payment_mode,
      bill_no: form.bill_no,
      date: form.date,
      customer_id: form.customer_id,
      ref_no: form.ref_no,
      notes: form.notes,
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
      const res = edit
        ? await callAPI(`transactions/${edit}`, "PUT", payload)
        : await callAPI("transactions", "POST", payload);
      show(res.message, res.success ? "success" : "error");
      if (res.success) { setModal(false); onSaved?.(); }
      return res;
    } catch (err) {
      show("Error saving voucher", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
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
            accountFormRef={accountRef}
          />

          <div className="tr-toolbar">
            <div className="tr-toolbar-field">
              <div className="tr-toolbar-label">{isReceipt ? "Amount Received *" : "Amount Paid *"}</div>
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
              <VoucherSummary voucherAmount={voucherAmount} totalAdjusted={totalAdjusted} onAccount={onAccount} />
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

          <TransactionNotes
            value={form.notes}
            onChange={(v) => setForm({ ...form, notes: v })}
            placeholder={isReceipt ? "Optional note for this receipt…" : "Optional note for this payment…"}
          />

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
    </>
  );
});

export default VoucherFormModal;
