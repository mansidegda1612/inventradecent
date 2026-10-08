// ═══════════════════════════════════════════════════════════════════════════
// GST rules — LEVEL 2 VALIDATION (see database/migrations/README.md)
//
// Single source of truth for every GST rule the database schema cannot itself
// express. Routes import from here; nothing re-implements a rule locally.
//
// REQUIRES migration Stage 1 to have been applied — this module reads
// company.state_code, gstr1_filing, and writes transaction_items.gst_rate /
// gst_base / IGST / cess. Deploying it against an un-migrated database will
// fail with "unknown column".
// ═══════════════════════════════════════════════════════════════════════════

const pool = require("./db");

// Match the frontend's rounding exactly. Any divergence here shows up as a
// paisa-level mismatch between the printed invoice and the filed return.
// See frontend/src/utils/TransactionUtils.js
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Legal GST slabs. 0.10 / 0.25 / 1.5 / 3 / 7.5 are the bullion, rough-diamond
// and composition rates — kept so the list is a real allow-list rather than a
// four-item guess that rejects a legitimate future product.
const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

// Unit Quantity Codes as the portal spells them. Trimmed to units a fabric
// business plausibly uses; extend rather than bypass.
const UQC_CODES = ["MTR", "PCS", "KGS", "NOS", "SQM", "BOX", "SET", "DOZ"];

/**
 * Supply type is DERIVED from the line's rate, never stored: a rate means
 * taxable, no rate means nil rated.
 *
 * This collapses GSTR-1 Table 8's three columns into one. Exempted and non-GST
 * supplies are not distinguishable from nil-rated without a stored
 * classification, so both report as nil rated. Harmless while the catalogue is
 * entirely 5% — revisit if genuinely exempt or non-GST goods are ever stocked.
 */
const supplyTypeFor = (gstRate) => (Number(gstRate) > 0 ? "taxable" : "nil");

// ─────────────────────────────────────────────────────────────────────────────
// Field-level validators
// ─────────────────────────────────────────────────────────────────────────────

// 4, 6 or 8 digits, numeric only. The 7-digit '5515330' currently on product
// 150003 is exactly what this rejects — a column width cannot express
// "not 5, not 7", which is why this rule lives at Level 2 and not in the DDL.
const isValidHsn = (v) => typeof v === "string" && /^(\d{4}|\d{6}|\d{8})$/.test(v.trim());

const isValidStateCode = (v) => typeof v === "string" && /^\d{2}$/.test(v);

const isValidGstin = (v) =>
  typeof v === "string" &&
  /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/.test(v.trim().toUpperCase());

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

/**
 * Validate the GST-bearing fields of a product payload.
 *
 * HSN and UQC are OPTIONAL here by deliberate choice: blocking a product save
 * over them would stop everyday stock work for a filing concern. They are
 * still mandatory for GSTR-1 Table 12 — that is enforced at the pre-filing
 * gate instead (checks B2 and B3), so a period cannot be filed while it
 * contains a sale of a product missing either. Save freely, file strictly.
 *
 * When supplied, though, they must be well-formed — a malformed HSN is worse
 * than an absent one, because it reaches the portal and gets rejected there.
 *
 * @returns {string[]} human-readable errors; empty array means valid.
 */
