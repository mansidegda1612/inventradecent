import { useState, useRef } from "react";
import { C } from "../utils/theme";
import { fmt, fmtNum, fmtDateShort } from "../utils/format";
import { callAPI } from "../utils/callserver";
import {
  Btn,
  Card,
  Modal,
  Field,
  PageHeader,
  DataGrid,
  Dropdown,
  ToastProvider,
  ConfirmModal,
  Badge,
} from "../components/ui/index";

import {
  TransactionHeader,
  CustomerSelection,
  ProductEntryGrid,
  TransactionSummary,
  TransactionActions,
  ExpenseEntryGrid,
} from "../components/ui/Transactioncomponents";

import {
  calcItemAmounts,
  calcTotals,
  calcExpenseFromPercentage,
  calcPercentageFromExpense,
  getEmptyForm,
  DEFAULT_EXPENSES,
  splitGST,
  today,
} from "../utils/transactionUtils";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function PurchaseEntry() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadModelRef = useRef({});

  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(getEmptyForm());

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);

  const [productSearch, setProductSearch] = useState("");
    const qtyFocusRef = useRef(null); 

  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [focusedData, setfocusedData] = useState({});

  const totals = calcTotals(form.items, form.expenses, form.isGSTBill);
  const { subtotal, itemAmount, final } = totals;

  // ── toast ─────────────────────────────────────────────────────────────────
  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  // ── fetch list ────────────────────────────────────────────────────────────
  const fetchTransactions = async (loadModel) => {
    try {
      loadModelRef.current = loadModel;
      let url = "transactions";
      url += `?page=${loadModel.page}`;
      url += `&limit=${loadModel.pageSize}`;
      url += `&type=PI`;
      url += loadModel.search ? `&search=${loadModel.search}` : "";
      setLoading(true);
      const res = await callAPI(url, "GET");
      if (res.success) {
        setList(res?.data ?? []);
        setTotal(res?.pagination?.total ?? 0);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── fetch lookups ─────────────────────────────────────────────────────────
  const fetchSuppliers = async () => {
    const res = await callAPI("customers", "GET");
    if (res.success) setSuppliers(res.data ?? []);
  };

  // ── open modal ────────────────────────────────────────────────────────────
  const open = async (row) => {
    await fetchSuppliers();
    const prodRes = await callAPI("products", "GET");
    const productList = prodRes.success ? prodRes.data ?? [] : [];
    setProducts(productList);

    if (row) {
      const res = await callAPI(`transactions/${row.transaction_id ?? row.id}`, "GET");
      if (!res.success) {
        show("Failed to load purchase", "error");
        return;
      }
      const d = res.data;
      const subtotal = d.items.reduce((s, i) => s + (i.taxable_amount || 0), 0);
      const expenses = DEFAULT_EXPENSES.map((e) => ({ ...e }));
      for (const item of expenses) {
        item.amount = d[item.key];
        item.pct = calcPercentageFromExpense(subtotal, item.amount);
      }
      const isgstbill = d.isgstbill == 1 ? true : false;
      setForm({
        cash_debit: d.cash_debit ?? "C",
        customer_id: d.customer_id ?? null,
        customer_name_cash: d.customer_name_cash ?? "",
        bill_no: d.bill_no ?? "",
        date: (d.date ?? today()).slice(0, 10),
        isGSTBill: isgstbill,
        items: (d.items ?? []).map((i) => {
          const masterProduct = productList.find(p => p.id === i.product_id);
          const gst = splitGST(masterProduct?.gstPer || 0);
          const cgst_pct = isgstbill && i.taxable_amount
            ? (i.CGST / i.taxable_amount) * 100
            : gst.cgst;
          const sgst_pct = isgstbill && i.taxable_amount
            ? (i.SGST / i.taxable_amount) * 100
            : gst.sgst;
          const itemBase = {
            product_id: i.product_id,
            name: i.product_name ?? "",
            qty: parseFloat(i.qty) || 1,
            rate: parseFloat(i.rate) || 0,
            cgst_pct,
            sgst_pct,
          };
          const amounts = calcItemAmounts(itemBase, isgstbill);
          return { ...itemBase, ...amounts };
        }),
        expenses: expenses,
        roundoff: parseFloat(d.ROUNDOFF) || 0,
        roundoff_type: "₹",
      });
      setEdit(row.transaction_id ?? row.id);
    } else {
      // const bnRes = await callAPI("transactions/next-bill-no", "GET");
      setForm({
        ...getEmptyForm(),
      });
      setEdit(null);
    }
    setProductSearch("");
    setModal(true);
  };

  const updateItem = (index, field, value) => {
    setForm((f) => {
      const updated = [...f.items];
      const item = { ...updated[index] };
      if (field === "qty" || field === "rate" || field === "cgst_pct" || field === "sgst_pct") {
        item[field] = parseFloat(value) || 0;
        const amounts = calcItemAmounts(item, f.isGSTBill);
        updated[index] = { ...item, ...amounts };
      }
      return { ...f, items: updated };
    });
  };

  const removeItem = (index) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  };

  // ── save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.bill_no) { show("Bill No is required!", "error"); return; }
    if (!form.items.length) { show("Add at least one item!", "error"); return; }
    if (form.cash_debit === "D" && !form.customer_id) { show("Please select a supplier!", "error"); return; }
    if (form.cash_debit === "C" && !form.customer_name_cash.trim()) { show("Please enter supplier name!", "error"); return; }

    const totals = calcTotals(form.items, form.expenses, form.isGSTBill);

    for (const item of form.expenses) {
      if (item.key == "roundoff") {
        item.amount = totals.roundoff;
      }
    }

    const payload = {
      trans_type: "PI",
      cash_debit: form.cash_debit,
      bill_no: form.bill_no,
      date: form.date,
      customer_id: form.cash_debit === "D" ? form.customer_id : 0,
      customer_name_cash: form.customer_name_cash,
      discount: form.discount || 0,
      roundoff: parseFloat(totals.roundoff) || 0,
      final_amount: totals.final,
      isGSTBill: form.isGSTBill ? 1 : 0,
      expenses: form.expenses,
      items: form.items.map((i) => ({
        product_id: i.product_id,
        qty: i.qty,
        rate: i.rate,
        taxable_amount: i.taxable_amount,
        CGST: i.CGST,
        SGST: i.SGST,
      })),
    };

    try {
      setLoading(true);
      const res = edit
        ? await callAPI(`transactions/${edit}`, "PUT", payload)
        : await callAPI("transactions", "POST", payload);
      show(res.message, res.success ? "success" : "error");
      if (res.success) {
        setModal(false);
        await fetchTransactions(loadModelRef.current);
      }
    } catch (err) {
      show("Error saving purchase", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteTransaction = async (confirm, data) => {
    setfocusedData(data);
    if (!confirm) { setConfirmOpen(true); return; }
    try {
      setLoading(true);
      const res = await callAPI(`transactions/${focusedData.transaction_id ?? focusedData.id}`, "DELETE");
      show(res.message, res.success ? "success" : "error");
      if (res.success) await fetchTransactions(loadModelRef.current);
    } catch (err) {
      show("Error deleting purchase", "error");
      console.error(err);
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  // ── item management ───────────────────────────────────────────────────────
  const addProduct = (product) => {
    const exists = form.items.find((i) => i.product_id === product.id);
    if (exists) {
      updateItem(form.items.indexOf(exists), "qty", exists.qty + 1);
      show(`Increased quantity for ${product.name}`, "success");
    } else {
      const gst = splitGST(product.gstPer || 0);
      const newItem = {
        product_id: product.id,
        name: product.name,
        qty: 1,
        rate: product.purc_rate || 0,
        cgst_pct: gst.cgst,
        sgst_pct: gst.sgst,
        taxable_amount: 0,
        CGST: 0,
        SGST: 0,
      };
      const amounts = calcItemAmounts(newItem, form.isGSTBill);
      setForm((f) => ({
        ...f,
        items: [...f.items, { ...newItem, ...amounts }],
      }));
      show(`Added ${product.name}`, "success");
       setTimeout(() => {
        if (qtyFocusRef.current) qtyFocusRef.current(form.items.length); // new item index
      }, 0);
    }
  };

  // ── expense management ────────────────────────────────────────────────────
  const updateExpense = (index, field, value) => {
    setForm((f) => {
      const updated = [...f.expenses];
      const exp = { ...updated[index] };
      const subtotal = f.items.reduce((s, i) => s + (i.taxable_amount || 0), 0);
      if (field === "pct") {
        exp.pct = parseFloat(value) || 0;
        exp.amount = calcExpenseFromPercentage(subtotal, exp.pct);
      } else if (field === "amount") {
        exp.amount = parseFloat(value) || 0;
        exp.pct = calcPercentageFromExpense(subtotal, exp.amount);
      }
      updated[index] = exp;
      return { ...f, expenses: updated };
    });
  };

  const handleGSTBillChange = (v) => {
    setForm((f) => ({
      ...f,
      isGSTBill: v,
      items: f.items.map((item) => {
        const amounts = calcItemAmounts(item, v);
        return { ...item, ...amounts };
      }),
    }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Purchase Entry" sub="Create and manage purchase invoices" />

      {/* ── DataGrid listing ──────────────────────────────────────────────── */}
      <Card noPad>
        <DataGrid
          title=""
          columns={[
            {
              key: "cash_debit", label: "Cash/Debit",
              render: (value) => <span style={{ fontWeight: 600, color: C.text }}>{value == "C" ? "Cash" : "Debit"}</span>,
            },
            {
              key: "bill_no", label: "Bill No",
              render: (value) => <span style={{ fontWeight: 600, color: C.text }}>{value}</span>,
            },
            {
              key: "date", label: "Date",
              render: (value) => <span>{fmtDateShort(value)}</span>,
            },
            { key: "customer_name", label: "Supplier" },
            { key: "item_count", label: "No Items" },
            {
              key: "final_amount", label: "Bill Amount",
              render: (value) => <span style={{ fontWeight: 600, color: C.text }}>{value}</span>,
            },
          ]}
          data={list}
          pageSize={15}
          lazy={true}
          total={total}
          selectable={true}
          onFetch={(loadModel) => fetchTransactions(loadModel)}
          HeaderButtons={[
            {
              key: "Add", label: "Add Purchase", icon: "+",
              variant: "primary", hotkey: "ctrl+a",
              onClick: (ids, all, focused) => open(null),
            },
          ]}
          footerButtons={[
            {
              key: "edit", label: "Edit", icon: "⬇", hotkey: "ctrl+e",
              onClick: (ids, all, focused) => open(focused),
            },
            {
              key: "del", label: "Delete", icon: "🗑", variant: "danger", hotkey: "ctrl+d",
              onClick: (ids, all, focused) => deleteTransaction(false, focused),
            },
          ]}
        />
      </Card>

      {/* ── TRANSACTION MODAL ──────────────────────────────────────────────── */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={edit ? "Edit Purchase" : "New Purchase"}
        width={1200}
      >
        <div className="tr-layout">

          {/* ── TOP: Transaction Header + Supplier inline ─────────────────── */}
          <TransactionHeader
            type = {"PI"}
            cashDebit={form.cash_debit}
            oncashDebitChange={(v) => setForm({ ...form, cash_debit: v })}
            billNo={form.bill_no}
            onBillNoChange={(v) => setForm({ ...form, bill_no: v })}
            date={form.date}
            onDateChange={(v) => setForm({ ...form, date: v })}
            isGSTBill={form.isGSTBill}
            onGSTBillChange={handleGSTBillChange}
            customerId={form.customer_id}
            customerNameCash={form.customer_name_cash}
            customers={suppliers}
            onCustomerChange={(v) => setForm({ ...form, customer_id: v })}
            onCustomerNameChange={(v) => setForm({ ...form, customer_name_cash: v })}
          />

          {/* ── TOOLBAR: Product Search only ─────────────────────────────── */}
          <div className="tr-toolbar">
            <div className="tr-toolbar-field" style={{ width: 350 }}>
              <div className="tr-toolbar-label">Select Product</div>
              <Dropdown
                value={productSearch}
                clearable
                options={products}
                onChange={(e, opt) => addProduct(opt)}
              />
            </div>

            {/* Shortcut chips */}
            <div className="tr-chips" style={{ marginLeft: "auto", flexShrink: 0 }}>
              <span className="tr-chip"><kbd>F2</kbd> Product Search</span>
              <span className="tr-chip"><kbd>F4</kbd> Supplier</span>
            </div>
          </div>

          {/* ── MAIN CONTENT: Sidebar (expenses + summary) + Product grid ── */}
          <div className="tr-main">

            {/* LEFT SIDEBAR: Expense grid + Transaction summary */}
            <div className="tr-sidebar">
              <ExpenseEntryGrid
                expenses={form.expenses}
                onExpenseUpdate={updateExpense}
                subtotal={subtotal}
                billAmount={final}
              />

              <TransactionSummary
                itemAmount={subtotal}
                expenses={form.expenses}
                onExpenseUpdate={updateExpense}
                final={final}
                roundoff={totals.roundoff}
                gst={totals.totalGST}
              />
            </div>

            {/* RIGHT: Scrollable Product Grid */}
            <div className="tr-right">
              <ProductEntryGrid
                items={form.items}
                onItemUpdate={updateItem}
                onItemRemove={removeItem}
                isGSTBill={form.isGSTBill}
                 qtyFocusRef={qtyFocusRef} 
              />
            </div>
          </div>

          {/* ── FOOTER: Action Buttons ──────────────────────────────────────── */}
          <TransactionActions
            onSave={save}
            onCancel={() => setModal(false)}
            loading={loading}
            canSave={form.items.length > 0 && !!form.bill_no}
          />

        </div>
      </Modal>

      {/* ── Toasts ── */}
      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />

      {/* ── Delete confirm ── */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteTransaction(true)}
        title="Delete Purchase"
        message="Are you sure you want to delete this purchase? Stock and supplier balance will be reversed."
      />
    </div>
  );
}