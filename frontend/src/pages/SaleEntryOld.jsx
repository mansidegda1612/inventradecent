import { useState, useRef, useCallback } from "react";
import { C } from "../utils/theme";
import { fmt, fmtDateShort } from "../utils/format";
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
  ProductSearchPanel,
  ProductEntryGrid,
  TransactionSummary,
  TransactionActions,
} from "../components/ui/TransactionComponents";

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

export default function SaleEntry() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadModelRef = useRef({});

  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(getEmptyForm());

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [barInput, setBarInput] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const barRef = useRef(null);

  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [focusedData, setFocusedData] = useState(null);

  // ── toast ─────────────────────────────────────────────────────────────────
  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  // ── fetch list ────────────────────────────────────────────────────────────
 const fetchTransactions = async (loadModel) => {
      try {
        loadModelRef.current = loadModel
      
        let url = "transactions";
        url += `?page=${loadModel.page}`;
        url += `&limit=${loadModel.pageSize}`;
        url += loadModel.search ? `&search=${loadModel.search}` : "";
        //console.log(url);
        setLoading(true);
        const res = await callAPI(url, "GET");
        if (res.success) {
          setList(res?.data ?? []);
          setTotal(res?.pagination?.total ?? 0)
        }
      } catch (err) {
        console.error("Error fetching transactions:", err);
      } finally {
        setLoading(false);
      }
    };

  

  // ── fetch lookups ─────────────────────────────────────────────────────────
  const fetchCustomers = async () => {
    const res = await callAPI("customers?page=1&limit=500", "GET");
    if (res.success)
      setCustomers((res.data ?? []).map((c) => ({ id: c.id, name: c.name })));
  };

  const fetchProducts = async () => {
    const res = await callAPI("products?page=1&limit=500", "GET");
    if (res.success) setProducts(res.data ?? []);
  };

  // ── open modal ────────────────────────────────────────────────────────────
  const open = async (row) => {
    await Promise.all([fetchCustomers(), fetchProducts()]);
    if (row) {
      const res = await callAPI(`transactions/${row.transaction_id ?? row.id}`, "GET");
      if (!res.success) {
        show("Failed to load transaction", "error");
        return;
      }
      const d = res.data;
      setForm({
        cash_debit: d.cash_debit ?? "C",
        customer_id: d.customer_id ?? null,
        customer_name_cash: d.customer_name ?? "",
        bill_no: d.bill_no ?? "",
        date: (d.date ?? today()).slice(0, 10),
        isGSTBill: d.isGSTBill ?? true, // Default to GST bill
        items: (d.items ?? []).map((i) => {
          const cgst_pct = i.taxable_amount
            ? (i.CGST / i.taxable_amount) * 100
            : 0;
          const sgst_pct = i.taxable_amount
            ? (i.SGST / i.taxable_amount) * 100
            : 0;
          return {
            product_id: i.product_id,
            name: i.product_name ?? "",
            qty: parseFloat(i.qty) || 1,
            rate: parseFloat(i.rate) || 0,
            cgst_pct,
            sgst_pct,
            taxable_amount: parseFloat(i.taxable_amount) || 0,
            CGST: parseFloat(i.CGST) || 0,
            SGST: parseFloat(i.SGST) || 0,
          };
        }),
        expenses: d.expenses
          ? d.expenses.map((e) => ({ ...e }))
          : DEFAULT_EXPENSES.map((e) => ({ ...e })),
        roundoff: parseFloat(d.ROUNDOFF) || 0,
        roundoff_type: "₹",
      });
      setEdit(row.transaction_id ?? row.id);
    } else {
      const bnRes = await callAPI("transactions/next-bill-no", "GET");
      setForm({
        ...getEmptyForm(),
        bill_no: bnRes.success ? bnRes.data.bill_no : "",
      });
      setEdit(null);
    }
    setBarInput("");
    setProductSearch("");
    setModal(true);
  };

  // ── save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.bill_no) {
      show("Bill No is required!", "error");
      return;
    }
    if (!form.items.length) {
      show("Add at least one item!", "error");
      return;
    }
    if (form.cash_debit === "D" && !form.customer_id) {
      show("Please select a customer!", "error");
      return;
    }
    if (form.cash_debit === "C" && !form.customer_name_cash.trim()) {
      show("Please enter customer name!", "error");
      return;
    }

    const totals = calcTotals(form.items, form.expenses, form.roundoff, form.isGSTBill);

    const payload = {
      trans_type: "SI",
      cash_debit: form.cash_debit,
      bill_no: form.bill_no,
      date: form.date,
      customer_id:
        form.cash_debit === "D"
          ? form.customer_id
          : form.customer_id || 1,
      discount: 0,
      roundoff: parseFloat(form.roundoff) || 0,
      final_amount: totals.final,
      isGSTBill: form.isGSTBill,
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
      show("Error saving transaction", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteTransaction = async (confirm) => {
    if (!confirm) {
      setConfirmOpen(true);
      return;
    }
    try {
      setLoading(true);
      const res = await callAPI(`transactions/${focusedData.transaction_id ?? focusedData.id}`, "DELETE");
      show(res.message, res.success ? "success" : "error");
      if (res.success) await fetchTransactions(loadModelRef.current);
    } catch (err) {
      show("Error deleting transaction", "error");
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
      const gst = splitGST(product.gst_percent || 0);
      const newItem = {
        product_id: product.id,
        name: product.name,
        qty: 1,
        rate: product.sale_rate || 0,
        cgst_pct: gst.cgst,
        sgst_pct: gst.sgst,
        taxable_amount: 0,
        CGST: 0,
        SGST: 0,
      };
      const amounts = calcItemAmounts(newItem);
      setForm((f) => ({
        ...f,
        items: [...f.items, { ...newItem, ...amounts }],
      }));
      show(`Added ${product.name}`, "success");
    }
    if (barRef.current) barRef.current.focus();
  };

  const scanBarcode = (barcode) => {
    const clean = barcode.trim();
    if (!clean) return;
    const product = products.find((p) => p.barcode === clean);
    if (product) {
      addProduct(product);
      setBarInput("");
    } else {
      show("Product not found", "error");
    }
  };

  const updateItem = (index, field, value) => {
    setForm((f) => {
      const updated = [...f.items];
      const item = { ...updated[index] };

      if (field === "qty" || field === "rate") {
        item[field] = parseFloat(value) || 0;
        const amounts = calcItemAmounts(item);
        updated[index] = { ...item, ...amounts };
      } else if (field === "cgst_pct") {
        item.cgst_pct = parseFloat(value) || 0;
        const amounts = calcItemAmounts(item);
        updated[index] = { ...item, ...amounts };
      } else if (field === "sgst_pct") {
        item.sgst_pct = parseFloat(value) || 0;
        const amounts = calcItemAmounts(item);
        updated[index] = { ...item, ...amounts };
      }

      return { ...f, items: updated };
    });
  };

  const removeItem = (index) => {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }));
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

  // ── computed values ───────────────────────────────────────────────────────
  const filteredProducts = products.filter(
    (p) =>
      p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const totals = calcTotals(form.items, form.expenses, form.roundoff, form.isGSTBill);
  const { subtotal, itemAmount, final } = totals;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Sales Entry"
        sub="Create and manage sales invoices"
      />

      <Card noPad>
       <DataGrid
                   title=""
                   columns={[
                     {
                       key: "bill_no",
                       label: "Bill No",
                       render: (value, row) => {
                         return <span style={{ fontWeight: 600, color: C.text }}>{value}</span>;
                       },
                     },
                    { key: "date", label: "Date" ,
                       render: (value, row) => {
                         return <span>{fmtDateShort(value)}</span>;
                       },
                    },
                     { key: "customer_name", label: "Customer" },
                     { key: "item_count", label: "No Items" },
                     { key: "final_amount", label: "Bill Amount" , render: (value, row) => {
                         return <span style={{ fontWeight: 600, color: C.text }}>{value}</span>;
                       },},
                   ]}
                   data={list} // each item must have an `id` field
                   pageSize={15}
                   lazy={true}
                   total={total}
                   selectable={true}
                   onFetch={(loadModel) => {
                     fetchTransactions(loadModel);
                   }}
                   HeaderButtons={[
                     {
                       key: "Add",
                       label: "Add Sale",
                       icon: "+",
                       variant: "primary",
                       hotkey: "ctrl+a",
                       onClick: (ids, all, focused) => open(null),
                     },
                   ]}
                   footerButtons={[
                     {
                       key: "edit",
                       label: "Edit",
                       icon: "⬇",
                       hotkey: "ctrl+e",
                       onClick: (ids, all, focused) => open(focused),
                     },
                     {
                       key: "del",
                       label: "Delete",
                       icon: "🗑",
                       variant: "danger",
                       hotkey: "ctrl+d",
                       onClick: (ids, all, focused) => deleteTransaction(false, focused),
                     },
                   ]}
                 />
      </Card>

      {/* ── TRANSACTION MODAL ──────────────────────────────────────────── */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={edit ? "Edit Sale" : "New Sale"}
        width={1200}
      >
        <div className="tr-modal-body">
          {/* ── LEFT PANEL ── */}
          <div className="tr-left">
            <TransactionHeader
              creditDebit={form.cash_debit}
              onCreditDebitChange={(v) =>
                setForm((f) => ({ ...f, cash_debit: v }))
              }
              billNo={form.bill_no}
              onBillNoChange={(v) => setForm((f) => ({ ...f, bill_no: v }))}
              date={form.date}
              onDateChange={(v) => setForm((f) => ({ ...f, date: v }))}
              isGSTBill={form.isGSTBill}
              onGSTBillChange={(v) => setForm((f) => ({ ...f, isGSTBill: v }))}
            />

            <div className="tr-divider" />

            <CustomerSelection
              creditDebit={form.cash_debit}
              customerId={form.customer_id}
              customerNameCash={form.customer_name_cash}
              customers={customers}
              onCustomerChange={(v) =>
                setForm((f) => ({ ...f, customer_id: v }))
              }
              onCustomerNameChange={(v) =>
                setForm((f) => ({ ...f, customer_name_cash: v }))
              }
            />
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="tr-right">
            <ProductSearchPanel
              barInput={barInput}
              onBarInputChange={setBarInput}
              onBarcodeScan={scanBarcode}
              productSearch={productSearch}
              onProductSearchChange={setProductSearch}
              filteredProducts={filteredProducts}
              onProductSelect={addProduct}
              barRef={barRef}
            />

            {/* Items Grid */}
            <div className="tr-table-wrap">
              {form.items.length === 0 ? (
                <div className="tr-empty">
                  No items added yet — scan a barcode or search above
                </div>
              ) : (
                <ProductEntryGrid
                  items={form.items}
                  onItemUpdate={updateItem}
                  onItemRemove={removeItem}
                  isGSTBill={form.isGSTBill}
                />
              )}
            </div>

            {/* Summary Section */}
            <TransactionSummary
              itemAmount={itemAmount}
              expenses={form.expenses}
              onExpenseUpdate={updateExpense}
              subtotal={subtotal}
              final={final}
            />

            {/* Action Buttons */}
            <TransactionActions
              onSave={save}
              onCancel={() => setModal(false)}
              loading={loading}
              canSave={form.items.length > 0 && form.bill_no}
            />
          </div>
        </div>
      </Modal>

      {/* ── Toasts ── */}
      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />

      {/* ── Delete confirm ── */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteTransaction(true)}
        title="Delete Sale"
        message="Are you sure you want to delete this sale? Stock and customer balance will be reversed."
      />
    </div>
  );
}