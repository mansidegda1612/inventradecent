// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION CALCULATION UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate GST percentages (CGST/SGST) from total GST
 * GST is always split 50/50 between CGST and SGST
 */
export function splitGST(gstPercent) {
  const gst = parseFloat(gstPercent) || 0;
  return {
    cgst: gst / 2,
    sgst: gst / 2,
  };
}

/**
 * Calculate item amounts with GST
 * @param {Object} item - Item with qty, rate, cgst_pct, sgst_pct
 * @returns {Object} - taxable_amount, CGST, SGST
 */
export function calcItemAmounts(item, isGSTBill = true) {
  const taxable_amount = (item.qty || 0) * (item.rate || 0);
  const CGST = isGSTBill ? (taxable_amount * (item.cgst_pct || 0)) / 100 : 0;
  const SGST = isGSTBill ? (taxable_amount * (item.sgst_pct || 0)) / 100 : 0;
  return { taxable_amount, CGST, SGST };
}

/**
 * Calculate expense amount from percentage
 * @param {number} subtotal - Base amount for percentage calculation
 * @param {number} percentage - Percentage value
 * @returns {number} - Calculated amount
 */
export function calcExpenseFromPercentage(subtotal, percentage) {
  const pct = parseFloat(percentage) || 0;
  return parseFloat(((subtotal * pct) / 100).toFixed(2));
}

/**
 * Calculate expense percentage from amount
 * @param {number} subtotal - Base amount for percentage calculation
 * @param {number} amount - Absolute amount
 * @returns {number} - Calculated percentage
 */
export function calcPercentageFromExpense(subtotal, amount) {
  if (subtotal === 0) return 0;
  const amt = parseFloat(amount) || 0;
  return parseFloat(((amt / subtotal) * 100).toFixed(3));
}

/**
 * Calculate all totals for the transaction
 * @param {Array} items - Array of items with calculated amounts
 * @param {Array} expenses - Array of expenses with sign, amount
 * @param {boolean} isGSTBill - Whether GST should be included
 * @returns {Object} - All calculated totals
 */
export function calcTotals(items, expenses, isGSTBill = true) {
  const subtotal = items.reduce((s, i) => s + (i.taxable_amount || 0), 0);

  const totalCGST = isGSTBill ? items.reduce((s, i) => s + (i.CGST || 0), 0) : 0;
  const totalSGST = isGSTBill ? items.reduce((s, i) => s + (i.SGST || 0), 0) : 0;
  const totalGST  = totalCGST + totalSGST;
  const itemAmount = subtotal + (isGSTBill ? totalGST : 0);

  let expenseTotal = 0;
  for (const exp of expenses) {
    if (exp.key === "roundoff") continue;          // skip – auto-computed below
    const amt = parseFloat(exp.amount) || 0;
    expenseTotal += exp.sign === "(-)" ? -amt : amt;
  }

  const preRound  = itemAmount + expenseTotal;
  const final     = Math.round(preRound);
  // roundoff is what needs to be added to reach the rounded value
  // e.g. preRound=100.17 → final=100 → roundoff = 100-100.17 = -0.17  (deduction)
  //      preRound=99.82  → final=100 → roundoff = 100-99.82  = +0.18  (addition)
  const roundoff  = parseFloat((final - preRound).toFixed(2));

  return {
    subtotal:     parseFloat(subtotal.toFixed(2)),
    totalCGST:    parseFloat(totalCGST.toFixed(2)),
    totalSGST:    parseFloat(totalSGST.toFixed(2)),
    totalGST:     parseFloat(totalGST.toFixed(2)),
    itemAmount:   parseFloat(itemAmount.toFixed(2)),
    expenseTotal: parseFloat(expenseTotal.toFixed(2)),
    roundoff,
    final,
  };
}

/**
 * Get common GST rate splits
 * @param {number} gstRate - Total GST rate (5, 12, 18, 28)
 * @returns {Object} - CGST and SGST percentages
 */
export function getGSTRateSplit(gstRate) {
  const rates = {
    0: { cgst: 0, sgst: 0 },
    5: { cgst: 2.5, sgst: 2.5 },
    12: { cgst: 6, sgst: 6 },
    18: { cgst: 9, sgst: 9 },
    28: { cgst: 14, sgst: 14 },
  };
  return rates[gstRate] || splitGST(gstRate);
}

/**
 * Helper to get today's date in YYYY-MM-DD format
 */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Default expenses structure
 */
export const DEFAULT_EXPENSES = [
  { 
    key: "discount", 
    label: "Discount", 
    account: "", 
    sign: "(-)", 
    pct: 0, 
    amount: 0, 
    editable: true 
  },
  { 
    key: "gst", 
    label: "GST", 
    account: "", 
    sign: "(+)", 
    pct: 0, 
    amount: 0, 
    editable: false 
  },
  { 
    key: "roundoff", 
    label: "RoundOff", 
    account: "", 
    sign: "", 
    pct: 0, 
    amount: 0, 
    editable: false 
  },
];

/**
 * Empty form template
 */
export function getEmptyForm() {
  return {
    cash_debit: "C",
    customer_id: null,
    customer_name_cash: "",
    bill_no: "",
    date: today(),
    items: [],
    expenses: DEFAULT_EXPENSES.map(e => ({ ...e })),
    isGSTBill: true, // New field for bill mode
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VOUCHER (Cash/Bank Receipt "CR"  |  Cash/Bank Payment "CP") UTILITIES
// Added for bill-wise-adjustment vouchers. Reuses today() above — no new
// import needed since it now lives in the same file. Nothing above this
// section was changed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Empty voucher form template
 * @param {string} type - "CR" (receipt) | "CP" (payment)
 */
export function getEmptyVoucherForm(type) {
  return {
    trans_type: type,          // "CR" | "CP"
    payment_mode: "Cash",      // "Cash" | "Bank"
    bill_no: "",
    date: today(),
    customer_id: null,
    ref_no: "",
    narration: "",
    final_amount: "",
    adjustments: {},           // { [bill_transaction_id]: amountString }
  };
}

/**
 * Calculate voucher totals — how much of the voucher amount is adjusted
 * against bills vs. left "on account" (advance).
 * @param {Object} adjustments - { [bill_transaction_id]: amountString }
 * @param {number|string} final_amount - total voucher amount
 */
export function calcVoucherTotals(adjustments, final_amount) {
  const totalAdjusted = Object.values(adjustments).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0
  );
  const voucherAmount = parseFloat(final_amount) || 0;
  const onAccount = voucherAmount - totalAdjusted;
  return { totalAdjusted, voucherAmount, onAccount };
}

/**
 * FIFO auto-allocation: fills oldest bills first, up to the voucher amount.
 * Returns a fresh adjustments map — doesn't mutate input.
 * @param {Array} bills - pending bills, each with transaction_id & pending_amount
 * @param {number|string} final_amount - total voucher amount
 */
export function autoAllocateFIFO(bills, final_amount) {
  let remaining = parseFloat(final_amount) || 0;
  const adjustments = {};
  for (const b of bills) {
    if (remaining <= 0) break;
    const take = Math.min(b.pending_amount, remaining);
    if (take > 0) {
      adjustments[b.transaction_id] = take.toFixed(2);
      remaining -= take;
    }
  }
  return adjustments;
}