function validateProductGst({ hsn_code, uqc, gstPer } = {}) {
  const errors = [];

  if (!isBlank(hsn_code) && !isValidHsn(hsn_code)) {
    errors.push("hsn_code must be 4, 6 or 8 digits (numbers only) when provided");
  }
  if (!isBlank(uqc) && !UQC_CODES.includes(String(uqc).trim())) {
    errors.push(`uqc must be one of: ${UQC_CODES.join(", ")}`);
  }
  if (gstPer !== undefined && gstPer !== null && !GST_RATES.includes(Number(gstPer))) {
    errors.push(`gstPer must be a legal GST rate: ${GST_RATES.join(", ")}`);
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Home state — cached, because it is read on every single bill write.
// 60s TTL so a correction in Company Master takes effect without a restart.
// ─────────────────────────────────────────────────────────────────────────────
let _homeState = null;
let _homeStateAt = 0;
const HOME_STATE_TTL_MS = 60_000;

async function getHomeState(conn = pool) {
  if (_homeState && Date.now() - _homeStateAt < HOME_STATE_TTL_MS) return _homeState;

  const [rows] = await conn.query(
    "SELECT state_code FROM company ORDER BY id LIMIT 1"
  );
  const code = rows[0]?.state_code;
  if (!isValidStateCode(code)) {
    throw new Error(
      "company.state_code is not set. Fill in the company GSTIN in Company Master " +
      "before raising GST bills — place of supply cannot be determined without it."
    );
  }
  _homeState = code;
  _homeStateAt = Date.now();
  return code;
}

// Call after Company Master is edited so the next bill picks it up immediately.
function clearHomeStateCache() {
  _homeState = null;
  _homeStateAt = 0;
}

/**
 * Place of supply for a bill.
 * Registered counterparty -> their GSTIN's state. Cash/walk-in -> home state.
 * An explicit override wins, for the B2C sale shipped out of state.
 */
async function resolvePlaceOfSupply({ conn = pool, customer_id, override } = {}) {
  const homeState = await getHomeState(conn);

  if (override) {
    if (!isValidStateCode(override)) {
      throw Object.assign(
        new Error(`place_of_supply must be a 2-digit state code, got '${override}'`),
        { status: 400 }
      );
    }
    return override;
  }

  // customer_id = 0 is this codebase's marker for a cash/walk-in sale.
  if (!customer_id || Number(customer_id) === 0) return homeState;

  const [rows] = await conn.query("SELECT gstin FROM customer WHERE id = ?", [customer_id]);
  const gstin = rows[0]?.gstin;
  return isValidGstin(gstin) ? gstin.slice(0, 2) : homeState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Line tax resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Work out what to persist for one line item.
 *
 * Two money figures, and the difference between them is the whole point:
 *
 *   item_amount    qty x rate — the line's own value, printed on the invoice.
 *   taxable_amount item_amount after every expense sequenced BEFORE the GST
 *                  line (the discount, normally). This is the value tax is
 *                  charged on and the taxable value GSTR-1 reports.
 *
 * A discount given at the time of supply reduces the value of the supply, so
 * GST is due on the reduced figure. Charging on item_amount and deducting the
 * discount afterwards would overstate tax and leave the bill unreconcilable.
 *
 * The client is the source of truth for taxable_amount, because the
 * discount / GST / roundoff ORDERING lives in the frontend expense sequence and
 * the server cannot see it. But the client is NOT trusted on the arithmetic:
 * whatever base and rate it sends must reproduce the tax it also sent, or the
 * write is rejected. Trust the input, verify the output.
 *
 * The CGST/SGST vs IGST split is decided server-side from the place of supply,
 * never from the client — that decision is what a wrong-head notice is made of.
 *
 * @returns {{gst_rate, item_amount, taxable_amount, CGST, SGST, IGST, cess}}
 * @throws if the client's numbers are internally inconsistent
 */
function resolveLineTax(item, { isGSTBill, productGstPer, isInterState }) {
  // Falls back to qty x rate so an older client that sends neither still
  // behaves, and to taxable_amount when only that is known.
  const item_amount = round2(
    item.item_amount != null
      ? item.item_amount
      : item.taxable_amount != null
        ? item.taxable_amount
        : (Number(item.qty) || 0) * (Number(item.rate) || 0)
  );

  // Nothing before GST in the sequence -> taxable equals the item amount.
  const taxable_amount = round2(
    item.taxable_amount != null ? item.taxable_amount : item_amount
  );

  // A non-GST bill zeroes the rate whatever the product master says.
  const gst_rate = isGSTBill
    ? Number(item.gst_rate ?? productGstPer ?? 0)
    : 0;

  if (!GST_RATES.includes(gst_rate)) {
    throw Object.assign(
      new Error(`illegal GST rate ${gst_rate} on product ${item.product_id}`),
      { status: 400 }
    );
  }

  if (gst_rate === 0) {
    return { item_amount, taxable_amount, gst_rate: 0, CGST: 0, SGST: 0, IGST: 0, cess: 0 };
  }

  const clientTax =
    (Number(item.CGST) || 0) + (Number(item.SGST) || 0) + (Number(item.IGST) || 0);
  const expectedTax = round2((taxable_amount * gst_rate) / 100);

  // 0.10 absorbs the two-halves-each-rounded-separately drift (CGST and SGST
  // are each rounded to 2dp before they are added). Anything larger means the
  // client computed against a different base than it declared.
  if (Math.abs(clientTax - expectedTax) > 0.1) {
    throw Object.assign(
      new Error(
        `tax mismatch on product ${item.product_id}: sent ${clientTax.toFixed(2)}, ` +
        `but ${gst_rate}% of taxable ${taxable_amount.toFixed(2)} is ${expectedTax.toFixed(2)}`
      ),
      { status: 400 }
    );
  }

  if (isInterState) {
    return {
      item_amount, taxable_amount, gst_rate,
      CGST: 0, SGST: 0,
      IGST: round2((taxable_amount * gst_rate) / 100),
      cess: round2(item.cess),
    };
  }

  const half = round2((taxable_amount * gst_rate) / 200);
  return {
    item_amount, taxable_amount, gst_rate,
    CGST: half, SGST: half, IGST: 0,
    cess: round2(item.cess),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Period lock — the amendment boundary
// ─────────────────────────────────────────────────────────────────────────────

/** Date (or date string) -> 'MMYYYY'. */
function toPeriod(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${date}`);
  return String(d.getMonth() + 1).padStart(2, "0") + d.getFullYear();
}

/**
 * Refuse to touch anything inside an already-filed period.
 *
 * Two directions, both of which silently corrupt a filed return today:
 *   - editing or cancelling a row that went out in a filed GSTR-1
 *   - backdating a NEW bill into a month that has already been filed
 *
 * Either one has to become a Table 10 (B2CA) amendment instead of a write.
 *
 * @param existingRow the current `transaction` row, when editing/cancelling
 * @param newDate     the incoming date, when creating or re-dating
 */
async function assertPeriodOpen(conn, { existingRow, newDate } = {}) {
  if (existingRow?.filed_period) {
    throw Object.assign(
      new Error(
        `this bill was filed in GSTR-1 for ${existingRow.filed_period} and cannot be ` +
        `changed directly — raise a Table 10 amendment instead`
      ),
      { status: 409 }
    );
  }

  if (newDate) {
    const period = toPeriod(newDate);
    const [filed] = await conn.query(
      "SELECT period FROM gstr1_filing WHERE period = ? AND status = 'filed'",
      [period]
    );
    if (filed.length) {
      throw Object.assign(
        new Error(
          `GSTR-1 for ${period} has already been filed — a bill cannot be dated into ` +
          `a closed period. Use the current period, or raise a Table 10 amendment.`
        ),
        { status: 409 }
      );
    }
  }
}

module.exports = {
  round2,
  GST_RATES,
  UQC_CODES,
  supplyTypeFor,
  isValidHsn,
  isValidGstin,
  isValidStateCode,
  validateProductGst,
  getHomeState,
  clearHomeStateCache,
  resolvePlaceOfSupply,
  resolveLineTax,
  toPeriod,
  assertPeriodOpen,
};
