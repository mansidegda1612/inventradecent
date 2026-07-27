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

/** Round to 2 decimals (money) — everything below goes through this */
const round2 = (n) => parseFloat(((parseFloat(n) || 0)).toFixed(2));

/**
 * Calculate item amounts with GST
 * @param {Object} item - Item with qty, rate, cgst_pct, sgst_pct
 * @param {boolean} isGSTBill - Whether GST should be charged at all
 * @param {number} gstFactor - Scales the taxable amount before GST is charged
 *        on it, so tax lands on the amount left after every expense that comes
 *        BEFORE the GST line in the sequence (e.g. discount). 1 = tax on the
 *        full item amount. See calcGSTFactor().
 * @returns {Object} - taxable_amount, gst_base, CGST, SGST
 */
export function calcItemAmounts(item, isGSTBill = true, gstFactor = 1) {
  const taxable_amount = round2((item.qty || 0) * (item.rate || 0));
  const gst_base = round2(taxable_amount * gstFactor);
  const CGST = isGSTBill ? round2((gst_base * (item.cgst_pct || 0)) / 100) : 0;
  const SGST = isGSTBill ? round2((gst_base * (item.sgst_pct || 0)) / 100) : 0;
  return { taxable_amount, gst_base, CGST, SGST };
}

/**
 * Calculate expense amount from percentage
 * @param {number} base - Amount the percentage is charged on (for an expense in
 *        a sequence that's the running total before it — see getExpenseBase())
 * @param {number} percentage - Percentage value
 * @returns {number} - Calculated amount
 */
export function calcExpenseFromPercentage(base, percentage) {
  const pct = parseFloat(percentage) || 0;
  return parseFloat(((base * pct) / 100).toFixed(2));
}

/**
 * Calculate expense percentage from amount
 * @param {number} base - Amount the percentage is charged on
 * @param {number} amount - Absolute amount
 * @returns {number} - Calculated percentage
 */
