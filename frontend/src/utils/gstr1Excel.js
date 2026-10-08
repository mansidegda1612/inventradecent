// ═══════════════════════════════════════════════════════════════════════════
// GSTR-1 Excel export — the GSTN offline utility's own workbook layout.
//
// The GST offline tool imports a workbook by SHEET NAME and by the header row
// it finds at row 4. Every sheet it knows about must be present even when it
// has nothing in it, the headers have to read exactly as below, and the data
// has to start at row 5. Anything else and the tool reports "invalid template"
// without saying which sheet it choked on.
//
// So the shape here is not a design choice and should not be tidied:
//
//   row 1  section title
//   row 2  summary labels, parked over the columns they describe
//   row 3  summary values
//   row 4  column headers          <- what the tool actually reads
//   row 5+ data
//
// Figures come from /api/gstr1/report. Nothing is recomputed here beyond
// totalling columns, so the workbook cannot drift from the JSON.
// ═══════════════════════════════════════════════════════════════════════════

import * as XLSX from "xlsx";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (rows, k) => r2(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0));

/**
 * Sum a per-invoice figure once per invoice.
 *
 * The flat sections carry one row per invoice x rate, so a two-rate invoice
 * appears twice. Totalling invoice_value straight down the column would count
 * that invoice's value twice over and make the summary disagree with the JSON.
 */
function sumOnce(rows, idKey, valueKey) {
  const seen = new Set();
  let total = 0;
  for (const r of rows) {
    const id = r[idKey];
    if (seen.has(id)) continue;
    seen.add(id);
    total += Number(r[valueKey]) || 0;
  }
  return r2(total);
}

const distinct = (rows, k) => new Set(rows.map((r) => r[k]).filter(Boolean)).size;

/** Place a value at a 0-based column index inside a fixed-width row. */
function row(width, cells) {
  const out = new Array(width).fill(null);
  for (const [i, v] of Object.entries(cells)) out[Number(i)] = v;
  return out;
}

/**
 * One sheet, assembled from the four fixed rows plus its data.
 * `merges` are A1-style ranges, matching what the template ships with.
 */
