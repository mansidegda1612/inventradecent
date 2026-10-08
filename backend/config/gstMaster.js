// ═══════════════════════════════════════════════════════════════════════════
// GST portal master data — the code lists the GSTN offline tool validates against.
//
// These are not business rules (those live in config/gst.js); they are the
// portal's own vocabulary. A GSTR-1 upload is rejected outright if a state
// code, UQC or document-type label does not match this spelling exactly, so
// every label here is copied verbatim from the offline utility rather than
// title-cased from memory.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GST state codes -> the names the portal prints them with.
 * The Excel template writes place of supply as `${code}-${name}`, e.g.
 * "23-Madhya Pradesh". The JSON carries the bare code.
 */
const STATE_NAMES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  // 25 (Daman and Diu) and 26 (Dadra and Nagar Haveli) merged into 26 in 2020.
  // 25 is kept so a historical bill still resolves to a name instead of a blank.
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Before Division)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "96": "Foreign Country",
  "97": "Other Territory",
};

/** '23' -> '23-Madhya Pradesh'. Unknown codes pass through unchanged. */
function posLabel(code) {
  const c = String(code ?? "").padStart(2, "0");
  return STATE_NAMES[c] ? `${c}-${STATE_NAMES[c]}` : String(code ?? "");
}

/**
 * Unit Quantity Codes. The JSON carries the 3-letter code; the Excel template
 * carries `CODE-DESCRIPTION`, e.g. "BAG-BAGS".
 *
 * This is the portal's complete list, not the trimmed allow-list in
 * config/gst.js. Validation decides what may be *entered*; reporting has to be
 * able to render whatever is already stored, including rows that predate the
 * allow-list.
 */
const UQC_LABELS = {
  BAG: "BAGS", BAL: "BALE", BDL: "BUNDLES", BKL: "BUCKLES",
  BOU: "BILLIONS OF UNITS", BOX: "BOX", BTL: "BOTTLES", BUN: "BUNCHES",
  CAN: "CANS", CBM: "CUBIC METERS", CCM: "CUBIC CENTIMETERS", CMS: "CENTIMETERS",
  CTN: "CARTONS", DOZ: "DOZENS", DRM: "DRUMS", GGK: "GREAT GROSS",
  GMS: "GRAMMES", GRS: "GROSS", GYD: "GROSS YARDS", KGS: "KILOGRAMS",
  KLR: "KILOLITRE", KME: "KILOMETRE", LTR: "LITRES", MLT: "MILILITRE",
  MTR: "METERS", MTS: "METRIC TON", NOS: "NUMBERS", PAC: "PACKS",
  PCS: "PIECES", PRS: "PAIRS", QTL: "QUINTAL", ROL: "ROLLS",
  SET: "SETS", SQF: "SQUARE FEET", SQM: "SQUARE METERS", SQY: "SQUARE YARDS",
  TBS: "TABLETS", TGM: "TEN GROSS", THD: "THOUSANDS", TON: "TONNES",
  TUB: "TUBES", UGS: "US GALLONS", UNT: "UNITS", YDS: "YARDS", OTH: "OTHERS",
};

/** 'BAG' -> 'BAG-BAGS'. Blank stays blank — the template leaves the cell empty. */
function uqcLabel(code) {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return "";
  return UQC_LABELS[c] ? `${c}-${UQC_LABELS[c]}` : c;
}

/**
 * Table 13 document natures, keyed by the portal's own `doc_num`.
 * The JSON orders doc_det by this number, so it is the sort key and not a
 * label lookup only.
 */
const DOC_TYPES = {
  1: "Invoices for outward supply",
  2: "Invoices for inward supply from unregistered person",
  3: "Revised Invoice",
  4: "Debit Note",
  5: "Credit Note",
  6: "Receipt Voucher",
  7: "Payment Voucher",
  8: "Refund Voucher",
  9: "Delivery Challan for job work",
  10: "Delivery Challan for supply on approval",
  11: "Delivery Challan in case of liquid gas",
  12: "Delivery Challan in cases other than by way of supply (excluding at S no. 9 to 11)",
};

/**
 * This application's transaction types -> the Table 13 document they consume a
 * number from. Only outward-facing series belong in GSTR-1: purchases (PI/PR)
 * and payments (CP) consume no outward document number, so they are absent
 * rather than mapped to 0.
 */
const TRANS_TYPE_DOC_NUM = {
  SI: 1,  // sales invoice
  SR: 5,  // sales return -> credit note
  CR: 6,  // cash/bank receipt -> receipt voucher
};

module.exports = {
  STATE_NAMES,
  posLabel,
  UQC_LABELS,
  uqcLabel,
  DOC_TYPES,
  TRANS_TYPE_DOC_NUM,
};
