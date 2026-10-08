// Unit tests for the Table 13 series logic, driven by the REAL bill numbers
// found in the database (the PI series are the messy ones worth testing).
require("dotenv").config({ path: __dirname + "/../.env" });
const { _internals } = require("../routes/gstr1");
const { naturalCompare, periodBounds, table13 } = _internals;

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log("  PASS  " + name); pass++; }
  catch (e) { console.log("  FAIL  " + name + "\n        " + e.message); fail++; }
};
const same = (a, b, m) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n          got  ${x}\n          want ${y}`);
};

console.log("\nnaturalCompare");
check("numeric runs beat lexical order", () => {
  same(["187", "83", "6638"].sort(naturalCompare), ["83", "187", "6638"], "pure numeric");
});
check("varying run is found mid-string, not at the end", () => {
  // The bug this replaced: all three end in '27', so a trailing-digit sort tied.
  same(
    ["AFF-321/2026-27", "AFF-319/2026-27", "AFF-320/2026-27"].sort(naturalCompare),
    ["AFF-319/2026-27", "AFF-320/2026-27", "AFF-321/2026-27"], "AFF series"
  );
});
check("constant prefix runs are skipped", () => {
  same(["26-27/249", "26-27/246"].sort(naturalCompare), ["26-27/246", "26-27/249"], "26-27 series");
});
check("zero-padded sale series", () => {
  same(["BILL-0010", "BILL-0002", "BILL-0001"].sort(naturalCompare),
       ["BILL-0001", "BILL-0002", "BILL-0010"], "BILL series");
});
check("unpadded series still orders numerically", () => {
  same(["BILL-10", "BILL-9", "BILL-100"].sort(naturalCompare),
       ["BILL-9", "BILL-10", "BILL-100"], "unpadded");
});

const fixture = (rows) => ({ query: async () => [rows] });

console.log("\nperiodBounds");
check("May 2026 -> half-open month", () => {
  same(periodBounds("052026"), { from: "2026-05-01 00:00:00", next: "2026-06-01 00:00:00" }, "may");
});
check("December rolls the year", () => {
  same(periodBounds("122026"), { from: "2026-12-01 00:00:00", next: "2027-01-01 00:00:00" }, "dec");
});
check("bad periods rejected with status 400", () => {
  for (const bad of ["", "132026", "002026", "5-2026", null]) {
    let s = null;
    try { periodBounds(bad); } catch (e) { s = e.status; }
    if (s !== 400) throw new Error(`'${bad}' should have thrown status 400, got ${s}`);
  }
});

// reconcileAll lives in gstr1.portal.test.js, next to the section builders
// whose output it compares.

(async () => {
  console.log("\ntable13 grouping (async)");
  // Real AFF numbers from the database, relabelled SI so Table 13 picks them up.
  const rows = [
    { trans_type: "SI", bill_no: "AFF-319/2026-27", is_cancelled: 0 },
    { trans_type: "SI", bill_no: "AFF-320/2026-27", is_cancelled: 0 },
    { trans_type: "SI", bill_no: "AFF-321/2026-27", is_cancelled: 1 },
    { trans_type: "SI", bill_no: "83",   is_cancelled: 0 },
    { trans_type: "SI", bill_no: "187",  is_cancelled: 0 },
    { trans_type: "SI", bill_no: "6638", is_cancelled: 0 },
    { trans_type: "CR", bill_no: "RV-1", is_cancelled: 0 },
  ];
  const out = await table13(fixture(rows), { from: "x", next: "y" });

  const aff = out.find((r) => r.series === "AFF-#/#-#");
  same([aff.from_no, aff.to_no], ["AFF-319/2026-27", "AFF-321/2026-27"], "AFF range");
  same([aff.total_number, aff.cancelled, aff.net_issued], [3, 1, 2], "AFF counts");

  const num = out.find((r) => r.series === "#" && r.document_type.startsWith("Invoices"));
  same([num.from_no, num.to_no], ["83", "6638"], "numeric range");

  const rv = out.find((r) => r.document_type === "Receipt Voucher");
  if (!rv) throw new Error("receipt voucher series missing");

  console.log("  PASS  AFF range no longer collapses");
  console.log("  PASS  cancelled counted, not excluded");
  console.log("  PASS  numeric series ordered numerically");
  console.log("  PASS  receipt vouchers form their own series");
  pass += 4;

  console.table(out);
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
