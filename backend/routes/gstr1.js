// ═══════════════════════════════════════════════════════════════════════════
// GSTR-1 — report, portal JSON, pre-filing gate, filing snapshot, amendments
//
// Sections built here:
//   4A  B2B          — invoices to GSTIN-holding customers
//   5   B2CL         — inter-state B2C invoices above the per-invoice threshold
//   7   B2CS         — all other B2C supplies, consolidated by POS x rate
//   8   NIL          — nil rated / exempted / non-GST
//   9B  CDNR / CDNUR — credit notes (sales returns)
//   10  B2CA         — amendments against a filed period
//   12  HSN          — split into hsn_b2b and hsn_b2c, as the portal does
//   13  DOCS         — documents issued
//
// Every figure comes from transaction_items.gst_rate / taxable_amount — the
// values frozen at invoice time — and never from product.gstPer, which is
// mutable and would silently re-rate an already-filed period.
//
// A report can be built over a month, a quarter or a financial year; see
// resolveRange(). The portal only ever accepts ONE tax period per upload, so
// the quarter/year modes carry the fp the portal expects for that filing
// frequency (QRMP filers file the quarter under its last month).
//
// REQUIRES migration Stages 1-3A.
// ═══════════════════════════════════════════════════════════════════════════

const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/AuthMiddleware");
const { getHomeState, isValidGstin } = require("../config/gst");
const { posLabel, uqcLabel, DOC_TYPES, TRANS_TYPE_DOC_NUM } = require("../config/gstMaster");

router.use(auth);

// B2C-Large threshold: an inter-state B2C invoice above this is reported
// per-invoice in Table 5 instead of being consolidated into Table 7.
// Reduced from ₹2,50,000 by Notification 12/2024-Central Tax. Confirm the
// figure in force for the period being filed before relying on it.
const B2CL_THRESHOLD = 100000;

// Schema version the generated JSON declares. The portal rejects an upload
// whose version it does not recognise, so this is a deliberate constant and
// not a free-text field.
const JSON_VERSION = "GST3.2.2";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (n) => Number(n) || 0;

/** MySQL caps how much it will parse in one statement; chunk long IN lists. */
function chunk(arr, size = 1000) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Period / range resolution
// ─────────────────────────────────────────────────────────────────────────────

/** 'MMYYYY' -> half-open [from, next) date bounds. */
function periodBounds(period) {
  if (!/^\d{6}$/.test(period || "")) {
    throw Object.assign(new Error("period must be MMYYYY, e.g. 052026"), { status: 400 });
  }
  const mm = Number(period.slice(0, 2));
  const yyyy = Number(period.slice(2));
  if (mm < 1 || mm > 12) {
    throw Object.assign(new Error(`invalid month in period '${period}'`), { status: 400 });
  }
  // Half-open, so a bill timestamped late on the last day of the month is not
  // silently dropped the way BETWEEN ... LAST_DAY() would drop it.
  const from = `${yyyy}-${String(mm).padStart(2, "0")}-01 00:00:00`;
  const nextY = mm === 12 ? yyyy + 1 : yyyy;
  const nextM = mm === 12 ? 1 : mm + 1;
  const next = `${nextY}-${String(nextM).padStart(2, "0")}-01 00:00:00`;
  return { from, next };
}

const mmyyyy = (m, y) => String(m).padStart(2, "0") + y;

/** First day of month m (1-12) in year y, as a MySQL datetime literal. */
const dayOne = (m, y) => `${y}-${String(m).padStart(2, "0")}-01 00:00:00`;

/**
 * Work out the date window a report covers, and the tax period the portal
 * should see it filed under.
 *
 * Three modes, all keyed to the Indian financial year (April-March), because
 * that is the year GST numbering and filing both run on:
 *
 *   monthly   ?mode=monthly&period=MMYYYY
 *   quarterly ?mode=quarterly&fy=2026&quarter=1       Q1 = Apr-Jun
 *   yearly    ?mode=yearly&fy=2026                    Apr 2026 - Mar 2027
 *
 * `fy=2026` means FY 2026-27, matching the `fin_year` generated column.
 *
 * About `fp`: GSTR-1 is filed for a single tax period. A monthly filer's fp is
 * the month; a QRMP (quarterly) filer's fp is the LAST month of the quarter —
 * that is what the portal expects and what the offline tool emits. There is no
 * annual GSTR-1, so the yearly mode carries March of the closing year and is
 * marked not portal-filable; it exists for reconciliation, not for upload.
 */
function resolveRange(q = {}) {
  const mode = String(q.mode || "monthly").toLowerCase();

  if (mode === "monthly") {
    const period = q.period;
    const { from, next } = periodBounds(period);
    const mm = Number(period.slice(0, 2));
    const yyyy = Number(period.slice(2));
    return {
      mode: "monthly",
      from, next,
      fp: period,
      months: [period],
      // FY label: Jan-Mar belong to the FY that started the previous April.
      fy: mm < 4 ? yyyy - 1 : yyyy,
      label: `${MONTH_ABBR[mm - 1]} ${yyyy}`,
      portal_filable: true,
    };
  }

  const fy = Number(q.fy);
  if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) {
    throw Object.assign(new Error("fy must be the starting year of the financial year, e.g. 2026 for FY 2026-27"), { status: 400 });
  }

  if (mode === "quarterly") {
    const qn = Number(q.quarter);
    if (![1, 2, 3, 4].includes(qn)) {
      throw Object.assign(new Error("quarter must be 1, 2, 3 or 4 (Q1 = Apr-Jun)"), { status: 400 });
    }
    // Q1 starts at April, each quarter three months on; Q4 (Jan-Mar) has
    // rolled into the next calendar year.
    const startMonth = 4 + (qn - 1) * 3;        // 4, 7, 10, 13
    const sM = ((startMonth - 1) % 12) + 1;     // 4, 7, 10, 1
    const sY = startMonth > 12 ? fy + 1 : fy;
    const endMonth = startMonth + 2;            // 6, 9, 12, 15
    const eM = ((endMonth - 1) % 12) + 1;       // 6, 9, 12, 3
    const eY = endMonth > 12 ? fy + 1 : fy;

    const months = [];
    for (let i = 0; i < 3; i++) {
      const m = ((startMonth - 1 + i) % 12) + 1;
      const y = startMonth + i > 12 ? fy + 1 : fy;
      months.push(mmyyyy(m, y));
    }

    return {
      mode: "quarterly",
      from: dayOne(sM, sY),
      next: eM === 12 ? dayOne(1, eY + 1) : dayOne(eM + 1, eY),
      fp: mmyyyy(eM, eY),            // QRMP files the quarter under its last month
      months,
      fy,
      label: `Q${qn} FY ${fy}-${String(fy + 1).slice(2)} (${MONTH_ABBR[sM - 1]} ${sY} – ${MONTH_ABBR[eM - 1]} ${eY})`,
      portal_filable: true,
    };
  }

  if (mode === "yearly" || mode === "annual") {
    const months = [];
    for (let i = 0; i < 12; i++) {
      const m = ((3 + i) % 12) + 1;
      months.push(mmyyyy(m, m >= 4 ? fy : fy + 1));
    }
    return {
      mode: "yearly",
      from: dayOne(4, fy),
      next: dayOne(4, fy + 1),
      fp: mmyyyy(3, fy + 1),
      months,
      fy,
      label: `FY ${fy}-${String(fy + 1).slice(2)} (Apr ${fy} – Mar ${fy + 1})`,
      // GSTR-1 has no annual return. The JSON is structurally valid and will
      // open in the offline tool, but uploading it would file twelve months'
      // supplies into a single period.
      portal_filable: false,
    };
  }

  throw Object.assign(new Error("mode must be monthly, quarterly or yearly"), { status: 400 });
}

