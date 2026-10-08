// Exercise resolveLineTax against real rows from backups/invetradecent-2707.sql
const { resolveLineTax, round2, toPeriod, isValidHsn } = require("../config/gst");

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log("  PASS  " + name); pass++; }
  catch (e) { console.log("  FAIL  " + name + "\n        " + e.message); fail++; }
};
const eq = (a, b, m) => { if (Math.abs(a - b) > 0.001) throw new Error(`${m}: got ${a}, want ${b}`); };

console.log("\nreal line items from the dump (intra-state, 5%)");

// ti 120001: txn 90002, product 60001, qty 1, rate 550, taxable 550, CGST/SGST 13.75
check("ti 120001  taxable 550 @5%", () => {
  const r = resolveLineTax(
    { product_id: 60001, taxable_amount: 550, CGST: 13.75, SGST: 13.75 },
    { isGSTBill: 1, productGstPer: 5, isInterState: false });
  eq(r.CGST, 13.75, "CGST"); eq(r.SGST, 13.75, "SGST"); eq(r.IGST, 0, "IGST");
  eq(r.taxable_amount, 550, "taxable_amount"); eq(r.gst_rate, 5, "gst_rate");
});

// ti 360001: txn 240005, product 210001, taxable 1687.50, CGST/SGST 42.19
// This is the row where naive back-division gives 1687.60 instead of 1687.50.
check("ti 360001  taxable 1687.50 @5% (the rounding-drift row)", () => {
  const r = resolveLineTax(
    { product_id: 210001, taxable_amount: 1687.5, CGST: 42.19, SGST: 42.19 },
    { isGSTBill: 1, productGstPer: 5, isInterState: false });
  eq(r.taxable_amount, 1687.5, "taxable_amount must be exact, not 1687.60");
  eq(r.CGST, 42.19, "CGST");
});

// ti 150001: txn 120001, product 120001, qty 135.50, rate 78, taxable 10569, CGST/SGST 264.23
check("ti 150001  taxable 10569 @5%", () => {
  const r = resolveLineTax(
    { product_id: 120001, taxable_amount: 10569, CGST: 264.23, SGST: 264.23 },
    { isGSTBill: 1, productGstPer: 5, isInterState: false });
  eq(r.CGST, 264.23, "CGST"); eq(r.taxable_amount, 10569, "taxable_amount");
});

console.log("\ndiscount applied BEFORE gst — the case that used to be rejected");
check("10% off: item 1000, taxable 900, tax on 900", () => {
  const r = resolveLineTax(
    { product_id: 1, item_amount: 1000, taxable_amount: 900, CGST: 22.5, SGST: 22.5 },
    { isGSTBill: 1, productGstPer: 5, isInterState: false });
  eq(r.item_amount, 1000, "item_amount keeps qty x rate");
  eq(r.taxable_amount, 900, "taxable_amount is the discounted base");
  eq(r.CGST, 22.5, "CGST is 2.5% of 900, not of 1000");
  eq(r.SGST, 22.5, "SGST");
});

check("a client sending only item_amount still works (no discount)", () => {
  const r = resolveLineTax(
    { product_id: 1, item_amount: 1000, CGST: 25, SGST: 25 },
    { isGSTBill: 1, productGstPer: 5, isInterState: false });
  eq(r.taxable_amount, 1000, "taxable defaults to the item amount");
  eq(r.CGST, 25, "CGST");
});

check("legacy payload with neither field falls back to qty x rate", () => {
  const r = resolveLineTax(
    { product_id: 1, qty: 4, rate: 250, CGST: 25, SGST: 25 },
    { isGSTBill: 1, productGstPer: 5, isInterState: false });
  eq(r.item_amount, 1000, "item_amount from qty x rate");
  eq(r.taxable_amount, 1000, "taxable_amount");
});

check("tax computed on the item amount is now rejected when a discount exists", () => {
  // The exact bug: client discounts to 900 but sends tax computed on 1000.
  let threw = false;
  try {
    resolveLineTax(
      { product_id: 1, item_amount: 1000, taxable_amount: 900, CGST: 25, SGST: 25 },
      { isGSTBill: 1, productGstPer: 5, isInterState: false });
  } catch (e) { threw = /tax mismatch/.test(e.message); }
  if (!threw) throw new Error("50 of tax on a 900 base should be rejected");
});

console.log("\ninter-state -> IGST, server-decided");
check("same line, POS differs from home state", () => {
  const r = resolveLineTax(
    { product_id: 60001, taxable_amount: 550, CGST: 13.75, SGST: 13.75 },
    { isGSTBill: 1, productGstPer: 5, isInterState: true });
  eq(r.IGST, 27.5, "IGST"); eq(r.CGST, 0, "CGST zeroed"); eq(r.SGST, 0, "SGST zeroed");
});

console.log("\nnon-GST bill");
check("isGSTBill = 0 forces rate 0 despite product at 5%", () => {
  const r = resolveLineTax(
    { product_id: 60001, taxable_amount: 550, CGST: 13.75, SGST: 13.75 },
    { isGSTBill: 0, productGstPer: 5, isInterState: false });
  eq(r.gst_rate, 0, "rate"); eq(r.CGST, 0, "CGST"); eq(r.taxable_amount, 550, "taxable_amount");
});

console.log("\nrejections");
check("tampered tax is rejected", () => {
  let threw = false;
  try {
    resolveLineTax({ product_id: 1, taxable_amount: 1000, CGST: 5, SGST: 5 },
      { isGSTBill: 1, productGstPer: 5, isInterState: false });
  } catch (e) { threw = /tax mismatch/.test(e.message); }
  if (!threw) throw new Error("should have rejected a client sending 10 instead of 50");
});

check("illegal rate is rejected", () => {
  let threw = false;
  try {
    resolveLineTax({ product_id: 1, taxable_amount: 1000, gst_rate: 7, CGST: 35, SGST: 35 },
      { isGSTBill: 1, productGstPer: 7, isInterState: false });
  } catch (e) { threw = /illegal GST rate/.test(e.message); }
  if (!threw) throw new Error("7% is not a legal slab");
});

console.log("\nhelpers");
check("toPeriod -> MMYYYY", () => {
  if (toPeriod("2026-05-06") !== "052026") throw new Error(toPeriod("2026-05-06"));
  if (toPeriod("2026-12-31") !== "122026") throw new Error(toPeriod("2026-12-31"));
});

check("isValidHsn against the real catalogue", () => {
  for (const ok of ["5407", "540782", "55151330", "520811"])
    if (!isValidHsn(ok)) throw new Error(`${ok} should be valid`);
  // product 150003 in the dump — 7 digits
  if (isValidHsn("5515330")) throw new Error("'5515330' (7 digits) must be rejected");
  if (isValidHsn("")) throw new Error("empty must be rejected");
  if (isValidHsn(null)) throw new Error("null must be rejected");
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