function makeSheet({ title, width, summaryLabels = {}, summaryValues = {}, headers, data = [], merges = [], widths }) {
  const aoa = [
    row(width, { 0: title }),
    row(width, summaryLabels),
    row(width, summaryValues),
    headers.slice(0, width),
    ...data.map((d) => {
      const padded = d.slice(0, width);
      while (padded.length < width) padded.push(null);
      return padded;
    }),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (merges.length) ws["!merges"] = merges.map((m) => XLSX.utils.decode_range(m));
  ws["!cols"] = (widths || headers.map((h) => String(h || "").length + 4))
    .slice(0, width)
    .map((w) => ({ wch: Math.min(Math.max(w, 10), 42) }));
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheets
// ─────────────────────────────────────────────────────────────────────────────

function sheetB2B(rows) {
  return makeSheet({
    title: "Summary For B2B,SEZ,DE(4A,4B,6B,6C)",
    width: 13,
    summaryLabels: { 0: "No. of Recipients", 2: "No. of Invoices", 4: "Total Invoice Value", 11: "Total Taxable Value", 12: "Total Cess" },
    summaryValues: {
      0: distinct(rows, "ctin"),
      2: distinct(rows, "invoice_number"),
      4: sumOnce(rows, "invoice_number", "invoice_value"),
      11: sum(rows, "taxable_value"),
      12: sum(rows, "cess"),
    },
    headers: [
      "GSTIN/UIN of Recipient", "Receiver Name", "Invoice Number", "Invoice date",
      "Invoice Value", "Place Of Supply", "Reverse Charge", "Applicable % of Tax Rate",
      "Invoice Type", "E-Commerce GSTIN", "Rate", "Taxable Value", "Cess Amount",
    ],
    data: rows.map((r) => [
      r.ctin, r.receiver_name, r.invoice_number, r.invoice_date_label,
      r2(r.invoice_value), r.place_of_supply_label, r.reverse_charge, null,
      r.invoice_type_label, null, Number(r.rate), r2(r.taxable_value), r2(r.cess),
    ]),
  });
}

function sheetB2CL(rows) {
  return makeSheet({
    title: "Summary For B2CL(5)",
    width: 10,
    summaryLabels: { 0: "No. of Invoices", 2: "Total Invoice Value", 6: "Total Taxable Value", 7: "Total Cess" },
    summaryValues: {
      0: distinct(rows, "invoice_number"),
      2: sumOnce(rows, "invoice_number", "invoice_value"),
      6: sum(rows, "taxable_value"),
      7: sum(rows, "cess"),
    },
    headers: [
      "Invoice Number", "Invoice date", "Invoice Value", "Place Of Supply",
      "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount",
      "E-Commerce GSTIN", "Sale from Bonded WH",
    ],
    data: rows.map((r) => [
      r.invoice_number, r.invoice_date_label, r2(r.invoice_value), r.place_of_supply_label,
      null, Number(r.rate), r2(r.taxable_value), r2(r.cess), null, null,
    ]),
  });
}

function sheetB2CS(rows) {
  return makeSheet({
    title: "Summary For B2CS(7)",
    width: 7,
    summaryLabels: { 4: "Total Taxable Value", 5: "Total Cess" },
    summaryValues: { 4: sum(rows, "taxable_value"), 5: sum(rows, "cess") },
    headers: [
      "Type", "Place Of Supply", "Applicable % of Tax Rate", "Rate",
      "Taxable Value", "Cess Amount", "E-Commerce GSTIN",
    ],
    // The tool infers INTER/INTRA from the place of supply, so the sheet has no
    // column for it even though the JSON carries sply_ty explicitly.
    data: rows.map((r) => [
      r.type, r.place_of_supply_label, null, Number(r.rate),
      r2(r.taxable_value), r2(r.cess), null,
    ]),
  });
}

function sheetCDNR(rows) {
  return makeSheet({
    title: "Summary For CDNR(9B)",
    width: 13,
    summaryLabels: { 0: "No. of Recipient", 2: "No. of Notes", 8: "Total Note Value", 11: "Total Taxable Value", 12: "Total Cess" },
    summaryValues: {
      0: distinct(rows, "ctin"),
      2: distinct(rows, "note_number"),
      8: sumOnce(rows, "note_number", "note_value"),
      11: sum(rows, "taxable_value"),
      12: sum(rows, "cess"),
    },
    headers: [
      "GSTIN/UIN of Recipient", "Receiver Name", "Note Number", "Note Date",
      "Note Type", "Place Of Supply", "Reverse Charge", "Note Supply Type",
      "Note Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount",
    ],
    data: rows.map((r) => [
      r.ctin, r.receiver_name, r.note_number, r.note_date_label,
      r.note_type, r.place_of_supply_label, r.reverse_charge, r.note_supply_type_label,
      r2(r.note_value), null, Number(r.rate), r2(r.taxable_value), r2(r.cess),
    ]),
  });
}

function sheetCDNUR(rows) {
  return makeSheet({
    title: "Summary For CDNUR(9B)",
    width: 10,
    summaryLabels: { 1: "No. of Notes/Vouchers", 5: "Total Note Value", 8: "Total Taxable Value", 9: "Total Cess" },
    summaryValues: {
      1: distinct(rows, "note_number"),
      5: sumOnce(rows, "note_number", "note_value"),
      8: sum(rows, "taxable_value"),
      9: sum(rows, "cess"),
    },
    headers: [
      "UR Type", "Note Number", "Note Date", "Note Type", "Place Of Supply",
      "Note Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount",
    ],
    data: rows.map((r) => [
      r.ur_type, r.note_number, r.note_date_label, r.note_type, r.place_of_supply_label,
      r2(r.note_value), null, Number(r.rate), r2(r.taxable_value), r2(r.cess),
    ]),
  });
}

function sheetExempt(rows) {
  return makeSheet({
    title: "Summary For Nil rated, exempted and non GST outward supplies (8)",
    width: 4,
    summaryLabels: { 1: "Total Nil Rated Supplies", 2: "Total Exempted Supplies", 3: "Total Non-GST Supplies" },
    summaryValues: { 1: sum(rows, "nil_rated"), 2: sum(rows, "exempted"), 3: sum(rows, "non_gst") },
    headers: [
      "Description", "Nil Rated Supplies",
      "Exempted(other than nil rated/non GST supply)", "Non-GST supplies",
    ],
    data: rows.map((r) => [r.description, r2(r.nil_rated), r2(r.exempted), r2(r.non_gst)]),
    widths: [46, 20, 42, 20],
  });
}

function sheetHSN(rows) {
  return makeSheet({
    title: "Summary For HSN(12)",
    width: 11,
    summaryLabels: {
      0: "No. of HSN", 4: "Total Value", 6: "Total Taxable Value",
      7: "Total Integrated Tax", 8: "Total Central Tax", 9: "Total State/UT Tax", 10: "Total Cess",
    },
    summaryValues: {
      0: rows.length,
      4: sum(rows, "total_value"),
      6: sum(rows, "taxable_value"),
      7: sum(rows, "igst"), 8: sum(rows, "cgst"), 9: sum(rows, "sgst"), 10: sum(rows, "cess"),
    },
    headers: [
      "HSN", "Description", "UQC", "Total Quantity", "Total Value", "Rate",
      "Taxable Value", "Integrated Tax Amount", "Central Tax Amount",
      "State/UT Tax Amount", "Cess Amount",
    ],
    data: rows.map((r) => [
      r.hsn_code || null, r.description || null, r.uqc_label || null,
      Number(r.total_quantity) || 0, r2(r.total_value), Number(r.rate),
      r2(r.taxable_value), r2(r.igst), r2(r.cgst), r2(r.sgst), r2(r.cess),
    ]),
  });
}

function sheetDocs(rows) {
  return makeSheet({
    title: "Summary of documents issued during the tax period(13)",
    width: 5,
    summaryLabels: { 3: "Total Number", 4: "Total Cancelled" },
    summaryValues: { 3: sum(rows, "total_number"), 4: sum(rows, "cancelled") },
    headers: ["Nature of Document", "Sr. No. From", "Sr. No. To", "Total Number", "Cancelled"],
    data: rows.map((r) => [
      r.document_type, r.from_no, r.to_no,
      Number(r.total_number) || 0, Number(r.cancelled) || 0,
    ]),
    widths: [44, 22, 22, 16, 14],
  });
}

/**
 * The sheets this application never populates.
 *
 * They are shipped empty rather than omitted because the offline tool refuses
 * a workbook that is missing one of its known sheets. Exports, advances and
 * e-commerce supplies are not recorded anywhere in this system; the amendment
 * sheets are the portal's own Table 9A/10 surface and are raised there, not here.
 */
const EMPTY_SHEETS = [
  {
    name: "b2ba", title: "Summary For B2BA", width: 15,
    merges: ["B1:D1", "E1:O1"],
    titleRow: { 1: "Original Details", 4: "Revised details" },
    summaryLabels: { 0: "No. of Recipients", 2: "No. of Invoices", 6: "Total Invoice Value", 13: "Total Taxable Value", 14: "Total Cess" },
    headers: ["GSTIN/UIN of Recipient", "Receiver Name", "Original Invoice Number", "Original Invoice date", "Revised Invoice Number", "Revised Invoice date", "Invoice Value", "Place Of Supply", "Reverse Charge", "Applicable % of Tax Rate", "Invoice Type", "E-Commerce GSTIN", "Rate", "Taxable Value", "Cess Amount"],
  },
  {
    name: "b2cla", title: "Summary For B2CLA", width: 12,
    merges: ["B1:C1", "D1:L1"],
    titleRow: { 1: "Original Details", 3: "Revised details" },
    summaryLabels: { 0: "No. of Invoices", 5: "Total Invoice Value", 8: "Total Taxable Value", 9: "Total Cess" },
    headers: ["Original Invoice Number", "Original Invoice date", "Original Place Of Supply", "Revised Invoice Number", "Revised Invoice date", "Invoice Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount", "E-Commerce GSTIN", "Sale from Bonded WH"],
  },
  {
    name: "b2csa", title: "Summary For B2CSA", width: 9,
    merges: ["B1:B1", "C1:I1"],
    titleRow: { 1: "Original Details", 2: "Revised details" },
    summaryLabels: { 6: "Total Taxable Value", 7: "Total Cess" },
    headers: ["Financial Year", "Original Month", "Place Of Supply", "Type", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount", "E-Commerce GSTIN"],
  },
  {
    name: "cdnra", title: "Summary For CDNRA", width: 15,
    merges: ["B1:F1", "G1:O1"],
    titleRow: { 1: "Original Details", 6: "Revised details" },
    summaryLabels: { 0: "No. of Recipient", 2: "No. of Notes/Vouchers", 10: "Total Note Value", 13: "Total Taxable Value", 14: "Total Cess" },
    headers: ["GSTIN/UIN of Recipient", "Receiver Name", "Original Note Number", "Original Note Date", "Revised Note Number", "Revised Note Date", "Note Type", "Place Of Supply", "Reverse Charge", "Note Supply Type", "Note Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount"],
  },
  {
    name: "cdnura", title: "Summary For CDNURA", width: 12,
    merges: ["B1:E1", "F1:L1"],
    titleRow: { 1: "Original Details", 5: "Revised details" },
    summaryLabels: { 1: "No. of Notes/Vouchers", 7: "Total Note Value", 10: "Total Taxable Value", 11: "Total Cess" },
    headers: ["UR Type", "Original Note Number", "Original Note Date", "Revised Note Number", "Revised Note Date", "Note Type", "Place Of Supply", "Note Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount"],
  },
  {
    name: "exp", title: "Summary For EXP(6)", width: 10,
    summaryLabels: { 1: "No. of Invoices", 3: "Total Invoice Value", 5: "No. of Shipping Bill", 8: "Total Taxable Value", 9: "Total Cess" },
    headers: ["Export Type", "Invoice Number", "Invoice date", "Invoice Value", "Port Code", "Shipping Bill Number", "Shipping Bill Date", "Rate", "Taxable Value", "Cess Amount"],
  },
  {
    name: "expa", title: "Summary For EXPA", width: 12,
    merges: ["B1:C1", "D1:L1"],
    titleRow: { 1: "Original Details", 3: "Revised details" },
    summaryLabels: { 1: "No. of Invoices", 5: "Total Invoice Value", 7: "No. of Shipping Bill", 10: "Total Taxable Value", 11: "Total Cess" },
    headers: ["Export Type", "Original Invoice Number", "Original Invoice date", "Revised Invoice Number", "Revised Invoice date", "Invoice Value", "Port Code", "Shipping Bill Number", "Shipping Bill Date", "Rate", "Taxable Value", "Cess Amount"],
  },
  {
    name: "at", title: "Summary For Advance Received (11B)", width: 5,
    summaryLabels: { 3: "Total Advanced Received", 4: "Total Cess" },
    headers: ["Place Of Supply", "Applicable % of Tax Rate", "Rate", "Gross Advance Received", "Cess Amount"],
  },
  {
    name: "ata", title: "Summary For Amended Tax Liability(Advance Received)", width: 7,
    merges: ["B1:C1", "D1:G1"],
    titleRow: { 1: "Original Details", 3: "Revised details" },
    summaryLabels: { 5: "Total Advanced Received", 6: "Total Cess" },
    headers: ["Financial Year", "Original Month", "Original Place Of Supply", "Applicable % of Tax Rate", "Rate", "Gross Advance Received", "Cess Amount"],
  },
  {
    name: "atadj", title: "Summary For Advance Adjusted (11B)", width: 5,
    summaryLabels: { 3: "Total Advanced Adjusted", 4: "Total Cess" },
    headers: ["Place Of Supply", "Applicable % of Tax Rate", "Rate", "Gross Advance Adjusted", "Cess Amount"],
  },
  {
    name: "atadja", title: "Summary For Amendement Of Adjustment Advances", width: 7,
    merges: ["B1:C1", "D1:G1"],
    titleRow: { 1: "Original Details", 3: "Revised details" },
    summaryLabels: { 5: "Total Advanced Adjusted", 6: "Total Cess" },
    headers: ["Financial Year", "Original Month", "Original Place Of Supply", "Applicable % of Tax Rate", "Rate", "Gross Advance Adjusted", "Cess Amount"],
  },
  {
    name: "eco", title: "Summary For Supplies through ECO-14", width: 8,
    summaryLabels: { 1: "No. of E-Commerce Operator", 3: "Total Net Value of Supplies", 4: "Total Integrated Tax", 5: "Total Central Tax", 6: "Total State/UT Tax", 7: "Total Cess" },
    headers: ["Nature of Supply", "GSTIN of E-Commerce Operator", "E-Commerce Operator Name", "Net value of supplies", "Integrated tax", "Central tax", "State/UT tax", "Cess"],
  },
];

function emptySheet(spec) {
  const ws = makeSheet({
    title: spec.title,
    width: spec.width,
    summaryLabels: spec.summaryLabels || {},
    headers: spec.headers,
    merges: spec.merges || [],
  });
  // The amendment sheets carry "Original Details" / "Revised details" banners
  // on the title row, over the merged spans declared above.
  for (const [col, text] of Object.entries(spec.titleRow || {})) {
    ws[XLSX.utils.encode_cell({ r: 0, c: Number(col) })] = { t: "s", v: text };
  }
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workbook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full 22-sheet GSTR-1 workbook from a /api/gstr1/report payload.
 * Sheet ORDER matters to the offline tool's own navigation, so it matches the
 * template rather than being grouped by what is populated.
 */
export function buildGstr1Workbook(report) {
  const s = report?.sections || {};
  const wb = XLSX.utils.book_new();

  const help = XLSX.utils.aoa_to_sheet([
    ["Help Instructions"],
    [],
    [`Return Period: ${report?.range?.label || report?.period || ""}`],
    [`GSTIN: ${report?.filer?.gstin || ""}`],
    [`Taxpayer: ${report?.filer?.name || ""}`],
    [`Filing period (fp) declared in the JSON: ${report?.range?.fp || report?.period || ""}`],
    [`Generated: ${new Date().toLocaleString("en-IN")}`],
    [],
    ["Each sheet below mirrors a GSTR-1 table. Data starts at row 5; rows 1-4 are"],
    ["the section title, summary labels, summary values and column headers, in that"],
    ["order. Do not insert or delete rows above row 5 — the GST offline utility"],
    ["reads the headers from row 4 and will reject the file if they move."],
  ]);
  help["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, help, "Help Instruction");

  const empties = Object.fromEntries(EMPTY_SHEETS.map((e) => [e.name, e]));
  const add = (name, ws) => XLSX.utils.book_append_sheet(wb, ws, name);

  add("b2b,sez,de", sheetB2B(s.b2b || []));
  add("b2ba", emptySheet(empties.b2ba));
  add("b2cl", sheetB2CL(s.b2cl || []));
  add("b2cla", emptySheet(empties.b2cla));
  add("b2cs", sheetB2CS(s.b2cs || []));
  add("b2csa", emptySheet(empties.b2csa));
  add("cdnr", sheetCDNR(s.cdnr || []));
  add("cdnra", emptySheet(empties.cdnra));
  add("cdnur", sheetCDNUR(s.cdnur || []));
  add("cdnura", emptySheet(empties.cdnura));
  add("exp", emptySheet(empties.exp));
  add("expa", emptySheet(empties.expa));
  add("at", emptySheet(empties.at));
  add("ata", emptySheet(empties.ata));
  add("atadj", emptySheet(empties.atadj));
  add("atadja", emptySheet(empties.atadja));
  add("exemp", sheetExempt(s.nil || []));
  add("hsn(b2b)", sheetHSN(s.hsn_b2b || []));
  add("hsn(b2c)", sheetHSN(s.hsn_b2c || []));
  add("docs", sheetDocs(s.docs || []));
  add("eco", emptySheet(empties.eco));

  return wb;
}

/** Portal convention: <GSTIN>_GSTR1_<period>.xlsx */
export function gstr1FileName(report, ext) {
  const gstin = report?.filer?.gstin || "GSTR1";
  const r = report?.range;
  const tag =
    r?.mode === "yearly" ? `${r.fy}-${r.fy + 1}`
    : r?.mode === "quarterly" ? `${r.fp}_Q`
    : r?.fp || report?.period || "";
  return `${gstin}_GSTR1_${tag}.${ext}`;
}

export function downloadGstr1Excel(report) {
  XLSX.writeFile(buildGstr1Workbook(report), gstr1FileName(report, "xlsx"));
}
