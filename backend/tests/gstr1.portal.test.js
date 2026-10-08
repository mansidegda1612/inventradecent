// Unit tests for the parts of GSTR-1 that produce the portal upload:
// range resolution (monthly / quarterly / yearly), the B2B-vs-B2CL-vs-B2CS
// split, credit-note routing, and the JSON payload itself.
//
// None of this touches the database — the builders take plain rows, which is
// what makes them testable without a filed period to point at.
require("dotenv").config({ path: __dirname + "/../.env" });
const { _internals } = require("../routes/gstr1");
const {
  resolveRange, classify, tableB2CS, tableCreditNotes, buildPortalJson, itmDet, reconcileAll,
} = _internals;

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log("  PASS  " + name); pass++; }
  catch (e) { console.log("  FAIL  " + name + "\n        " + e.message); fail++; }
};
const same = (a, b, m) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n          got  ${x}\n          want ${y}`);
};
const ok = (cond, m) => { if (!cond) throw new Error(m); };

const HOME = "24";

console.log("\nresolveRange");
check("monthly keeps the period as its own fp", () => {
  const r = resolveRange({ mode: "monthly", period: "052026" });
  same([r.from, r.next, r.fp, r.months], ["2026-05-01 00:00:00", "2026-06-01 00:00:00", "052026", ["052026"]], "may");
  ok(r.portal_filable, "a month is filable");
});
check("Jan-Mar belong to the financial year that began the previous April", () => {
  same(resolveRange({ mode: "monthly", period: "022027" }).fy, 2026, "Feb 2027 is FY 2026-27");
  same(resolveRange({ mode: "monthly", period: "042026" }).fy, 2026, "Apr 2026 is FY 2026-27");
});
check("Q1 is Apr-Jun and files under June", () => {
  const r = resolveRange({ mode: "quarterly", fy: 2026, quarter: 1 });
  same([r.from, r.next, r.fp], ["2026-04-01 00:00:00", "2026-07-01 00:00:00", "062026"], "Q1");
  same(r.months, ["042026", "052026", "062026"], "Q1 months");
});
check("Q3 crosses December without rolling into the wrong year", () => {
  const r = resolveRange({ mode: "quarterly", fy: 2026, quarter: 3 });
  same([r.from, r.next, r.fp], ["2026-10-01 00:00:00", "2027-01-01 00:00:00", "122026"], "Q3");
  same(r.months, ["102026", "112026", "122026"], "Q3 months");
});
check("Q4 is Jan-Mar of the FOLLOWING calendar year", () => {
  const r = resolveRange({ mode: "quarterly", fy: 2026, quarter: 4 });
  same([r.from, r.next, r.fp], ["2027-01-01 00:00:00", "2027-04-01 00:00:00", "032027"], "Q4");
  same(r.months, ["012027", "022027", "032027"], "Q4 months");
});
check("yearly spans Apr to Mar and is NOT portal filable", () => {
  const r = resolveRange({ mode: "yearly", fy: 2026 });
  same([r.from, r.next, r.fp], ["2026-04-01 00:00:00", "2027-04-01 00:00:00", "032027"], "FY");
  same(r.months.length, 12, "twelve months");
  same(r.months[0], "042026", "starts in April");
  same(r.months[11], "032027", "ends in March");
  ok(!r.portal_filable, "there is no annual GSTR-1 — the mode must say so");
});
check("'annual' is accepted as a spelling of 'yearly'", () => {
  same(resolveRange({ mode: "annual", fy: 2026 }), resolveRange({ mode: "yearly", fy: 2026 }), "alias");
});
check("bad input is rejected with status 400", () => {
  const cases = [
    { mode: "quarterly", fy: 2026, quarter: 5 },
    { mode: "quarterly", fy: 2026 },
    { mode: "yearly" },
    { mode: "weekly", fy: 2026 },
  ];
  for (const q of cases) {
    let s = null;
    try { resolveRange(q); } catch (e) { s = e.status; }
    if (s !== 400) throw new Error(`${JSON.stringify(q)} should throw 400, got ${s}`);
  }
});

console.log("\nclassify");
const docs = [
  { id: 1, gstin: "23HPOPK1546D1ZY", place_of_supply: "23", doc_value: 5614 },
  { id: 2, gstin: "",                place_of_supply: "23", doc_value: 500000 },  // inter + big  -> B2CL
  { id: 3, gstin: "",                place_of_supply: "23", doc_value: 2000 },    // inter + small-> B2CS
  { id: 4, gstin: "",                place_of_supply: "24", doc_value: 500000 },  // intra + big  -> B2CS
  { id: 5, gstin: "not-a-gstin",     place_of_supply: "23", doc_value: 9000 },    // malformed    -> B2CS
];
check("a valid GSTIN is B2B whatever the invoice is worth", () => {
  same(classify(docs, HOME).b2b.map((d) => d.id), [1], "b2b ids");
});
check("B2CL needs BOTH inter-state and above the threshold", () => {
  same(classify(docs, HOME).b2cl.map((d) => d.id), [2], "b2cl ids");
});
check("everything else consolidates, malformed GSTINs included", () => {
  same(classify(docs, HOME).b2cs.map((d) => d.id), [3, 4, 5], "b2cs ids");
});
check("no invoice lands in two tables", () => {
  const c = classify(docs, HOME);
  const all = [...c.b2b, ...c.b2cl, ...c.b2cs].map((d) => d.id);
  same(all.length, new Set(all).size, "ids are unique across the three tables");
  same(all.length, docs.length, "every invoice is placed somewhere");
});

console.log("\ntableB2CS");
const items = new Map([
  [3, [{ rt: 3, txval: 1000, iamt: 30, camt: 0, samt: 0, csamt: 0 }]],
  [4, [{ rt: 3, txval: 2000, iamt: 0, camt: 30, samt: 30, csamt: 0 },
       { rt: 0, txval: 500,  iamt: 0, camt: 0,  samt: 0,  csamt: 0 }]],
]);
check("intra-state rows carry CGST/SGST and inter-state rows carry IGST", () => {
  const rows = tableB2CS(
    [{ id: 3, place_of_supply: "23" }, { id: 4, place_of_supply: "24" }],
    items, { homeState: HOME }
  );
  const inter = rows.find((r) => r.place_of_supply === "23");
  const intra = rows.find((r) => r.place_of_supply === "24");
  same([inter.supply_type, inter.igst, inter.cgst], ["INTER", 30, 0], "inter row");
  same([intra.supply_type, intra.igst, intra.cgst], ["INTRA", 0, 30], "intra row");
});
check("0% lines stay out of Table 7", () => {
  const rows = tableB2CS([{ id: 4, place_of_supply: "24" }], items, { homeState: HOME });
  same(rows.map((r) => r.rate), [3], "only the taxable rate survives");
});
check("a small B2C credit note is netted off the consolidated row", () => {
  const credit = new Map([[9, [{ rt: 3, txval: 400, iamt: 12, camt: 0, samt: 0, csamt: 0 }]]]);
  const rows = tableB2CS(
    [{ id: 3, place_of_supply: "23" }], items,
    { homeState: HOME, creditDocs: [{ id: 9, place_of_supply: "23" }], creditItems: credit }
  );
  same([rows[0].taxable_value, rows[0].igst], [600, 18], "1000 - 400 taxable, 30 - 12 tax");
});
check("a row that nets to exactly nothing is dropped", () => {
  const credit = new Map([[9, [{ rt: 3, txval: 1000, iamt: 30, camt: 0, samt: 0, csamt: 0 }]]]);
  const rows = tableB2CS(
    [{ id: 3, place_of_supply: "23" }], items,
    { homeState: HOME, creditDocs: [{ id: 9, place_of_supply: "23" }], creditItems: credit }
  );
  same(rows, [], "fully reversed supply is not a reportable row");
});

console.log("\ntableCreditNotes");
const srDocs = [
  { id: 11, gstin: "23DIGPG5001L2ZK", place_of_supply: "23", doc_value: 2143, bill_no: "SR/1", doc_date: "06-04-2026", party_name: "A" },
  { id: 12, gstin: "", place_of_supply: "23", doc_value: 400000, bill_no: "SR/2", doc_date: "07-04-2026", party_name: "B" },
  { id: 13, gstin: "", place_of_supply: "23", doc_value: 900,    bill_no: "SR/3", doc_date: "08-04-2026", party_name: "C" },
  { id: 14, gstin: "", place_of_supply: "24", doc_value: 400000, bill_no: "SR/4", doc_date: "09-04-2026", party_name: "D" },
];
const srItems = new Map(srDocs.map((d) => [d.id, [{ rt: 3, txval: 100, iamt: 3, camt: 0, samt: 0, csamt: 0 }]]));
check("registered buyer -> CDNR", () => {
  same(tableCreditNotes(srDocs, srItems, HOME).cdnr.map((r) => r.note_number), ["SR/1"], "cdnr");
});
check("unregistered, inter-state, above threshold -> CDNUR as B2CL", () => {
  const { cdnur } = tableCreditNotes(srDocs, srItems, HOME);
  same(cdnur.map((r) => [r.note_number, r.ur_type]), [["SR/2", "B2CL"]], "cdnur");
});
check("every other unregistered note is netted, not separately reported", () => {
  same(tableCreditNotes(srDocs, srItems, HOME).netted.map((d) => d.bill_no), ["SR/3", "SR/4"], "netted");
});
check("notes are always type C — this system has no debit note", () => {
  const { cdnr, cdnur } = tableCreditNotes(srDocs, srItems, HOME);
  ok([...cdnr, ...cdnur].every((r) => r.note_type === "C"), "all C");
});

console.log("\nreconcileAll");
const recon = (over = {}) => reconcileAll({
  b2b: [], b2cl: [], b2cs: [], cdnr: [], cdnur: [], hsn_b2b: [], hsn_b2c: [], ...over,
});
check("0%-rated lines are excluded from both sides", () => {
  const r = recon({
    b2cs: [{ rate: 3, taxable_value: 1000 }, { rate: 0, taxable_value: 500 }],
    hsn_b2c: [{ rate: 3, taxable_value: 1000 }, { rate: 0, taxable_value: 500 }],
  });
  ok(r.matches, `should tie, got ${JSON.stringify(r)}`);
});
check("B2B and B2CL count towards supplies, not just B2CS", () => {
  const r = recon({
    b2b: [{ rate: 3, taxable_value: 700 }],
    b2cl: [{ rate: 3, taxable_value: 200 }],
    b2cs: [{ rate: 3, taxable_value: 100 }],
    hsn_b2b: [{ rate: 3, taxable_value: 700 }],
    hsn_b2c: [{ rate: 3, taxable_value: 300 }],
  });
  same([r.supplies_taxable, r.hsn_taxable, r.matches], [1000, 1000, true], "all three sections");
});
check("credit notes reduce supplies, matching how HSN subtracts them", () => {
  const r = recon({
    b2b: [{ rate: 3, taxable_value: 1000 }],
    cdnr: [{ rate: 3, taxable_value: 250 }],
    hsn_b2b: [{ rate: 3, taxable_value: 750 }],
  });
  same([r.supplies_taxable, r.difference, r.matches], [750, 0, true], "net of the note");
});
check("a genuine mismatch is reported", () => {
  const r = recon({
    b2cs: [{ rate: 3, taxable_value: 1000 }],
    hsn_b2c: [{ rate: 3, taxable_value: 900 }],
  });
  ok(!r.matches && r.difference === 100, JSON.stringify(r));
});

console.log("\nitmDet — tax heads");
check("inter-state carries iamt only, never an empty camt/samt pair", () => {
  same(itmDet({ taxable_value: 100, rate: 3, igst: 3, cgst: 0, sgst: 0, cess: 0 }, false),
       { txval: 100, rt: 3, iamt: 3, csamt: 0 }, "inter");
});
check("intra-state carries camt and samt only", () => {
  same(itmDet({ taxable_value: 100, rate: 3, igst: 0, cgst: 1.5, sgst: 1.5, cess: 0 }, true),
       { txval: 100, rt: 3, camt: 1.5, samt: 1.5, csamt: 0 }, "intra");
});
check("a 0% intra-state line still declares camt and samt, at zero", () => {
  // The head is mandatory for the direction of supply; dropping it because the
  // amount is zero produces an itm_det the portal rejects.
  same(itmDet({ taxable_value: 8000000, rate: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 }, true),
       { txval: 8000000, rt: 0, camt: 0, samt: 0, csamt: 0 }, "nil intra");
});
check("a 0% inter-state line declares iamt at zero", () => {
  same(itmDet({ taxable_value: 5000, rate: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 }, false),
       { txval: 5000, rt: 0, iamt: 0, csamt: 0 }, "nil inter");
});
check("direction comes from the argument, not from which amount is non-zero", () => {
  // A line taxed against the wrong head must NOT silently reshape the payload —
  // check B5 is what catches that, and it has to stay visible in the output.
  same(itmDet({ taxable_value: 100, rate: 3, igst: 3, cgst: 0, sgst: 0, cess: 0 }, true),
       { txval: 100, rt: 3, camt: 0, samt: 0, csamt: 0 }, "intra wins over a stray IGST");
});

console.log("\nbuildPortalJson");
const sections = {
  b2b: [
    { ctin: "23HPOPK1546D1ZY", invoice_number: "GT/48", invoice_date: "04-04-2026", invoice_value: 5614,
      place_of_supply: "23", reverse_charge: "N", invoice_type: "R", rate: 3,
      taxable_value: 5000, igst: 150, cgst: 0, sgst: 0, cess: 0 },
    { ctin: "23HPOPK1546D1ZY", invoice_number: "GT/48", invoice_date: "04-04-2026", invoice_value: 5614,
      place_of_supply: "23", reverse_charge: "N", invoice_type: "R", rate: 0,
      taxable_value: 614, igst: 0, cgst: 0, sgst: 0, cess: 0 },
    { ctin: "09FHZPA0398Q1Z7", invoice_number: "GT/63", invoice_date: "06-04-2026", invoice_value: 8034,
      place_of_supply: "09", reverse_charge: "N", invoice_type: "R", rate: 3,
      taxable_value: 7800, igst: 234, cgst: 0, sgst: 0, cess: 0 },
  ],
  b2cl: [],
  b2cs: [
    { supply_type: "INTER", type: "OE", place_of_supply: "01", rate: 3, taxable_value: 6261, igst: 187.82, cgst: 0, sgst: 0, cess: 0 },
    { supply_type: "INTRA", type: "OE", place_of_supply: "24", rate: 3, taxable_value: 1000, igst: 0, cgst: 15, sgst: 15, cess: 0 },
  ],
  nil: [
    { supply_type: "INTRB2C", nil_rated: 0, exempted: 0, non_gst: 0 },
    { supply_type: "INTRAB2C", nil_rated: 1200, exempted: 0, non_gst: 0 },
  ],
  cdnr: [
    { ctin: "23DIGPG5001L2ZK", note_number: "GT/70", note_date: "06-04-2026", place_of_supply: "23",
      reverse_charge: "N", note_supply_type: "R", note_type: "C", note_value: 2143,
      rate: 3, taxable_value: 2081, igst: 62.43, cgst: 0, sgst: 0, cess: 0 },
  ],
  cdnur: [],
  hsn_b2b: [{ hsn_code: "7117", description: "IMITATION JEWELLERY", uqc: "", total_quantity: 1813, rate: 3, taxable_value: 71189, igst: 1483.87, cgst: 211.51, sgst: 211.51, cess: 0 }],
  hsn_b2c: [],
  docs: [
    { doc_num: 1, document_type: "Invoices for outward supply", from_no: "GT/1", to_no: "GT/651", total_number: 651, cancelled: 4, net_issued: 647 },
    { doc_num: 5, document_type: "Credit Note", from_no: "SR/1", to_no: "SR/9", total_number: 9, cancelled: 0, net_issued: 9 },
  ],
};
const json = buildPortalJson({ gstin: "24BCXPD0366G1ZL", fp: "042026", sections });

check("envelope carries gstin, fp, version and hash", () => {
  same([json.gstin, json.fp, json.version, json.hash],
       ["24BCXPD0366G1ZL", "042026", "GST3.2.2", "hash"], "envelope");
});
check("b2b nests recipient -> invoice -> itms, one itm per rate", () => {
  same(json.b2b.length, 2, "two recipients");
  const first = json.b2b.find((g) => g.ctin === "23HPOPK1546D1ZY");
  same(first.inv.length, 1, "the two rate rows collapse into ONE invoice");
  same(first.inv[0].itms.map((i) => [i.num, i.itm_det.rt]), [[1, 3], [2, 0]], "itms numbered from 1");
  same(first.inv[0].val, 5614, "invoice value is stated once, not per rate");
});
check("home state is taken from the filer's own GSTIN when not passed", () => {
  // pos 23 against a 24… GSTIN is inter-state, so both lines carry iamt —
  // including the 0% one.
  const inv = json.b2b.find((g) => g.ctin === "23HPOPK1546D1ZY").inv[0];
  same(inv.itms.map((i) => i.itm_det), [
    { txval: 5000, rt: 3, iamt: 150, csamt: 0 },
    { txval: 614, rt: 0, iamt: 0, csamt: 0 },
  ], "inter-state B2B heads");
});
check("b2cs splits tax heads by supply type", () => {
  same(json.b2cs[0], { sply_ty: "INTER", rt: 3, typ: "OE", pos: "01", txval: 6261, iamt: 187.82, csamt: 0 }, "inter");
  same(json.b2cs[1], { sply_ty: "INTRA", rt: 3, typ: "OE", pos: "24", txval: 1000, camt: 15, samt: 15, csamt: 0 }, "intra");
});
check("cdnr nests under ctin with ntty C", () => {
  same(json.cdnr[0].ctin, "23DIGPG5001L2ZK", "ctin");
  same(json.cdnr[0].nt[0].ntty, "C", "note type");
  same(json.cdnr[0].nt[0].nt_num, "GT/70", "note number");
});
check("nil drops the all-zero row and keeps the one with a value", () => {
  same(json.nil.inv, [{ sply_ty: "INTRAB2C", expt_amt: 0, nil_amt: 1200, ngsup_amt: 0 }], "nil");
});
check("doc_issue groups by doc_num and renumbers from 1 within each", () => {
  same(json.doc_issue.doc_det.map((d) => [d.doc_num, d.doc_typ, d.docs.length]),
       [[1, "Invoices for outward supply", 1], [5, "Credit Note", 1]], "doc_det");
  same(json.doc_issue.doc_det[0].docs[0],
       { num: 1, from: "GT/1", to: "GT/651", totnum: 651, cancel: 4, net_issue: 647 }, "doc row");
});
check("hsn rows are numbered and carry hsn_sc", () => {
  same(json.hsn.hsn_b2b[0].num, 1, "numbered");
  same(json.hsn.hsn_b2b[0].hsn_sc, "7117", "hsn_sc");
  ok(!("hsn_b2c" in json.hsn), "an empty hsn_b2c is omitted, not sent as []");
});
check("sections with nothing in them are omitted entirely", () => {
  for (const k of ["b2cl", "cdnur"]) ok(!(k in json), `${k} should be absent`);
});
check("every key emitted is one the portal schema knows", () => {
  const allowed = new Set(["gstin", "fp", "version", "hash", "b2b", "b2cl", "b2cs",
    "cdnr", "cdnur", "nil", "doc_issue", "hsn", "exp", "at", "txpd", "supeco"]);
  const unknown = Object.keys(json).filter((k) => !allowed.has(k));
  same(unknown, [], "no stray keys");
});
check("no NaN, null or undefined reaches the payload", () => {
  const walk = (v, path) => {
    if (v === null || v === undefined) throw new Error(`${path} is ${v}`);
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error(`${path} is ${v}`);
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(json, "$");
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
