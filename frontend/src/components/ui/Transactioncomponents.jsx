import { useState , useEffect,  useRef } from "react";
import { fmt, fmtDateShort, fmtNum } from "../../utils/format";
import { C } from "../../utils/theme";
import { Btn, Field, Dropdown, TableWrap } from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION HEADER
// ─────────────────────────────────────────────────────────────────────────────

export function TransactionHeader({
  type,
  cashDebit,
  oncashDebitChange,
  billNo,
  onBillNoChange,
  date,
  onDateChange,
  isGSTBill,
  onGSTBillChange,
  // Customer props (inline in header)
  customerId,
  customerNameCash,
  customers = [],
  onCustomerChange,
  onCustomerNameChange,
}) {
  return (
    <div className="tr-header">
      {/* Bill Type */}
      <div className="tr-header-segment">
        <div>
          <div className="tr-section-title">Bill Type</div>
          <div className="tr-toggle-group">
            <button
              type="button"
              className={`tr-toggle-btn ${cashDebit === "C" ? "active" : ""}`}
              onClick={() => oncashDebitChange("C")}
            >
              💵 Cash
            </button>
            <button
              type="button"
              className={`tr-toggle-btn ${cashDebit === "D" ? "active" : ""}`}
              onClick={() => oncashDebitChange("D")}
            >
              📋 Debit
            </button>
          </div>
        </div>
      </div>

      <div className="tr-vdivider" />
      {/* Customer — inline beside invoice fields */}
      <div className="tr-header-segment" >
        <div style={{ width: "100%" }}>
          <div className="tr-section-title">
            {type === "PI" ? "Supplier Name" : "Customer Name" }
          </div>
          {cashDebit === "D" ? (
            <div style={{ width: 220 }}>
              <Dropdown
                value={customerId}
                onChange={(v) => onCustomerChange(v)}
                options={customers}
                placeholder={type === "PI" ? "Select Supplier…": "Select customer…"}
                clearable
              />
            </div>
          ) : (
            <input
              // className="tr-barcode-input"
              style={{ maxWidth: 300 }}
              value={customerNameCash}
              onChange={(e) => onCustomerNameChange(e.target.value)}
              placeholder={type === "PI" ? "Supplier Name…" :"Walk-in Customer…"}
            />
          )}
        </div>
      </div>
      <div className="tr-vdivider" />

      {/* Invoice Fields */}
      <div className="tr-header-segment">
        <div>
          <div className="tr-invoice-fields">
            <div>
              <div className="tr-toolbar-label" style={{ marginBottom: 3 }}>Invoice No *</div>
              <input
                className="tr-barcode-input tr-invoice-input-billno"
                value={billNo}
                onChange={(e) => onBillNoChange(e.target.value)}
                style={{ width: 210 }}
              />
            </div>
            <div>
              <div className="tr-toolbar-label" style={{ marginBottom: 3 }}>Date</div>
              <input
                type="date"
                className="tr-barcode-input tr-invoice-input-date"
                value={date}
                onChange={(e) => onDateChange(e.target.value)}
                style={{ width: 210 }}
              />
            </div>
          </div>
        </div>
      </div>


      <div className="tr-vdivider" />

      {/* GST Mode */}
      <div className="tr-header-segment">
        <div>
          <div className="tr-section-title">GST Mode</div>
          <div className="tr-toggle-group">
            <button
              type="button"
              className={`tr-toggle-btn ${isGSTBill === true ? "active" : ""}`}
              onClick={() => onGSTBillChange(true)}
            >
              📊 GST Bill
            </button>
            <button
              type="button"
              className={`tr-toggle-btn ${isGSTBill === false ? "active" : ""}`}
              onClick={() => onGSTBillChange(false)}
            >
              📄 Normal
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER SELECTION
// ─────────────────────────────────────────────────────────────────────────────

export function CustomerSelection({
  cashDebit,
  customerId,
  customerNameCash,
  customers,
  onCustomerChange,
  onCustomerNameChange,
}) {
  return (
    <div className="tr-customer-wrap">
      <div className="tr-section-title">
        {cashDebit === "D" ? "Credit Customer" : "Customer Name"}
      </div>

      {cashDebit === "D" ? (
        <Dropdown
          value={customerId}
          onChange={(v) => onCustomerChange(v)}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="Select customer…"
          clearable
        />
      ) : (
        <input
          className="tr-barcode-input"
          style={{ width: "100%" }}
          value={customerNameCash}
          onChange={(e) => onCustomerNameChange(e.target.value)}
          placeholder="Walk-in Customer…"
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT ENTRY GRID
// ─────────────────────────────────────────────────────────────────────────────

export function ProductEntryGrid({ items, onItemUpdate, onItemRemove, isGSTBill ,qtyFocusRef  }) {
  const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0);
  const totalTaxable = items.reduce((s, i) => s + (i.taxable_amount || 0), 0);
  const totalGST = items.reduce((s, i) => s + (i.CGST || 0) + (i.SGST || 0), 0);
  const totalAmt = items.reduce(
    (s, i) => s + (i.taxable_amount || 0) + (i.CGST || 0) + (i.SGST || 0),
    0
  );

  return (
    <div className="tr-table-card">
      <div className="tr-table-card-header">
        <span className="tr-table-card-title">
          📦 Items List
        </span>
        <span className="tr-table-card-count">{items.length} items</span>
      </div>

      <div className="tr-scroll">
        {items.length === 0 ? (
          <div className="tr-empty-state">
            <span className="tr-empty-state-icon">📋</span>
            <span>No items added — scan a barcode or search above</span>
          </div>
        ) : (
          <table className="tr-items-table-v2">
            <thead>
              <tr>
                {isGSTBill && <th style={{ width: 28 }}></th>}
                <th style={{ width: 28 }} className="center">#</th>
                <th>Product</th>
                <th className="right">Qty</th>
                <th className="right">Rate</th>
                {isGSTBill && <th className="right">Taxable</th>}
                {isGSTBill && <th className="right">GST</th>}
                <th className="right">Total</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <ProductEntryRow
                  key={i}
                  item={item}
                  index={i}
                  onUpdate={onItemUpdate}
                  onRemove={onItemRemove}
                  isGSTBill={isGSTBill}
                  qtyFocusRef={qtyFocusRef}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sticky totals footer */}
      {items.length > 0 && (
        <div className="tr-table-footer">
          <div className="tr-table-footer-item">
            <span className="tr-table-footer-label">Qty</span>
            <span className="tr-table-footer-value">{fmtNum(totalQty)}</span>
          </div>
          {isGSTBill && (
            <div className="tr-table-footer-item">
              <span className="tr-table-footer-label">Taxable</span>
              <span className="tr-table-footer-value">{fmtNum(totalTaxable)}</span>
            </div>
          )}
          {isGSTBill && (
            <div className="tr-table-footer-item">
              <span className="tr-table-footer-label">GST</span>
              <span className="tr-table-footer-value">{fmtNum(totalGST)}</span>
            </div>
          )}
          <div className="tr-table-footer-item">
            <span className="tr-table-footer-label">Total</span>
            <span className="tr-table-footer-value accent">{fmtNum(totalAmt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT ENTRY ROW (expandable GST)
// ─────────────────────────────────────────────────────────────────────────────

function ProductEntryRow({ item, index, onUpdate, onRemove, isGSTBill,qtyFocusRef }) {
  const [open, setOpen] = useState(false);
  const lineTotal = (item.taxable_amount || 0) + (item.CGST || 0) + (item.SGST || 0);
  const totalGST = (item.CGST || 0) + (item.SGST || 0);
  const qtyInputRef = useRef(null);

  // Register this row's focus function into the parent ref
  useEffect(() => {
    if (qtyFocusRef) {
      qtyFocusRef.current = (targetIndex) => {
        if (targetIndex === index && qtyInputRef.current) {
          qtyInputRef.current.focus();
          qtyInputRef.current.select(); // optional: select all for easy overwrite
        }
      };
    }
  });

  // Prevent typing beyond maxDigits; always allow control keys
  const handleMaxDigits = (maxDigits) => (e) => {
    const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Enter"];
    if (allowed.includes(e.key)) return;
    if (e.key === "-") { e.preventDefault(); return; }
    // count only digit characters (ignore existing decimal point)
    const digits = e.target.value.replace(/[^0-9]/g, "");
    if (digits.length >= maxDigits) e.preventDefault();
  };

  return (
    <>
      <tr className={`tr-row-main ${open ? "tr-row-expanded" : ""}`}>
        {isGSTBill && (
          <td className="center">
            <button
              type="button"
              className={`tr-expand-toggle ${open ? "open" : ""}`}
              onClick={() => setOpen((o) => !o)}
              title={open ? "Collapse GST" : "Expand GST"}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4 2.5L8 6L4 9.5" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </td>
        )}
        <td className="center" style={{ color: "var(--tr-hint)", fontSize: 11 }}>
          {index + 1}
        </td>
        <td>
          <span className="tr-cell-name" title={item.name}>{item.name}</span>
        </td>
        <td className="right">
          <input
            ref={qtyInputRef}      
            type="number"
            className="tr-cell-input"
            value={item.qty}
            onChange={(e) => onUpdate(index, "qty", e.target.value)}
            onKeyDown={handleMaxDigits(4)}
          />
        </td>
        <td className="right">
          <input
            type="number"
            className="tr-cell-input"
            value={item.rate}
            onChange={(e) => onUpdate(index, "rate", e.target.value)}
            onKeyDown={handleMaxDigits(7)}
          />
        </td>
        {isGSTBill && <td className="right tr-cell-mono">{fmtNum(item.taxable_amount)}</td>}
        {isGSTBill && <td className="right tr-cell-mono">{fmtNum(totalGST)}</td>}
        <td className="right tr-cell-total">{fmtNum(lineTotal)}</td>
        <td className="center">
          <button
            type="button"
            className="tr-remove-btn"
            onClick={() => onRemove(index)}
            title="Remove item"
          >
            ×
          </button>
        </td>
      </tr>

      {/* GST Detail Row */}
      {isGSTBill && open && (
        <tr className="tr-row-detail">
          <td colSpan={9}>
            <div className="tr-gst-detail">
              <div className="tr-gst-field">
                <label className="tr-gst-label">CGST %</label>
                <input
                  type="number" min={0} max={28} step={0.1}
                  className="tr-cell-input"
                  value={item.cgst_pct}
                  onChange={(e) => onUpdate(index, "cgst_pct", e.target.value)}
                  onKeyDown={handleMaxDigits(2)}
                />
              </div>
              <div className="tr-gst-field">
                <label className="tr-gst-label">CGST Amt</label>
                <span className="tr-gst-value">{fmtNum(item.CGST)}</span>
              </div>
              <div className="tr-gst-field">
                <label className="tr-gst-label">SGST %</label>
                <input
                  type="number" min={0} max={28} step={0.1}
                  className="tr-cell-input"
                  value={item.sgst_pct}
                  onChange={(e) => onUpdate(index, "sgst_pct", e.target.value)}
                  onKeyDown={handleMaxDigits(2)}
                />
              </div>
              <div className="tr-gst-field">
                <label className="tr-gst-label">SGST Amt</label>
                <span className="tr-gst-value">{fmtNum(item.SGST)}</span>
              </div>
              <div className="tr-gst-field">
                <label className="tr-gst-label">Taxable</label>
                <span className="tr-gst-value tr-gst-value-accent">{fmtNum(item.taxable_amount)}</span>
              </div>
              <div className="tr-gst-field">
                <label className="tr-gst-label">Total GST</label>
                <span className="tr-gst-value tr-gst-value-accent">{fmtNum(totalGST)}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE ENTRY GRID (sidebar card)
// ─────────────────────────────────────────────────────────────────────────────

export function ExpenseEntryGrid({ expenses, onExpenseUpdate }) {
  return (
    <div className="tr-expense-card">
      <div className="tr-expense-card-header">
        <span className="tr-expense-card-title">💼 Expenses</span>
      </div>
      <table className="tr-expense-table-v2">
        <tbody>
          {expenses
            .filter(item => item.editable)// render editable  expenses only
            .map((exp, idx) => (
              <tr key={exp.key}>
                <td className="tr-exp-name">{exp.label}</td>
                <td className="tr-exp-sign">{exp.sign}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <input
                      type="number"
                      className="tr-exp-input"
                      value={exp.pct}
                      onChange={(e) => onExpenseUpdate(
                        expenses.findIndex(e2 => e2.key === exp.key),
                        "pct", e.target.value
                      )}
                      placeholder="0.0"
                    />
                    <span className="tr-exp-unit">%</span>
                  </div>
                </td>
                <td>
                  <input
                    type="number"
                    className="tr-exp-input"
                    value={exp.amount}
                    onChange={(e) => onExpenseUpdate(
                      expenses.findIndex(e2 => e2.key === exp.key),
                      "amount", e.target.value
                    )}
                    placeholder="0.00"
                  />
                </td>
              </tr>
            ))}

        </tbody>
      </table>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export function TransactionSummary({ itemAmount, expenses, final, roundoff, gst }) {
  return (
    <div className="tr-summary-card">
      <div className="tr-section-title">Bill Summary</div>

      <div className="tr-summary-row">
        <span className="tr-summary-row-label">Item Amount</span>
        <span className="tr-summary-row-value tr-amount">{fmt(itemAmount)}</span>
      </div>

      {expenses
        .filter(exp => exp.editable)
        .map((exp) => (
          <div className="tr-summary-row" key={exp.key}>
            <span className="tr-summary-row-label">{exp.label}</span>
            <span className={`tr-summary-row-value tr-amount ${exp.sign === "+" ? "plus" : "minus"}`}>
              {exp.sign} {fmt(exp.amount || 0)}
            </span>
          </div>
        ))}

      <div className="tr-summary-row">
        <span className="tr-summary-row-label">Total GST</span>
        <span className={`tr-summary-row-value tr-amount plus`}>
          {"(+)"} {fmt(gst || 0)}
        </span>
      </div>

      <div className="tr-summary-row">
        <span className="tr-summary-row-label">Round Off</span>
        <span className={`tr-summary-row-value tr-amount ${roundoff >= 0 ? "plus" : "minus"}`}>
          {roundoff >= 0 ? "(+)" : "(−)"} {fmt(Math.abs(roundoff))}
        </span>
      </div>

      <div className="tr-summary-divider" />

      <div className="tr-summary-net">
        <span className="tr-summary-net-label">Net Payable</span>
        <span className="tr-summary-net-value">{fmt(final)}</span>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export function TransactionActions({ onSave, onCancel, loading, canSave }) {
  return (
    <div className="tr-footer">
      {/*<div className="tr-footer-left">
        <button type="button" className="tr-btn-ghost">
          ↺ Reset
        </button>
        <button type="button" className="tr-btn-ghost">
          📋 Draft
        </button>
      </div>*/}

      <button type="button" className="tr-btn-ghost" onClick={onCancel}>
        Cancel
      </button>

      <button type="button" className="tr-btn-ghost">
        Print
      </button>

      <button
        type="button"
        className="tr-btn-save"
        onClick={onSave}
        disabled={loading || !canSave}
      >
        {loading ? "Saving…" : "💾 Save"}
      </button>
    </div>
  );
}