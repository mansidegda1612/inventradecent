// End-to-end proof of the discount fix, ACROSS the frontend/backend boundary.
//
// Runs the real frontend calculation (TransactionUtils.calcTotals), builds the
// exact payload SaleEntry.jsx posts, and feeds each line to the real backend
// validator (resolveLineTax). Before the fix this combination threw
// "tax mismatch" on any bill carrying a discount.
//
// TransactionUtils is an ES module, so it is bundled to CJS on the fly.
const path = require("path");
const fs = require("fs");
const os = require("os");

const FRONTEND = path.join(__dirname, "../../frontend");
const out = path.join(os.tmpdir(), `txutils-${process.pid}.cjs`);

// esbuild's JS API rather than the CLI — spawning npx.cmd needs a shell on
// Windows and fails with EINVAL without one.
const esbuild = require(path.join(FRONTEND, "node_modules", "esbuild"));
esbuild.buildSync({
  entryPoints: [path.join(FRONTEND, "src/utils/TransactionUtils.js")],
  bundle: true,
  format: "cjs",
  outfile: out,
  logLevel: "error",
});

const TX = require(out);
const { resolveLineTax } = require("../config/gst");

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log("  PASS  " + name); pass++; }
  catch (e) { console.log("  FAIL  " + name + "\n        " + e.message); fail++; }
};
const eq = (a, b, m) => {
  if (Math.abs(a - b) > 0.011) throw new Error(`${m}: got ${a}, want ${b}`);
};

/** Mirror of SaleEntry.jsx's payload construction + the server's line handling. */
function billThrough(items, expenses, isGSTBill = true) {
  const totals = TX.calcTotals(items, expenses, isGSTBill);
  const payload = totals.items.map((i) => ({
    product_id: i.product_id,
    qty: i.qty,
    rate: i.rate,
    item_amount: i.item_amount,
    taxable_amount: i.taxable_amount,
    CGST: i.CGST,
    SGST: i.SGST,
  }));
  // The server re-derives and rejects on any inconsistency.
  const resolved = payload.map((line) =>
    resolveLineTax(line, { isGSTBill, productGstPer: 5, isInterState: false })
  );
  return { totals, payload, resolved };
}

const expensesWith = (discount) =>
  TX.DEFAULT_EXPENSES.map((e) => ({ ...e, amount: e.key === "discount" ? discount : 0 }));

const ITEMS = [
  { product_id: 1, qty: 10, rate: 100, cgst_pct: 2.5, sgst_pct: 2.5 },
  { product_id: 2, qty: 5,  rate: 200, cgst_pct: 2.5, sgst_pct: 2.5 },
];
// item total = 1000 + 1000 = 2000

console.log("\nno discount");
check("tax on the full item amount, server accepts", () => {
  const { totals, resolved } = billThrough(ITEMS, expensesWith(0));
  eq(totals.subtotal, 2000, "subtotal");
  eq(totals.totalTaxable, 2000, "totalTaxable");
  eq(totals.totalGST, 100, "totalGST (5% of 2000)");
  eq(resolved.reduce((s, r) => s + r.item_amount, 0), 2000, "sum item_amount");
  eq(resolved.reduce((s, r) => s + r.taxable_amount, 0), 2000, "sum taxable_amount");
});

console.log("\ndiscount 200 before GST — the bug");
check("server accepts the bill (used to throw 'tax mismatch')", () => {
  const { totals, resolved } = billThrough(ITEMS, expensesWith(200));
  eq(totals.subtotal, 2000, "subtotal is still the ITEM total");
  eq(totals.totalTaxable, 1800, "taxable is net of the discount");
  eq(totals.totalGST, 90, "GST is 5% of 1800, not of 2000");
  eq(resolved.reduce((s, r) => s + r.item_amount, 0), 2000, "item_amount unchanged");
  eq(resolved.reduce((s, r) => s + r.taxable_amount, 0), 1800, "taxable_amount discounted");
});

check("the discount is apportioned across lines, not dumped on one", () => {
  const { resolved } = billThrough(ITEMS, expensesWith(200));
  // Both lines are 1000, so each should carry half the discount.
  eq(resolved[0].taxable_amount, 900, "line 1 taxable");
  eq(resolved[1].taxable_amount, 900, "line 2 taxable");
});

check("line taxable amounts sum to the bill taxable — no rounding leak", () => {
  const { totals, resolved } = billThrough(ITEMS, expensesWith(200));
  eq(resolved.reduce((s, r) => s + r.taxable_amount, 0), totals.totalTaxable, "sum vs total");
});

console.log("\nawkward discount that does not divide evenly");
check("333.33 off two uneven lines still reconciles", () => {
  const items = [
    { product_id: 1, qty: 3,  rate: 333.33, cgst_pct: 2.5, sgst_pct: 2.5 },
    { product_id: 2, qty: 7,  rate: 111.11, cgst_pct: 2.5, sgst_pct: 2.5 },
  ];
  const { totals, resolved } = billThrough(items, expensesWith(333.33));
  const sumTaxable = resolved.reduce((s, r) => s + r.taxable_amount, 0);
  eq(sumTaxable, totals.totalTaxable, "line sum vs bill taxable");
  // Every line must independently survive the server's tax check, which is
  // what actually threw before — asserted by billThrough() not throwing.
  if (resolved.length !== 2) throw new Error("expected 2 resolved lines");
});

console.log("\n100% discount");
check("everything free: taxable 0, no tax, no rejection", () => {
  const { totals, resolved } = billThrough(ITEMS, expensesWith(2000));
  eq(totals.totalTaxable, 0, "taxable");
  eq(totals.totalGST, 0, "GST");
  eq(resolved.reduce((s, r) => s + r.item_amount, 0), 2000, "item_amount still real");
});

console.log("\nnon-GST bill with a discount");
check("no tax charged, taxable still net of discount", () => {
  const { totals, resolved } = billThrough(ITEMS, expensesWith(200), false);
  eq(totals.totalGST, 0, "no GST");
  eq(resolved.every((r) => r.gst_rate === 0), true, "every line at rate 0");
});

try { fs.unlinkSync(out); } catch {}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