export function calcPercentageFromExpense(base, amount) {
  if (!base) return 0;
  const amt = parseFloat(amount) || 0;
  return parseFloat(((amt / base) * 100).toFixed(3));
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE SEQUENCE
//
// Every expense carries a `seq` number. The bill is built by walking the
// expenses in that order, each one calculated on ("applied to") the running
// total of everything before it — NOT on the raw item amount. With the default
// Discount(1) → GST(2) → RoundOff(3):
//
//   item amount  →  (-) discount  →  (+) GST on the post-discount amount
//                →  (±) roundoff  →  net payable
//
// Reorder the seq numbers and the arithmetic follows: put an expense before GST
// and it becomes part of the taxable base, put it after and it doesn't.
// ─────────────────────────────────────────────────────────────────────────────

/** seq of an expense, falling back to its position in the array */
function seqOf(exp, index) {
  const s = parseFloat(exp?.seq);
  return Number.isFinite(s) ? s : index + 1;
}

/**
 * Expenses paired with their original array index, ordered by the sequence in
 * which they apply. Ties keep array order.
 * @param {Array} expenses
 * @returns {Array<{exp: Object, index: number}>}
 */
export function expenseSequence(expenses = []) {
  return expenses
    .map((exp, index) => ({ exp, index }))
    .sort((a, b) =>
      seqOf(a.exp, a.index) - seqOf(b.exp, b.index) || a.index - b.index
    );
}

/**
 * Walk the expense sequence and resolve each line against its own base.
 * @param {Array} items - items with taxable_amount
 * @param {Array} expenses
 * @param {number} totalGST - what the "gst" line contributes. Pass 0 to resolve
 *        the pre-GST lines (the GST base only depends on those anyway).
 * @returns {Object} - { subtotal, resolved, final }. `resolved` keeps the INPUT
 *        index order (so callers can still map a row back to expenses[i]) and
 *        adds, per line: base (amount it was calculated on), amount, signed
 *        (amount with its +/- sign), running (total after it was applied).
 */
export function resolveExpenseSequence(items = [], expenses = [], totalGST = 0) {
  const subtotal = round2(
    items.reduce((s, i) => s + (parseFloat(i.taxable_amount) || 0), 0)
  );
  const resolved = expenses.map((exp) => ({ ...exp }));
  let running = subtotal;

  for (const { exp, index } of expenseSequence(expenses)) {
    const base = running;

    let amount;
    if (exp.key === "gst") {
      amount = round2(totalGST);                          // auto — from items
    } else if (exp.key === "roundoff") {
      amount = round2(Math.round(base) - base);           // auto — ± to whole ₹
    } else {
      amount = round2(exp.amount);                        // user entered
    }

    const signed = exp.sign === "(-)" ? -amount : amount;
    running = round2(base + signed);
    resolved[index] = { ...resolved[index], base, amount, signed, running };
  }

  return { subtotal, resolved, final: running };
}

/**
 * Factor to scale each item's taxable amount by before charging GST on it:
 * (amount the GST line sits on) ÷ (raw item total). Returns 1 when nothing
 * comes before GST in the sequence. Only the pre-GST lines feed into this, so
 * it resolves without knowing any tax yet.
 */
export function calcGSTFactor(items = [], expenses = []) {
  const gstIndex = expenses.findIndex((e) => e.key === "gst");
  if (gstIndex === -1) return 1;
  const { subtotal, resolved } = resolveExpenseSequence(items, expenses, 0);
  if (!subtotal) return 1;
  return resolved[gstIndex].base / subtotal;
}

/**
 * Calculate all totals for the transaction.
 * @param {Array} items - Array of items with qty, rate, cgst_pct, sgst_pct
 * @param {Array} expenses - Array of expenses with seq, sign, amount
 * @param {boolean} isGSTBill - Whether GST should be included
 * @returns {Object} - All calculated totals, plus:
 *   items    — the same items with taxable_amount/gst_base/CGST/SGST recomputed
 *              for this expense sequence (use THESE for saving & printing)
 *   expenses — the resolved expense lines (see resolveExpenseSequence)
 */
export function calcTotals(items = [], expenses = [], isGSTBill = true) {
  // taxable amount per line first — the pre-GST expenses are calculated on it
  const baseItems = items.map((i) => ({
    ...i,
    taxable_amount: round2((i.qty || 0) * (i.rate || 0)),
  }));

  const gstFactor = isGSTBill ? calcGSTFactor(baseItems, expenses) : 1;

  // GST per line, charged on the post-(pre-GST-expenses) base
  const taxedItems = baseItems.map((i) => ({
    ...i,
    ...calcItemAmounts(i, isGSTBill, gstFactor),
  }));

  // totals are the sum of the per-line (already rounded) amounts, so the bill
  // always equals what gets stored on / printed for each line
  const totalCGST = round2(taxedItems.reduce((s, i) => s + i.CGST, 0));
  const totalSGST = round2(taxedItems.reduce((s, i) => s + i.SGST, 0));
  const totalGST = round2(totalCGST + totalSGST);

  const { subtotal, resolved, final } = resolveExpenseSequence(
    taxedItems, expenses, totalGST
  );

  const roundoffLine = resolved.find((e) => e.key === "roundoff");
  // manually entered expenses only — GST and roundoff are reported separately
  const expenseTotal = round2(
    resolved.reduce(
      (s, e) => (e.key === "gst" || e.key === "roundoff" ? s : s + (e.signed || 0)),
      0
    )
  );

  return {
    subtotal,
    gstFactor,
    items:        taxedItems,
    totalCGST,
    totalSGST,
    totalGST,
    itemAmount:   round2(subtotal + totalGST),
    expenses:     resolved,
    expenseTotal,
    roundoff:     roundoffLine ? roundoffLine.amount : 0,
    final,
  };
}

/**
 * The amount a given expense is calculated on — i.e. the running total of every
 * expense before it in the sequence. Used to convert its % ⇄ amount.
 */
export function getExpenseBase(items, expenses, index, isGSTBill = true) {
  const { expenses: resolved } = calcTotals(items, expenses, isGSTBill);
  return resolved[index]?.base ?? 0;
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
 *
 * `seq` = the order the expense is applied in. Each line is calculated on the
 * running total of the lines before it, so GST at seq 2 is charged on the
 * post-discount amount. Change these numbers to change the arithmetic.
 */
export const DEFAULT_EXPENSES = [
  {
    key: "discount",
    label: "Discount",
    account: "",
    sign: "(-)",
    seq: 1,
    pct: 0,
    amount: 0,
    editable: true
  },
  {
    key: "gst",
    label: "GST",
    account: "",
    sign: "(+)",
    seq: 2,
    pct: 0,
    amount: 0,
    editable: false
  },
  {
    key: "roundoff",
    label: "RoundOff",
    account: "",
    sign: "",
    seq: 3,
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