// Common filter: a live sale invoice inside the range.
const SI_IN_PERIOD = `
  t.trans_type = 'SI'
  AND t.is_cancelled = 0
  AND t.\`date\` >= ? AND t.\`date\` < ?`;

// The same, for sales returns — which become GSTR-1 credit notes.
const SR_IN_PERIOD = `
  t.trans_type = 'SR'
  AND t.is_cancelled = 0
  AND t.\`date\` >= ? AND t.\`date\` < ?`;

// ─────────────────────────────────────────────────────────────────────────────
// Shared loaders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every live document of one type in the range, with its counterparty.
 *
 * cashcustdetail carries the walk-in name for customer_id = 0 bills, so a cash
 * sale still shows a receiver name in the Excel instead of a blank.
 */
async function loadDocuments(conn, { from, next, transType }) {
  const filter = transType === "SR" ? SR_IN_PERIOD : SI_IN_PERIOD;
  const [rows] = await conn.query(
    `SELECT t.id,
            t.bill_no,
            DATE_FORMAT(t.\`date\`, '%d-%m-%Y')  AS doc_date,
            DATE_FORMAT(t.\`date\`, '%d-%b-%Y')  AS doc_date_label,
            ROUND(ABS(t.final_amount), 2)        AS doc_value,
            t.place_of_supply,
            c.gstin,
            COALESCE(NULLIF(c.name, ''), NULLIF(cc.custName, ''), 'Cash Sale') AS party_name
       FROM \`transaction\` t
       LEFT JOIN customer       c  ON c.id = t.customer_id
       LEFT JOIN cashcustdetail cc ON cc.transaction_id = t.id
      WHERE ${filter}
      ORDER BY t.\`date\`, t.id`,
    [from, next]
  );
  return rows;
}

/**
 * Line items for a set of documents, pre-aggregated by rate.
 *
 * GSTR-1 reports one itm_det per rate per invoice, not one per product line,
 * so the collapse happens here rather than in every caller.
 *
 * @returns Map<transaction_id, Array<{rt, txval, iamt, camt, samt, csamt}>>
 */
async function loadItemsByRate(conn, ids) {
  const byDoc = new Map();
  if (!ids.length) return byDoc;

  for (const slice of chunk(ids)) {
    const [rows] = await conn.query(
      `SELECT ti.transaction_id,
              ti.gst_rate                      AS rt,
              ROUND(SUM(ti.taxable_amount), 2) AS txval,
              ROUND(SUM(ti.IGST), 2)           AS iamt,
              ROUND(SUM(ti.CGST), 2)           AS camt,
              ROUND(SUM(ti.SGST), 2)           AS samt,
              ROUND(SUM(ti.cess), 2)           AS csamt
         FROM transaction_items ti
        WHERE ti.transaction_id IN (?)
        GROUP BY ti.transaction_id, ti.gst_rate
        ORDER BY ti.transaction_id, ti.gst_rate`,
      [slice]
    );
    for (const r of rows) {
      if (!byDoc.has(r.transaction_id)) byDoc.set(r.transaction_id, []);
      byDoc.get(r.transaction_id).push({
        rt: Number(r.rt),
        txval: num(r.txval),
        iamt: num(r.iamt),
        camt: num(r.camt),
        samt: num(r.samt),
        csamt: num(r.csamt),
      });
    }
  }
  return byDoc;
}

/**
 * Split outward documents into the GSTR-1 table each one belongs to.
 *
 * The order matters and is not arbitrary:
 *   1. A customer with a valid GSTIN is B2B, whatever the invoice is worth.
 *   2. Otherwise an inter-state invoice above the threshold is B2CL.
 *   3. Everything else consolidates into B2CS.
 *
 * An invoice can only ever appear in one of the three; double-counting here is
 * exactly the error that makes Table 7 and Table 12 stop tying.
 */
function classify(docs, homeState) {
  const b2b = [], b2cl = [], b2cs = [];
  for (const d of docs) {
    const gstin = String(d.gstin || "").trim().toUpperCase();
    if (isValidGstin(gstin)) {
      b2b.push({ ...d, gstin });
    } else if (d.place_of_supply !== homeState && num(d.doc_value) > B2CL_THRESHOLD) {
      b2cl.push({ ...d, gstin: "" });
    } else {
      b2cs.push({ ...d, gstin: "" });
    }
  }
  return { b2b, b2cl, b2cs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Table 4A — B2B.
 *
 * Flat, one row per invoice x rate, which is the shape the Excel sheet wants.
 * The portal JSON nests this by recipient; buildPortalJson() does the nesting.
 *
 * Nil-rated lines on a B2B invoice stay HERE rather than moving to Table 8: an
 * invoice issued to a registered person has to be reported in full, or its
 * declared invoice value will not tie to the sum of its line items.
 */
function tableB2B(b2bDocs, itemsByDoc) {
  const out = [];
  for (const d of b2bDocs) {
    for (const it of itemsByDoc.get(d.id) || []) {
      out.push({
        ctin: d.gstin,
        receiver_name: d.party_name,
        invoice_number: d.bill_no,
        invoice_date: d.doc_date,
        invoice_date_label: d.doc_date_label,
        invoice_value: num(d.doc_value),
        place_of_supply: d.place_of_supply,
        place_of_supply_label: posLabel(d.place_of_supply),
        reverse_charge: "N",
        invoice_type: "R",
        invoice_type_label: "Regular B2B",
        rate: it.rt,
        taxable_value: it.txval,
        igst: it.iamt,
        cgst: it.camt,
        sgst: it.samt,
        cess: it.csamt,
      });
    }
  }
  return out;
}

/** Table 5 — B2C Large: inter-state, above threshold, reported per invoice. */
function tableB2CL(b2clDocs, itemsByDoc) {
  const out = [];
  for (const d of b2clDocs) {
    for (const it of itemsByDoc.get(d.id) || []) {
      // A B2CL supply is inter-state by definition, so the whole tax sits in
      // IGST. CGST/SGST on one of these rows means the bill was taxed against
      // the wrong head — check B5 catches it before it reaches here.
      out.push({
        invoice_number: d.bill_no,
        invoice_date: d.doc_date,
        invoice_date_label: d.doc_date_label,
        invoice_value: num(d.doc_value),
        place_of_supply: d.place_of_supply,
        place_of_supply_label: posLabel(d.place_of_supply),
        rate: it.rt,
        taxable_value: it.txval,
        igst: it.iamt,
        cess: it.csamt,
      });
    }
  }
  return out;
}

/**
 * Table 7 — B2C Others, consolidated by place of supply and rate.
 *
 * Credit notes issued to unregistered buyers that are too small for CDNUR are
 * netted off here, which is how the portal expects them: there is no separate
 * row for a small B2C return, the supply value simply drops.
 *
 * 0% lines are excluded — those are nil rated and belong in Table 8.
 */
function tableB2CS(b2csDocs, itemsByDoc, { homeState, creditDocs = [], creditItems = new Map() }) {
  const acc = new Map();
  const key = (pos, rt) => `${pos}|${rt}`;

  const apply = (docs, items, sign) => {
    for (const d of docs) {
      for (const it of items.get(d.id) || []) {
        if (it.rt <= 0) continue;
        const k = key(d.place_of_supply, it.rt);
        if (!acc.has(k)) {
          acc.set(k, {
            supply_type: d.place_of_supply === homeState ? "INTRA" : "INTER",
            type: "OE",
            place_of_supply: d.place_of_supply,
            place_of_supply_label: posLabel(d.place_of_supply),
            rate: it.rt,
            taxable_value: 0, igst: 0, cgst: 0, sgst: 0, cess: 0,
          });
        }
        const row = acc.get(k);
        row.taxable_value += sign * it.txval;
        row.igst  += sign * it.iamt;
        row.cgst  += sign * it.camt;
        row.sgst  += sign * it.samt;
        row.cess  += sign * it.csamt;
      }
    }
  };

  apply(b2csDocs, itemsByDoc, +1);
  apply(creditDocs, creditItems, -1);

  return [...acc.values()]
    .map((r) => ({
      ...r,
      taxable_value: round2(r.taxable_value),
      igst: round2(r.igst), cgst: round2(r.cgst),
      sgst: round2(r.sgst), cess: round2(r.cess),
    }))
    // A row that nets to exactly nothing is not a reportable supply.
    .filter((r) => r.taxable_value !== 0 || r.igst !== 0 || r.cgst !== 0 || r.sgst !== 0 || r.cess !== 0)
    .sort((a, b) => a.place_of_supply.localeCompare(b.place_of_supply) || a.rate - b.rate);
}

/**
 * Table 8 — nil rated / exempted / non-GST outward supplies.
 *
 * Both unregistered-person rows are emitted even at zero: Table 8 is mandatory
 * and a nil return still has to state the nil.
 *
 * Supply type is derived from the rate — 0% reports as nil rated. The exempted
 * and non-GST columns are therefore always zero: without a stored
 * classification those three cases are indistinguishable. See supplyTypeFor()
 * in config/gst.js.
 *
 * Only CONSOLIDATED B2C lines reach here. A nil-rated line on a B2B or B2CL
 * invoice stays on that invoice — both are reported per-invoice, so moving a
 * line out of one would break the invoice value against its own line items,
 * and leaving it in both would count it twice.
 */
function tableNil(b2csDocs, itemsByDoc, homeState) {
  const total = { inter: 0, intra: 0 };
  for (const d of b2csDocs) {
    for (const it of itemsByDoc.get(d.id) || []) {
      if (it.rt > 0) continue;
      total[d.place_of_supply === homeState ? "intra" : "inter"] += it.txval;
    }
  }
  return [
    {
      supply_type: "INTRB2C",
      description: "Inter-State supplies to unregistered persons",
      nil_rated: round2(total.inter), exempted: 0, non_gst: 0,
    },
    {
      supply_type: "INTRAB2C",
      description: "Intra-State supplies to unregistered persons",
      nil_rated: round2(total.intra), exempted: 0, non_gst: 0,
    },
  ];
}

/**
 * Table 9B — credit notes.
 *
 * Sales returns are this application's credit notes. Where they land depends
 * on who they were issued to:
 *
 *   registered buyer                    -> CDNR
 *   unregistered, inter-state, > 1L     -> CDNUR (type B2CL)
 *   any other unregistered buyer        -> netted into Table 7, not reported
 *                                          separately. See tableB2CS().
 *
 * ntty is always 'C'. This application has no debit-note document type, so a
 * 'D' note can never be produced from it.
 */
function tableCreditNotes(srDocs, itemsByDoc, homeState) {
  const cdnr = [], cdnur = [], netted = [];

  for (const d of srDocs) {
    const gstin = String(d.gstin || "").trim().toUpperCase();
    const items = itemsByDoc.get(d.id) || [];
    const interState = d.place_of_supply !== homeState;

    if (isValidGstin(gstin)) {
      for (const it of items) {
        cdnr.push({
          ctin: gstin,
          receiver_name: d.party_name,
          note_number: d.bill_no,
          note_date: d.doc_date,
          note_date_label: d.doc_date_label,
          note_type: "C",
          place_of_supply: d.place_of_supply,
          place_of_supply_label: posLabel(d.place_of_supply),
          reverse_charge: "N",
          note_supply_type: "R",
          note_supply_type_label: "Regular B2B",
          note_value: num(d.doc_value),
          rate: it.rt,
          taxable_value: it.txval,
          igst: it.iamt, cgst: it.camt, sgst: it.samt, cess: it.csamt,
        });
      }
    } else if (interState && num(d.doc_value) > B2CL_THRESHOLD) {
      for (const it of items) {
        cdnur.push({
          ur_type: "B2CL",
          note_number: d.bill_no,
          note_date: d.doc_date,
          note_date_label: d.doc_date_label,
          note_type: "C",
          place_of_supply: d.place_of_supply,
          place_of_supply_label: posLabel(d.place_of_supply),
          note_value: num(d.doc_value),
          rate: it.rt,
          taxable_value: it.txval,
          igst: it.iamt, cess: it.csamt,
        });
      }
    } else {
      netted.push(d);
    }
  }

  return { cdnr, cdnur, netted };
}

/**
 * Table 12 — HSN summary, split B2B / B2C the way the portal splits it.
 *
 * Grouped by HSN x UQC x rate. total_value is taxable + every tax head, which
 * is what makes it reconcilable against Tables 4A/5/7.
 *
 * Credit notes are subtracted from the side they were issued on, so the HSN
 * totals move with the supply tables rather than drifting away from them the
 * moment a return is raised.
 */
async function tableHSN(conn, { b2bIds, b2cIds, crB2bIds, crB2cIds }) {
  const acc = new Map();

  const fold = async (ids, bucket, sign) => {
    if (!ids.length) return;
    for (const slice of chunk(ids)) {
      const [rows] = await conn.query(
        `SELECT p.hsn_code,
                MIN(p.name)                AS description,
                p.uqc,
                ROUND(SUM(ti.qty), 3)      AS qty,
                ti.gst_rate                AS rt,
                ROUND(SUM(ti.taxable_amount), 2) AS txval,
                ROUND(SUM(ti.IGST), 2)     AS iamt,
                ROUND(SUM(ti.CGST), 2)     AS camt,
                ROUND(SUM(ti.SGST), 2)     AS samt,
                ROUND(SUM(ti.cess), 2)     AS csamt
           FROM transaction_items ti
           JOIN product p ON p.id = ti.product_id
          WHERE ti.transaction_id IN (?)
          GROUP BY p.hsn_code, p.uqc, ti.gst_rate`,
        [slice]
      );
      for (const r of rows) {
        const k = `${bucket}|${r.hsn_code || ""}|${r.uqc || ""}|${Number(r.rt)}`;
        if (!acc.has(k)) {
          acc.set(k, {
            bucket,
            hsn_code: r.hsn_code || "",
            description: r.description || "",
            uqc: r.uqc || "",
            uqc_label: uqcLabel(r.uqc),
            rate: Number(r.rt),
            total_quantity: 0, taxable_value: 0,
            igst: 0, cgst: 0, sgst: 0, cess: 0,
          });
        }
        const g = acc.get(k);
        g.total_quantity += sign * num(r.qty);
        g.taxable_value  += sign * num(r.txval);
        g.igst += sign * num(r.iamt);
        g.cgst += sign * num(r.camt);
        g.sgst += sign * num(r.samt);
        g.cess += sign * num(r.csamt);
      }
    }
  };

  await fold(b2bIds, "b2b", +1);
  await fold(crB2bIds, "b2b", -1);
  await fold(b2cIds, "b2c", +1);
  await fold(crB2cIds, "b2c", -1);

  const finish = (bucket) =>
    [...acc.values()]
      .filter((g) => g.bucket === bucket)
      .map(({ bucket: _b, ...g }) => ({
        ...g,
        total_quantity: Math.round(g.total_quantity * 1000) / 1000,
        taxable_value: round2(g.taxable_value),
        igst: round2(g.igst), cgst: round2(g.cgst),
        sgst: round2(g.sgst), cess: round2(g.cess),
        total_value: round2(g.taxable_value + g.igst + g.cgst + g.sgst + g.cess),
      }))
      .sort((a, b) => String(a.hsn_code).localeCompare(String(b.hsn_code)) || a.rate - b.rate);

  return { hsn_b2b: finish("b2b"), hsn_b2c: finish("b2c") };
}

/**
 * Compare two document numbers the way a human reads a series: digit runs
 * compared as numbers, everything else as text.
 *
 * Sorting on the trailing number alone is not enough. 'AFF-319/2026-27' ends
 * in '27', and so does every other bill in that series, so the whole range
 * collapses to a single number. Comparing run-by-run finds the part that
 * actually varies — 319 vs 320 vs 321 — whichever position it sits in.
 * Plain lexical sort is wrong too: '187' < '83' as text.
 */
function naturalCompare(a, b) {
  const A = String(a).match(/(\d+|\D+)/g) || [];
  const B = String(b).match(/(\d+|\D+)/g) || [];
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i], y = B[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const bothNumeric = /^\d+$/.test(x) && /^\d+$/.test(y);
    if (bothNumeric) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Table 13 — Documents issued.
 *
 * Series are derived by masking every digit run, so 'BILL-0001'..'BILL-0042'
 * collapse to one series 'BILL-#'. Grouping and range-finding happen in JS
 * rather than SQL because the from/to ordering needs naturalCompare(), which
 * has no clean SQL equivalent.
 *
 * Cancelled documents are counted, not excluded — a cancelled number is
 * consumed, and the portal asks how many.
 */
async function table13(conn, { from, next }) {
  const [rows] = await conn.query(
    `SELECT t.trans_type, t.bill_no, t.is_cancelled
       FROM \`transaction\` t
      WHERE t.trans_type IN ('SI', 'SR', 'CR')
        AND t.\`date\` >= ? AND t.\`date\` < ?`,
    [from, next]
  );

  const groups = new Map();

  for (const r of rows) {
    const docNum = TRANS_TYPE_DOC_NUM[r.trans_type];
    if (!docNum) continue;
    const series = String(r.bill_no ?? "").replace(/\d+/g, "#");
    const key = `${docNum}|${series}`;
    if (!groups.has(key)) {
      groups.set(key, {
        doc_num: docNum,
        document_type: DOC_TYPES[docNum],
        series,
        numbers: [],
        total_number: 0,
        cancelled: 0,
      });
    }
    const g = groups.get(key);
    g.numbers.push(r.bill_no);
    g.total_number += 1;
    g.cancelled += r.is_cancelled ? 1 : 0;
  }

  return [...groups.values()]
    .map((g) => {
      const sorted = g.numbers.sort(naturalCompare);
      return {
        doc_num: g.doc_num,
        document_type: g.document_type,
        series: g.series,
        from_no: sorted[0],
        to_no: sorted[sorted.length - 1],
        total_number: g.total_number,
        cancelled: g.cancelled,
        net_issued: g.total_number - g.cancelled,
      };
    })
    // doc_num order, which is the order the portal lists natures of document in.
    .sort((a, b) => a.doc_num - b.doc_num || naturalCompare(a.from_no, b.from_no));
}

// ─────────────────────────────────────────────────────────────────────────────
// Report assembly — one place, so the screen, the Excel and the portal JSON
// can never disagree about a figure.
// ─────────────────────────────────────────────────────────────────────────────
async function buildSections(conn, { from, next, homeState }) {
  const [siDocs, srDocs] = await Promise.all([
    loadDocuments(conn, { from, next, transType: "SI" }),
    loadDocuments(conn, { from, next, transType: "SR" }),
  ]);

  const { b2b, b2cl, b2cs } = classify(siDocs, homeState);

  const [siItems, srItems] = await Promise.all([
    loadItemsByRate(conn, siDocs.map((d) => d.id)),
    loadItemsByRate(conn, srDocs.map((d) => d.id)),
  ]);

  const notes = tableCreditNotes(srDocs, srItems, homeState);

  // Credit notes split the same way their supplies did, so the HSN table can
  // subtract each one from the side it actually reduces.
  const crB2bIds = srDocs.filter((d) => isValidGstin(String(d.gstin || "").toUpperCase())).map((d) => d.id);
  const crB2cIds = srDocs.filter((d) => !isValidGstin(String(d.gstin || "").toUpperCase())).map((d) => d.id);

  const hsn = await tableHSN(conn, {
    b2bIds: b2b.map((d) => d.id),
    b2cIds: [...b2cl, ...b2cs].map((d) => d.id),
    crB2bIds,
    crB2cIds,
  });

  const docs = await table13(conn, { from, next });

  return {
    b2b: tableB2B(b2b, siItems),
    b2cl: tableB2CL(b2cl, siItems),
    b2cs: tableB2CS(b2cs, siItems, { homeState, creditDocs: notes.netted, creditItems: srItems }),
    nil: tableNil(b2cs, siItems, homeState),
    cdnr: notes.cdnr,
    cdnur: notes.cdnur,
    hsn_b2b: hsn.hsn_b2b,
    hsn_b2c: hsn.hsn_b2c,
    docs,
    counts: {
      b2b_invoices: b2b.length,
      b2b_recipients: new Set(b2b.map((d) => d.gstin)).size,
      b2cl_invoices: b2cl.length,
      b2cs_invoices: b2cs.length,
      credit_notes: srDocs.length,
      cdnr_notes: new Set(notes.cdnr.map((r) => r.note_number)).size,
      cdnr_recipients: new Set(notes.cdnr.map((r) => r.ctin)).size,
      cdnur_notes: new Set(notes.cdnur.map((r) => r.note_number)).size,
      netted_credit_notes: notes.netted.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whole-return reconciliation: every taxable supply section against the HSN
 * summary, which is the same lines grouped by commodity instead of by
 * counterparty. The two must tie exactly.
 *
 * This replaced a narrower Table 7 ↔ Table 12 check. Once B2B invoices and
 * credit notes are in the return, comparing only the consolidated B2C rows
 * against the whole HSN table compares two different populations and reports a
 * difference on a return that is perfectly correct.
 *
 * 0%-rated lines are excluded from both sides: they are reportable supplies but
 * carry no taxable value to tie on.
 */
function reconcileAll(s) {
  const taxable = (rows) => round2(
    rows.filter((r) => Number(r.rate) > 0).reduce((sum, r) => sum + num(r.taxable_value), 0)
  );
  const supplies = round2(
    taxable(s.b2b) + taxable(s.b2cl) + taxable(s.b2cs) - taxable(s.cdnr) - taxable(s.cdnur)
  );
  const hsn = round2(taxable(s.hsn_b2b) + taxable(s.hsn_b2c));
  return {
    supplies_taxable: supplies,
    hsn_taxable: hsn,
    difference: round2(supplies - hsn),
    matches: Math.abs(supplies - hsn) < 0.01,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Portal JSON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tax heads for one itm_det, in the shape the portal's schema expects.
 *
 * Which heads appear is decided by the DIRECTION of the supply, not by whether
 * the amounts happen to be non-zero: an intra-state line always declares camt
 * and samt, an inter-state line always declares iamt, and a nil-rated line
 * declares its heads at zero rather than leaving them out. Keying off the
 * amount instead would strip the heads off every 0% line and emit an itm_det
 * the portal rejects as missing a mandatory field.
 *
 * @param isIntra place of supply equals the filer's own state
 */
function itmDet(row, isIntra) {
  const det = { txval: round2(row.taxable_value), rt: Number(row.rate) };
  if (isIntra) {
    det.camt = round2(row.cgst || 0);
    det.samt = round2(row.sgst || 0);
  } else {
    det.iamt = round2(row.igst || 0);
  }
  det.csamt = round2(row.cess);
  return det;
}

/** Group flat per-invoice rows into the portal's nested invoice structure. */
function nestInvoices(rows, { keyOf, invoiceOf, homeState }) {
  const groups = new Map();
  for (const r of rows) {
    const gk = keyOf(r);
    if (!groups.has(gk)) groups.set(gk, new Map());
    const invs = groups.get(gk);
    if (!invs.has(r.invoice_number || r.note_number)) {
      invs.set(r.invoice_number || r.note_number, { ...invoiceOf(r), itms: [] });
    }
    const inv = invs.get(r.invoice_number || r.note_number);
    inv.itms.push({
      num: inv.itms.length + 1,
      itm_det: itmDet(r, r.place_of_supply === homeState),
    });
  }
  return groups;
}

/**
 * The GSTR-1 upload payload, in the GSTN offline-utility schema.
 *
 * Empty sections are omitted rather than sent as []. The portal treats an
 * empty array as "this section was declared and is nil", which for a section
 * the business simply does not use is a different claim from staying silent.
 */
function buildPortalJson({ gstin, fp, sections: s, homeState = String(gstin).slice(0, 2) }) {
  const out = { gstin, fp, version: JSON_VERSION, hash: "hash" };

  // ── 4A B2B — nested recipient -> invoice -> rate ──────────────────────────
  if (s.b2b.length) {
    const byCtin = nestInvoices(s.b2b, {
      homeState,
      keyOf: (r) => r.ctin,
      invoiceOf: (r) => ({
        inum: r.invoice_number,
        idt: r.invoice_date,
        val: round2(r.invoice_value),
        pos: r.place_of_supply,
        rchrg: r.reverse_charge,
        inv_typ: r.invoice_type,
      }),
    });
    out.b2b = [...byCtin.entries()].map(([ctin, invs]) => ({
      ctin,
      inv: [...invs.values()],
    }));
  }

  // ── 5 B2CL — nested place of supply -> invoice -> rate ────────────────────
  if (s.b2cl.length) {
    // B2CL is inter-state by definition, so every line declares iamt.
    const byPos = nestInvoices(s.b2cl, {
      homeState,
      keyOf: (r) => r.place_of_supply,
      invoiceOf: (r) => ({
        inum: r.invoice_number,
        idt: r.invoice_date,
        val: round2(r.invoice_value),
      }),
    });
    out.b2cl = [...byPos.entries()].map(([pos, invs]) => ({
      pos,
      inv: [...invs.values()],
    }));
  }

  // ── 7 B2CS — already consolidated, one flat row each ──────────────────────
  if (s.b2cs.length) {
    out.b2cs = s.b2cs.map((r) => {
      const row = {
        sply_ty: r.supply_type,
        rt: Number(r.rate),
        typ: r.type,
        pos: r.place_of_supply,
        txval: round2(r.taxable_value),
      };
      // sply_ty is already the direction, so it decides the heads here.
      if (r.supply_type === "INTRA") {
        row.camt = round2(r.cgst);
        row.samt = round2(r.sgst);
      } else {
        row.iamt = round2(r.igst);
      }
      row.csamt = round2(r.cess);
      return row;
    });
  }

  // ── 9B CDNR ──────────────────────────────────────────────────────────────
  if (s.cdnr.length) {
    const byCtin = nestInvoices(s.cdnr, {
      homeState,
      keyOf: (r) => r.ctin,
      invoiceOf: (r) => ({
        nt_num: r.note_number,
        nt_dt: r.note_date,
        pos: r.place_of_supply,
        rchrg: r.reverse_charge,
        inv_typ: r.note_supply_type,
        ntty: r.note_type,
        val: round2(r.note_value),
      }),
    });
    out.cdnr = [...byCtin.entries()].map(([ctin, notes]) => ({
      ctin,
      nt: [...notes.values()],
    }));
  }

  // ── 9B CDNUR — flat, one entry per note ──────────────────────────────────
  if (s.cdnur.length) {
    const byNote = new Map();
    for (const r of s.cdnur) {
      if (!byNote.has(r.note_number)) {
        byNote.set(r.note_number, {
          typ: r.ur_type,
          ntty: r.note_type,
          nt_num: r.note_number,
          nt_dt: r.note_date,
          pos: r.place_of_supply,
          val: round2(r.note_value),
          itms: [],
        });
      }
      const n = byNote.get(r.note_number);
      // CDNUR only ever holds inter-state notes, so this is always the IGST head.
      n.itms.push({ num: n.itms.length + 1, itm_det: itmDet(r, false) });
    }
    out.cdnur = [...byNote.values()];
  }

  // ── 8 NIL — emitted only when there is something to declare ──────────────
  const nilRows = s.nil.filter((r) => num(r.nil_rated) || num(r.exempted) || num(r.non_gst));
  if (nilRows.length) {
    out.nil = {
      inv: nilRows.map((r) => ({
        sply_ty: r.supply_type,
        expt_amt: round2(r.exempted),
        nil_amt: round2(r.nil_rated),
        ngsup_amt: round2(r.non_gst),
      })),
    };
  }

  // ── 13 Documents issued ──────────────────────────────────────────────────
  if (s.docs.length) {
    const byDoc = new Map();
    for (const d of s.docs) {
      if (!byDoc.has(d.doc_num)) {
        byDoc.set(d.doc_num, { doc_num: d.doc_num, doc_typ: d.document_type, docs: [] });
      }
      const g = byDoc.get(d.doc_num);
      g.docs.push({
        num: g.docs.length + 1,
        from: d.from_no,
        to: d.to_no,
        totnum: d.total_number,
        cancel: d.cancelled,
        net_issue: d.net_issued,
      });
    }
    out.doc_issue = { doc_det: [...byDoc.values()].sort((a, b) => a.doc_num - b.doc_num) };
  }

  // ── 12 HSN ───────────────────────────────────────────────────────────────
  const hsnRow = (r, i) => {
    const row = { num: i + 1 };
    if (r.hsn_code) row.hsn_sc = r.hsn_code;
    row.desc = r.description || "";
    row.uqc = r.uqc || "";
    row.qty = r.total_quantity;
    row.rt = Number(r.rate);
    row.txval = round2(r.taxable_value);
    row.iamt = round2(r.igst);
    row.camt = round2(r.cgst);
    row.samt = round2(r.sgst);
    row.csamt = round2(r.cess);
    return row;
  };
  const hsn = {};
  if (s.hsn_b2b.length) hsn.hsn_b2b = s.hsn_b2b.map(hsnRow);
  if (s.hsn_b2c.length) hsn.hsn_b2c = s.hsn_b2c.map(hsnRow);
  if (hsn.hsn_b2b || hsn.hsn_b2c) out.hsn = hsn;

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL 3 — pre-filing gate. FAIL blocks generation, WARN needs acknowledging.
// ─────────────────────────────────────────────────────────────────────────────
async function runGate(conn, { months, from, next, homeState }) {
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });

  const [filed] = await conn.query(
    "SELECT period FROM gstr1_filing WHERE period IN (?) AND status = 'filed'", [months]
  );
  add("B1 period not already filed", filed.length ? "FAIL" : "PASS",
      filed.length
        ? `already filed: ${filed.map((r) => r.period).join(", ")} — use Table 10 amendments`
        : "open");

  const [hsn] = await conn.query(
    `SELECT COUNT(*) n FROM transaction_items ti
       JOIN \`transaction\` t ON t.id = ti.transaction_id
       JOIN product p ON p.id = ti.product_id
      WHERE ${SI_IN_PERIOD}
        AND (p.hsn_code IS NULL OR p.hsn_code = ''
             OR CHAR_LENGTH(p.hsn_code) NOT IN (4,6,8) OR p.hsn_code REGEXP '[^0-9]')`,
    [from, next]
  );
  add("B2 all sold products have a valid HSN", hsn[0].n ? "FAIL" : "PASS",
      `${hsn[0].n} line(s) without a usable HSN`);

  const [uqc] = await conn.query(
    `SELECT COUNT(*) n FROM transaction_items ti
       JOIN \`transaction\` t ON t.id = ti.transaction_id
       JOIN product p ON p.id = ti.product_id
      WHERE ${SI_IN_PERIOD} AND (p.uqc IS NULL OR p.uqc = '')`,
    [from, next]
  );
  add("B3 all sold products have a UQC", uqc[0].n ? "FAIL" : "PASS",
      `${uqc[0].n} line(s) without a UQC`);

  const [pos] = await conn.query(
    `SELECT COUNT(*) n FROM \`transaction\` t
      WHERE ${SI_IN_PERIOD}
        AND (t.place_of_supply IS NULL OR t.place_of_supply NOT REGEXP '^[0-9]{2}$')`,
    [from, next]
  );
  add("B4 place of supply valid", pos[0].n ? "FAIL" : "PASS",
      `${pos[0].n} bill(s) with a malformed POS`);

  // Intra-state must be CGST+SGST with no IGST, inter-state the reverse.
  // A wrong tax head is one of the most common notice triggers.
  const [head] = await conn.query(
    `SELECT COUNT(*) n FROM transaction_items ti
       JOIN \`transaction\` t ON t.id = ti.transaction_id
      WHERE ${SI_IN_PERIOD}
        AND ((t.place_of_supply = ?  AND ti.IGST > 0)
          OR (t.place_of_supply <> ? AND ti.CGST + ti.SGST > 0))`,
    [from, next, homeState, homeState]
  );
  add("B5 tax head matches place of supply", head[0].n ? "FAIL" : "PASS",
      `${head[0].n} line(s) with the wrong CGST/SGST vs IGST split`);

  const [halves] = await conn.query(
    `SELECT COUNT(*) n FROM transaction_items ti
       JOIN \`transaction\` t ON t.id = ti.transaction_id
      WHERE ${SI_IN_PERIOD} AND ABS(ti.CGST - ti.SGST) > 0.01`,
    [from, next]
  );
  add("B6 CGST equals SGST", halves[0].n ? "FAIL" : "PASS",
      `${halves[0].n} line(s) where the two halves disagree`);

  // B8 (post-supply discount detector) has been retired. It existed because
  // taxable_amount used to hold the PRE-discount line value while tax was
  // charged on a separate gst_base, so the two could disagree and a discount
  // could silently land after GST. taxable_amount is now defined as the
  // post-discount base that tax is charged on, so that state is no longer
  // representable and the check could only ever report "none".

  const [tie] = await conn.query(
    `SELECT COUNT(*) n FROM (
       SELECT t.id FROM \`transaction\` t
         JOIN transaction_items ti ON ti.transaction_id = t.id
        WHERE ${SI_IN_PERIOD}
        GROUP BY t.id, t.taxable_amount
       HAVING ABS(COALESCE(t.taxable_amount,0) - SUM(COALESCE(ti.taxable_amount,0))) > 1.00) h`,
    [from, next]
  );
  add("B9 header ties to line items", tie[0].n ? "FAIL" : "PASS",
      `${tie[0].n} bill(s) where the header total disagrees with its lines`);

  // B11 used to FAIL on any sale to a GSTIN-holder, because this build had no
  // B2B section to put it in. Table 4A is now built, so a registered-customer
  // sale is reported rather than refused. What is still worth surfacing is a
  // MALFORMED GSTIN: 15 characters that do not match the GSTIN pattern cannot
  // go in b2b, so the sale silently drops into B2CS instead.
  const [badGstin] = await conn.query(
    `SELECT COUNT(DISTINCT t.id) n FROM \`transaction\` t
       JOIN customer c ON c.id = t.customer_id
      WHERE ${SI_IN_PERIOD}
        AND COALESCE(c.gstin, '') <> ''
        AND UPPER(TRIM(c.gstin)) NOT REGEXP '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'`,
    [from, next]
  );
  add("B11 customer GSTINs are well-formed", badGstin[0].n ? "FAIL" : "PASS",
      badGstin[0].n
        ? `${badGstin[0].n} sale(s) to a customer whose GSTIN is malformed — these would file as B2C`
        : "every registered customer has a valid GSTIN");

  // Supply type is derived from the rate, so a 0% line reports as nil rated.
  // That is right for a genuinely nil-rated good, and wrong for a taxable good
  // sold on a non-GST bill — the second case is taxable turnover being filed as
  // nil. Nothing in the schema separates them any more, so surface it here.
  const [untaxed] = await conn.query(
    `SELECT COUNT(*) n FROM transaction_items ti
       JOIN \`transaction\` t ON t.id = ti.transaction_id
       JOIN product p ON p.id = ti.product_id
      WHERE ${SI_IN_PERIOD} AND ti.gst_rate = 0 AND COALESCE(p.gstPer, 0) > 0`,
    [from, next]
  );
  add("B12 nothing taxable reported as nil rated", untaxed[0].n ? "WARN" : "PASS",
      untaxed[0].n
        ? `${untaxed[0].n} line(s) at 0% on a product rated above 0% — will file as nil rated`
        : "no taxable goods billed without tax");

  return checks;
}

/**
 * Checks that can only be run once the sections exist. Kept separate from
 * runGate() so the gate stays a cheap pre-flight that does not have to build
 * the whole return first.
 */
function postBuildChecks(sections, recon) {
  const checks = [];
  const negative = sections.b2cs.filter((r) => r.taxable_value < 0);
  checks.push({
    id: "B13 no B2CS row nets below zero",
    status: negative.length ? "WARN" : "PASS",
    detail: negative.length
      ? `${negative.length} POS/rate row(s) where credit notes exceed supplies — the portal rejects a negative B2CS row, raise these as Table 10 amendments instead`
      : "every consolidated row is positive",
  });
  checks.push({
    id: "B14 supplies tie to the HSN summary",
    status: recon.matches ? "PASS" : "FAIL",
    detail: recon.matches
      ? "taxable value agrees across both groupings"
      : `supplies ${recon.supplies_taxable} vs HSN ${recon.hsn_taxable}, off by ${recon.difference}`,
  });
  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gstr1/validate?mode=&period=&fy=&quarter=   — Level 3 gate alone
// ─────────────────────────────────────────────────────────────────────────────
router.get("/gstr1/validate", async (req, res) => {
  // #swagger.tags = ['GSTR-1']
  try {
    const range = resolveRange(req.query);
    const homeState = await getHomeState(pool);
    const checks = await runGate(pool, { ...range, homeState });
    res.json({
      success: true,
      data: {
        period: range.fp,
        range: { mode: range.mode, label: range.label, fp: range.fp, months: range.months },
        can_file: !checks.some((c) => c.status === "FAIL"),
        warnings: checks.filter((c) => c.status === "WARN").length,
        checks,
      },
    });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gstr1/report?mode=monthly&period=MMYYYY[&force=1]
//     GET /api/gstr1/report?mode=quarterly&fy=2026&quarter=1
//     GET /api/gstr1/report?mode=yearly&fy=2026
//
// Refuses to generate while the gate is failing — a wrong return is worse than
// no return. force=1 overrides for inspection, and marks the payload as such.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/gstr1/report", async (req, res) => {
  // #swagger.tags = ['GSTR-1']
  try {
    const range = resolveRange(req.query);
    const homeState = await getHomeState(pool);

    const checks = await runGate(pool, { ...range, homeState });
    const failures = checks.filter((c) => c.status === "FAIL");
    if (failures.length && req.query.force !== "1") {
      return res.status(409).json({
        success: false,
        message: "GSTR-1 cannot be generated while validation is failing",
        data: { period: range.fp, range, checks: failures },
      });
    }

    const sections = await buildSections(pool, { ...range, homeState });
    const recon = reconcileAll(sections);
    const allChecks = [...checks, ...postBuildChecks(sections, recon)];

    const [company] = await pool.query(
      "SELECT name, gstin, state_code FROM company ORDER BY id LIMIT 1"
    );

    res.json({
      success: true,
      data: {
        period: range.fp,
        range: {
          mode: range.mode,
          label: range.label,
          fp: range.fp,
          fy: range.fy,
          months: range.months,
          from: range.from,
          to: range.next,
          portal_filable: range.portal_filable,
        },
        filer: company[0],
        generated_at: new Date().toISOString(),
        unvalidated: failures.length ? true : undefined,
        sections,
        reconciliation: recon,
        checks: allChecks,
      },
    });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gstr1/portal-json?mode=&period=&fy=&quarter=[&force=1]
// The upload payload exactly as the GST portal / offline utility expects it.
// Nothing else is wrapped around it — the response body IS the file.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/gstr1/portal-json", async (req, res) => {
  // #swagger.tags = ['GSTR-1']
  try {
    const range = resolveRange(req.query);
    const homeState = await getHomeState(pool);

    const checks = await runGate(pool, { ...range, homeState });
    const failures = checks.filter((c) => c.status === "FAIL");
    if (failures.length && req.query.force !== "1") {
      return res.status(409).json({
        success: false,
        message: "GSTR-1 JSON cannot be generated while validation is failing",
        data: { period: range.fp, checks: failures },
      });
    }

    const [company] = await pool.query(
      "SELECT gstin FROM company ORDER BY id LIMIT 1"
    );
    const gstin = String(company[0]?.gstin || "").trim().toUpperCase();
    if (!isValidGstin(gstin)) {
      throw Object.assign(
        new Error("company.gstin is not a valid GSTIN — the portal rejects an upload without one. Fix it in Company Master."),
        { status: 400 }
      );
    }

    const sections = await buildSections(pool, { ...range, homeState });
    const payload = buildPortalJson({ gstin, fp: range.fp, sections, homeState });

    // Served as a file so the browser's own download handles it — no blob
    // round-trip, and the filename follows the portal's own convention.
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${gstin}_GSTR1_${range.fp}.json"`
    );
    res.send(JSON.stringify(payload, null, 2));
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/gstr1/file   { period, arn?, notes? }
// Snapshots Table 7 as filed and locks every document in the period.
// The snapshot is what Table 10 later diffs against; without it an amendment
// cannot be computed, because audit_log keeps actions and not figures.
//
// Filing stays MONTHLY whatever the report was viewed at. A quarter is filed
// as three periods, not one, and locking three months behind a single row
// would leave two of them unlockable afterwards.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/gstr1/file", async (req, res) => {
  // #swagger.tags = ['GSTR-1']
  const { period, arn = null, notes = null } = req.body;
  let conn;
  try {
    const range = resolveRange({ mode: "monthly", period });
    const { from, next } = range;
    const homeState = await getHomeState(pool);

    const checks = await runGate(pool, { ...range, homeState });
    if (checks.some((c) => c.status === "FAIL")) {
      return res.status(409).json({
        success: false,
        message: "Cannot mark a period as filed while validation is failing",
        data: { period, checks: checks.filter((c) => c.status === "FAIL") },
      });
    }

    const sections = await buildSections(pool, { ...range, homeState });

    // The checks that need the built return — a negative consolidated row or a
    // broken reconciliation — are only knowable now. The screen refuses to file
    // on these, and so must the API: the HTTP surface is reachable without it.
    const built = postBuildChecks(sections, reconcileAll(sections));
    if (built.some((c) => c.status === "FAIL")) {
      return res.status(409).json({
        success: false,
        message: "Cannot mark a period as filed while validation is failing",
        data: { period, checks: built.filter((c) => c.status === "FAIL") },
      });
    }

    const rows = sections.b2cs;

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO gstr1_filing (period, status, filed_at, filed_by, arn, notes)
       VALUES (?, 'filed', NOW(), ?, ?, ?)`,
      [period, req.user.id, arn, notes]
    );

    for (const r of rows) {
      await conn.query(
        `INSERT INTO gstr1_filed_b2cs
           (period, place_of_supply, gst_rate, taxable_value, igst, cgst, sgst, cess, snapshot_at)
         VALUES (?,?,?,?,?,?,?,?,NOW())`,
        [period, r.place_of_supply, r.rate, r.taxable_value, r.igst, r.cgst, r.sgst, r.cess]
      );
    }

    // Locks these rows against further edits — assertPeriodOpen() in
    // config/gst.js refuses any write to a row carrying a filed_period.
    await conn.query(
      "UPDATE `transaction` SET filed_period = ? WHERE trans_type IN ('SI','SR') AND `date` >= ? AND `date` < ?",
      [period, from, next]
    );

    await conn.commit();
    res.status(201).json({
      success: true,
      message: `GSTR-1 for ${period} marked as filed`,
      data: { period, b2cs_rows: rows.length },
    });
  } catch (e) {
    if (conn) await conn.rollback();
    // The UNIQUE key on gstr1_filing.period is what makes double-filing safe.
    const dup = e.code === "ER_DUP_ENTRY";
    res.status(dup ? 409 : e.status || 500).json({
      success: false,
      message: dup ? `GSTR-1 for ${period} has already been filed` : e.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gstr1/table10?period=MMYYYY   — B2CA amendments
// Today's recomputed Table 7 minus what was actually filed. Only rows that
// moved are emitted; an unchanged period returns nothing, which is correct.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/gstr1/table10", async (req, res) => {
  // #swagger.tags = ['GSTR-1']
  try {
    const period = req.query.period;
    const range = resolveRange({ mode: "monthly", period });
    const homeState = await getHomeState(pool);

    const [filing] = await pool.query(
      "SELECT status, filed_at FROM gstr1_filing WHERE period = ?", [period]
    );
    if (!filing.length || filing[0].status !== "filed") {
      return res.status(400).json({
        success: false,
        message: `GSTR-1 for ${period} has not been filed — there is nothing to amend`,
      });
    }

    const sections = await buildSections(pool, { ...range, homeState });
    const current = sections.b2cs;
    const [filed] = await pool.query(
      `SELECT place_of_supply, gst_rate AS rate, taxable_value, igst, cgst, sgst, cess
         FROM gstr1_filed_b2cs WHERE period = ?`, [period]
    );

    const key = (r) => `${r.place_of_supply}|${Number(r.rate).toFixed(2)}`;
    const filedBy = new Map(filed.map((r) => [key(r), r]));
    const currentBy = new Map(current.map((r) => [key(r), r]));

    const amendments = [];
    for (const k of new Set([...filedBy.keys(), ...currentBy.keys()])) {
      const was = filedBy.get(k);
      const now = currentBy.get(k);
      const d = (f) => round2(num(now?.[f]) - num(was?.[f]));
      const delta = {
        taxable_value: d("taxable_value"), igst: d("igst"),
        cgst: d("cgst"), sgst: d("sgst"), cess: d("cess"),
      };
      if (Object.values(delta).every((v) => v === 0)) continue;

      const [place_of_supply, rate] = k.split("|");
      amendments.push({
        place_of_supply, rate: Number(rate),
        filed: was || null,
        revised: now || null,
        delta,
      });
    }

    res.json({
      success: true,
      data: { period, filed_at: filing[0].filed_at, amendments },
    });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
});

module.exports = router;

// Exported for tests only — not part of the HTTP surface. table13 takes any
// object with a .query(), so it can be exercised against fixture rows.
module.exports._internals = {
  naturalCompare, periodBounds, reconcileAll, table13,
  resolveRange, classify, tableB2CS, tableCreditNotes, buildPortalJson, itmDet,
};
