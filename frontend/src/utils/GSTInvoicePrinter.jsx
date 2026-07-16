// ─────────────────────────────────────────────────────────────────────────────
// GSTInvoicePrinter.js
// Reusable GST Invoice generator — supports Sales (SI) and Purchase (PI).
// Usage:
//   import { GSTInvoicePrinter } from "./GSTInvoicePrinter";
//   GSTInvoicePrinter.print(transactionData, "SI");                 // Sales Invoice — fetches company from GET /company
//   GSTInvoicePrinter.print(transactionData, "PI");                 // Purchase Invoice
//   GSTInvoicePrinter.print(transactionData, "SI", companyOverride); // optional 3rd arg still overrides everything, skips the API call
//
//   // NEW: get a real PDF Blob (for WhatsApp share, download, upload, etc.)
//   const pdfBlob = await GSTInvoicePrinter.getPDFBlob(transactionData, "SI");
//
// transactionData shape (mirrors what SaleEntry / PurchaseEntry already has):
// {
//   bill_no, date, cash_debit,
//   customer_name, customer_gstin, customer_address, customer_phone,
//   place_of_supply,
//   isGSTBill,
//   items: [{ name, hsn_code, qty, rate, taxable_amount, CGST, SGST, cgst_pct, sgst_pct }],
//   expenses: [{ label, amount }],   // e.g. Discount, Round Off
//   final_amount,
// }
//
// companyOverride shape (optional 3rd arg to print()/getHTML()/getPDFBlob() —
// pass whatever your backend returns; anything you omit falls back to the
// default below):
// {
//   name, tagline, address, city, phone, email, web, pan, gstin,
//   logo: "https://.../logo.png",          // company logo — plain image URL
//   bank: {
//     name, branch, acc_number, ifsc,
//     upi_id: "someone@bank",              // used to build the real UPI QR code
//     account_holder                        // shown as "Payee Name" in UPI QR
//   },
//   terms: ["...", "..."]
// }
//
// PDF GENERATION NOTES:
//   getPDFBlob() renders the same invoice markup off-screen (position:fixed,
//   way off viewport) and rasterizes it with html2pdf.js. This needs the
//   "html2pdf.js" package installed (bundles html2canvas + jsPDF, no backend
//   / server-side render step required):
//     npm install html2pdf.js
//   The QR code and logo are loaded as <img> from external URLs — html2canvas
//   needs those to either be same-origin or served with CORS headers, or the
//   canvas gets "tainted" and that image silently comes out blank in the PDF.
//   api.qrserver.com sends CORS headers so the QR is fine; if you swap in a
//   different QR/logo host later, make sure it does too.
//
//   LAYOUT NOTE (fixed): the two-column sections (.info-grid, .bottom-grid,
//   .bank-sign-grid) previously used CSS Grid with default stretch behavior.
//   html2canvas has unreliable support for CSS Grid track-height calculation,
//   which showed up as the "Bank Details" cell being stretched vertically in
//   the generated PDF (it doesn't happen in the live browser print dialog,
//   only in the offscreen html2canvas render used for getPDFBlob/WhatsApp).
//   These sections now use flexbox instead of grid — visually identical in a
//   normal browser, but rendered consistently by html2canvas.
// ─────────────────────────────────────────────────────────────────────────────

// Adjust this import path to wherever callAPI lives in your project (same
// helper used everywhere else — GET/POST/PUT via fetch + Bearer token).
import { callAPI ,resolveAssetUrl } from "../utils/callserver";

// ── Company Config ────────────────────────────────────────────────────────────
// DEFAULT_COMPANY is now only a FALLBACK — used if the API call fails (e.g.
// offline printing, or the backend isn't reachable) or for any individual
// field the company-settings table doesn't have filled in yet. Real data
// comes from GET /company (see fetchCompanyFromApi below).
const DEFAULT_COMPANY = {
  name: "InventraDecent",
  tagline: "Inventory · Billing · Accounting",
  address: "Plot No A 64, Road No 21, Waghle Indl Estate",
  city: "Rajkot, Gujarat - 360001",
  phone: "02225820309",
  email: "info@inventradecent.com",
  web: "www.inventradecent.com",
  pan: "ABCDE1234F",
  gstin: "24ABCDE1234F1Z5",
  // Plain image URL. Leave blank/undefined to fall back to an initials badge.
  logo: "",
  bank: {
    name: "HDFC Bank",
    branch: "Rajkot Main",
    acc_number: "00112345678901",
    ifsc: "HDFC0001234",
    upi_id: "darshitbhaliya0@okicici",
    account_holder: "InventraDecent",
  },
  terms: [
    "Subject to Rajkot Jurisdiction.",
    "Our Responsibility Ceases as soon as goods leaves our Premises.",
    "Goods once sold will not taken back.",
    "Delivery Ex-Premises.",
  ],
};


// ── map backend `company` row -> the nested shape this file uses ───────────
// The company table (routes/company.js) is flat (bank_name, bank_ifsc, ...);
// this file's templates expect a nested `bank: {...}` object, and `logo`
// instead of `logo_url`. This is the only place that mapping happens.
function mapCompanyRow(row) {
  if (!row) return {};
  return {
    name: row.name,
    tagline: row.tagline,
    address: row.address,
    city: row.city,
    phone: row.phone,
    email: row.email,
    web: row.web,
    pan: row.pan,
    gstin: row.gstin,
    logo: resolveAssetUrl(row.logo_url),
    bank: {
      name: row.bank_name,
      branch: row.bank_branch,
      acc_number: row.bank_acc_number,
      ifsc: row.bank_ifsc,
      upi_id: row.upi_id,
      account_holder: row.account_holder,
    },
    terms: Array.isArray(row.terms) && row.terms.length ? row.terms : undefined,
  };
}

// Drop null/undefined/"" keys so a shallow merge with DEFAULT_COMPANY never
// overwrites a good default with a blank DB field.
function stripEmpty(obj) {
  return Object.fromEntries(
    Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined && v !== "")
  );
}

// Cached for the session so printing 10 invoices in a row doesn't re-fetch
// company details 10 times. Cleared by invalidateCompanyCache() — call that
// after saving Company Settings so the very next print picks up changes
// without needing a full page reload.
let cachedCompanyRow = null;

async function fetchCompanyFromApi() {
  if (cachedCompanyRow) return cachedCompanyRow;
  try {
    const res = await callAPI("company", "GET");
    if (res?.success && res.data) {
      cachedCompanyRow = res.data;
      return cachedCompanyRow;
    }
  } catch (err) {
    console.warn("GSTInvoicePrinter: could not fetch company details, using defaults:", err);
  }
  return null;
}

export function invalidateCompanyCache() {
  cachedCompanyRow = null;
}

async function getCompanyConfig(override) {
  // Explicit override always wins (e.g. a test/preview call) and skips the
  // network call entirely.
  const row = override ? null : await fetchCompanyFromApi();
  const source = override ? override : mapCompanyRow(row);

  const merged = {  ...stripEmpty(source) };
  merged.bank = {  ...stripEmpty(source.bank) };
  return merged;
}

// ── Number to Words (INR) ─────────────────────────────────────────────────────
function numberToWords(amount) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
    "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty",
    "Sixty", "Seventy", "Eighty", "Ninety"];

  function convert(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + " " + ones[n % 10] + " ";
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred " + convert(n % 100);
    if (n < 100000) return convert(Math.floor(n / 1000)) + "Thousand " + convert(n % 1000);
    if (n < 10000000) return convert(Math.floor(n / 100000)) + "Lakh " + convert(n % 100000);
    return convert(Math.floor(n / 10000000)) + "Crore " + convert(n % 10000000);
  }

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = convert(rupees).trim();
  if (words === "") words = "Zero";
  words += " Rupees";
  if (paise > 0) words += " and " + convert(paise).trim() + " Paise";
  words += " Only";
  return words.toUpperCase();
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmt2(n) {
  return parseFloat(n || 0).toFixed(2);
}
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ── Logo (image, provided by company config; falls back to initials) ────────
function logoHTML(company) {
  const initial = escapeHtml((company.name || "?").trim().charAt(0).toUpperCase());
  if (company.logo) {
    // onerror swaps to an initials badge if the URL fails to load (e.g. offline print)
    return `
    <img class="inv-logo-img" src="${escapeHtml(company.logo)}" alt="${escapeHtml(company.name)} logo" crossorigin="anonymous"
      onerror="this.outerHTML='<div class=&quot;inv-logo-fallback&quot;>${initial}</div>'"/>`;
  }
  return `<div class="inv-logo-fallback">${initial}</div>`;
}

// ── Real, scannable UPI QR code for the final bill amount ────────────────────
// Uses the standard UPI deep-link format (pa/pn/am/cu/tn) and renders it through
// a public QR image endpoint — no client-side QR library/build-step dependency.
// Swap QR_ENDPOINT for a self-hosted generator later if offline printing matters.
function buildUpiQR(company, data, finalAmount) {
  const upiId = company?.bank?.upi_id;
  if (!upiId) {
    return `<div class="qr-box qr-box--empty">UPI ID not<br/>configured</div>`;
  }
  const payeeName = company.bank.account_holder || company.name || "Payee";
  const note = `Invoice ${data.bill_no || ""}`.trim();

  const upiUri =
    `upi://pay?pa=${encodeURIComponent(upiId)}` +
    `&pn=${encodeURIComponent(payeeName)}` +
    `&am=${encodeURIComponent(fmt2(finalAmount))}` +
    `&cu=INR` +
    `&tn=${encodeURIComponent(note)}`;

  const QR_ENDPOINT = "https://api.qrserver.com/v1/create-qr-code/";
  const qrImgSrc = `${QR_ENDPOINT}?size=140x140&margin=2&data=${encodeURIComponent(upiUri)}`;

  return `
    <img class="qr-box" src="${qrImgSrc}" width="76" height="76" alt="UPI QR code" crossorigin="anonymous"
      onerror="this.outerHTML='<div class=&quot;qr-box qr-box--empty&quot;>QR unavailable<br/>(offline)</div>'"/>`;
}

// ── Stylesheet (shared by the print iframe AND the offscreen PDF render) ────
function buildInvoiceStyle() {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --accent: #2f6690;        /* primary brand blue — used sparingly */
    --accent-dark: #1f4258;   /* headings / emphasis text */
    --text: #262626;
    --text-muted: #6b6b6b;
    --border: #d7dbe0;        /* one consistent border color, one weight (1px) everywhere */
    --bg-soft: #f4f6f8;       /* light section backgrounds instead of solid dark blocks */
    --bg-accent: #e4edf3;     /* light themed tint for header/total rows — dark text stays readable */
  }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: var(--text);
    background: #fff;
  }

  .page {
    width: 210mm;
    margin: 0 auto;
    padding: 8mm 10mm;
    background: #fff;
  }

  /* ── Header ── */
  .inv-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid var(--accent);
    padding-bottom: 6px;
    margin-bottom: 6px;
    gap: 12px;
  }
  .inv-header-left { flex: 1; }
  .company-name {
    font-size: 20px;
    font-weight: 700;
    color: var(--accent-dark);
    letter-spacing: -0.3px;
    line-height: 1.15;
  }
  .company-tagline {
    font-size: 9.5px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 0.6px;
    margin: 2px 0 4px;
  }
  .company-addr { font-size: 10px; color: var(--text-muted); line-height: 1.5; }
  .company-contact { font-size: 10px; color: var(--text-muted); text-align: right; line-height: 1.7; white-space: nowrap; }

  .inv-logo-img {
    width: 64px; height: 64px; object-fit: contain; flex-shrink: 0;
  }
  .inv-logo-fallback {
    width: 64px; height: 64px; flex-shrink: 0;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font-size: 26px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── PAN + Title banner ── */
  .pan-title-row {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    background: var(--bg-soft);
    padding: 4px 8px;
    gap: 12px;
  }
  .pan-box { font-size: 10.5px; font-weight: 700; color: var(--accent-dark); flex: 1; }
  .invoice-title-center {
    flex: 1;
    text-align: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--accent-dark);
    letter-spacing: 1px;
  }
  .original-tag { flex: 1; text-align: right; font-size: 9px; font-weight: 600; color: var(--text-muted); }

  /* ── Info grid ── */
  /* NOTE: switched from CSS Grid to Flexbox. html2canvas (used by html2pdf.js
     for getPDFBlob) has unreliable CSS Grid track-height support, which was
     causing stretched/mis-sized cells in the generated PDF only (not in the
     live browser print dialog). Flex renders identically in-browser and is
     handled correctly by html2canvas. */
  .info-grid {
    display: flex;
    align-items: flex-start;
    border: 1px solid var(--border);
    border-top: none;
  }
  .info-grid > div { flex: 1 1 0; min-width: 0; }
  .info-cell {
    padding: 5px 7px;
    border-right: 1px solid var(--border);
    line-height: 1.7;
  }
  .info-grid > div:last-child .info-cell,
  .info-grid > div:last-child { border-right: none; }
  .info-cell-title {
    font-size: 9px;
    font-weight: 700;
    color: var(--accent-dark);
    background: var(--bg-soft);
    padding: 3px 7px;
    letter-spacing: 0.4px;
    border-bottom: 1px solid var(--border);
  }
  .info-lbl { color: var(--text-muted); font-weight: 600; display: inline-block; min-width: 72px; }

  /* ── Items table ── */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
    border: 1px solid var(--border);
    border-top: none;
  }
  .items-table th {
    background: var(--bg-accent);
    color: var(--accent-dark);   /* dark themed text, not light/white */
    padding: 4px 4px;
    font-size: 9.5px;
    font-weight: 700;
    border: 1px solid var(--border);
    text-align: center;
  }
  .items-table th.tl { text-align: left; }
  .items-table td {
    border: 1px solid var(--border);
    padding: 3px 4px;
    vertical-align: top;
  }
  .items-table .blank-row td { height: 12px; }
  .items-table .amt-strong { font-weight: 700; }
  .items-table tfoot td {
    border: 1px solid var(--border);
    padding: 4px 4px;
    font-weight: 700;
    background: var(--bg-soft);
  }
  .tc { text-align: center; }
  .tr { text-align: right; }
  .tl { text-align: left; }

  /* ── Bottom section ── */
  /* Same html2canvas-grid fix as .info-grid above. */
  .bottom-grid {
    display: flex;
    align-items: flex-start;
    border: 1px solid var(--border);
    border-top: none;   /* sits directly under items-table; no doubled border */
  }
  .bottom-left { flex: 1 1 0; min-width: 0; border-right: 1px solid var(--border); padding: 6px 7px; }
  .bottom-right { flex: 1 1 0; min-width: 0; padding: 6px 7px; }

  /* Same html2canvas table-in-flex fix as .bank-row above — .bottom-right
     is a flex item, so this is plain divs instead of a <table>. */
  .summary-table { width: 100%; font-size: 10.5px; }
  .summary-row { display: flex; justify-content: space-between; padding: 2px 4px; }
  .summary-row.final-row {
    background: var(--bg-accent);
    color: var(--accent-dark);   /* dark themed text, not light/white */
    font-size: 12px;
    font-weight: 700;
    padding: 5px 4px;
    border-top: 1px solid var(--accent);
  }

  .words-box {
    font-size: 10px;
    font-weight: 600;
    color: var(--accent-dark);
    background: var(--bg-soft);
    border: 1px solid var(--border);
    padding: 6px 7px;
    line-height: 1.4;
  }
  .words-box .words-label { font-size: 9px; font-weight: 600; color: var(--text-muted); margin-bottom: 2px; }

  /* ── Bank + QR + Signatory ── */
  /* Same html2canvas-grid fix as .info-grid above — this is the section that
     was visibly stretching vertically in the WhatsApp/PDF output. */
  .bank-sign-grid {
    display: flex;
    align-items: flex-start;
    border: 1px solid var(--border);
    border-top: none;
  }
  .bank-cell {
    flex: 1 1 0;
    min-width: 0;
    border-right: 1px solid var(--border);
    padding: 6px 7px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .bank-details { flex: 1; }
  .bank-title, .terms-title {
    font-size: 9px;
    font-weight: 700;
    color: var(--accent-dark);
    letter-spacing: 0.4px;
    margin-bottom: 4px;
  }
  /* NOTE: bank rows are plain flex divs, NOT a <table>. html2canvas has a
     separate bug (distinct from the grid issue fixed above) where a
     <table> that is itself nested inside a flex item gets its row heights
     wildly over-expanded during rasterization — that's what was causing
     the huge gaps between Name/Branch/Acc/IFSC/UPI rows in the generated
     PDF, even though the exact same markup looked fine in a live browser
     tab. Divs instead of a table sidesteps that bug entirely. */
  .bank-row {
    display: flex;
    font-size: 10px;
    line-height: 1.7;
  }
  .bank-row .bank-lbl {
    color: var(--text-muted);
    width: 78px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .bank-row .bank-val { flex: 1; min-width: 0; }

  .qr-col { text-align: center; flex-shrink: 0; width: 84px; }
  .qr-box {
    width: 76px; height: 76px;
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 3px;
  }
  .qr-box--empty { font-size: 8px; color: var(--text-muted); text-align: center; padding: 4px; }
  .upi-label { font-size: 9px; font-weight: 600; color: var(--accent-dark); }

  /* ── Terms ── */
  .terms-section {
    /* No border here — .bank-sign-grid already draws the outer border for
       this whole row; adding one here doubled up on the right/bottom edges. */
    flex: 1 1 0;
    min-width: 0;
    padding: 6px 7px;
  }
  .terms-section ul { padding-left: 14px; }
  .terms-section li { font-size: 9px; color: var(--text-muted); line-height: 1.6; }

  .thankyou {
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent-dark);
    margin-top: 8px;
    padding: 4px;
    border-top: 1px solid var(--border);
  }

  /* ── Print overrides ── */
  @media print {
    body { background: #fff !important; }
    .page { padding: 6mm 8mm; margin: 0; }
    @page { size: A4; margin: 0; }

    .bank-sign-grid  { page-break-inside: avoid; }
    .terms-section   { page-break-inside: avoid; }
    .bottom-grid     { page-break-inside: avoid; }
    .thankyou        { page-break-inside: avoid; page-break-before: avoid; }
  }
  `;
}

// ── Just the invoice markup (the .page div) — shared by print + PDF ─────────
// Pulled out of buildInvoiceHTML() so getPDFBlob() can render it into an
// offscreen container without needing a full <html><head> document.
function buildInvoicePageHTML(data, type, company) {
  const isGST = data.isGSTBill;
  const isSale = type === "SI";
  const invoiceTitle = isGST ? "TAX INVOICE" : "INVOICE";
  const partyLabel = isSale ? "Customer Detail" : "Supplier Detail";

  // ── Totals ────────────────────────────────────────────────────────────────
  const taxableTotal = (data.items || []).reduce((s, i) => s + parseFloat(i.taxable_amount || 0), 0);
  const cgstTotal = (data.items || []).reduce((s, i) => s + parseFloat(i.CGST || 0), 0);
  const sgstTotal = (data.items || []).reduce((s, i) => s + parseFloat(i.SGST || 0), 0);
  const finalAmount = parseFloat(data.final_amount || 0);

  const expenseLines = (data.expenses || [])
    .filter(e => e.key !== "roundoff" && parseFloat(e.amount || 0) !== 0)
    .map(e => ({ label: e.label || e.key, amount: parseFloat(e.amount || 0) }));
  const roundoffAmt = parseFloat(data.roundoff || 0);

  // ── Items rows ────────────────────────────────────────────────────────────
  const MIN_ROWS = 8;
  const itemRows = (data.items || []).map((item, idx) => {
    const total = parseFloat(item.taxable_amount || 0)
      + parseFloat(item.CGST || 0)
      + parseFloat(item.SGST || 0);
    return `
    <tr>
      <td class="tr">${idx + 1}</td>
      <td>${escapeHtml(item.name)}</td>
      <td class="tr">${escapeHtml(item.hsn_code)}</td>
      <td class="tr">${item.qty}</td>
      <td class="tr">${fmt2(item.rate)}</td>
      <td class="tr">${fmt2(item.taxable_amount)}</td>
      ${isGST ? `
      <td class="tr">${fmt2(item.cgst_pct)}%</td>
      <td class="tr">${fmt2(item.CGST)}</td>
      <td class="tr">${fmt2(item.sgst_pct)}%</td>
      <td class="tr">${fmt2(item.SGST)}</td>
      ` : ""}
      <td class="tr amt-strong">${fmt2(total)}</td>
    </tr>`;
  });

  const blankRows = Math.max(0, MIN_ROWS - (data.items || []).length);
  for (let i = 0; i < blankRows; i++) {
    itemRows.push(`
    <tr class="blank-row">
      <td></td><td></td><td></td><td></td><td></td><td></td>
      ${isGST ? "<td></td><td></td><td></td><td></td>" : ""}
      <td></td>
    </tr>`);
  }

  // ── Summary right column ──────────────────────────────────────────────────
  const summaryRows = [];
  summaryRows.push(`<div class="summary-row"><span>Taxable Amount</span><span>${fmt2(taxableTotal)}</span></div>`);
  if (isGST) {
    summaryRows.push(`<div class="summary-row"><span>Add: CGST</span><span>${fmt2(cgstTotal)}</span></div>`);
    summaryRows.push(`<div class="summary-row"><span>Add: SGST</span><span>${fmt2(sgstTotal)}</span></div>`);
  }
  expenseLines.forEach(e => {
    const sign = e.amount < 0 ? "" : e.amount > 0 && e.label.toLowerCase().includes("discount") ? "- " : "+ ";
    summaryRows.push(`<div class="summary-row"><span>${escapeHtml(e.label)}</span><span>${sign}${fmt2(Math.abs(e.amount))}</span></div>`);
  });
  if (roundoffAmt !== 0) {
    summaryRows.push(`<div class="summary-row"><span>Round Off</span><span>${roundoffAmt > 0 ? "+" : ""}${fmt2(roundoffAmt)}</span></div>`);
  }
  summaryRows.push(`
    <div class="summary-row final-row">
      <span>Total Amount After Tax</span>
      <span>&#8377;${fmt2(finalAmount)}</span>
    </div>`);

  return `
<div class="page">

  <!-- ── HEADER ── -->
  <div class="inv-header">
    <div class="inv-header-left">
      <div class="company-name">${escapeHtml(company.name)}</div>
      <div class="company-tagline">${escapeHtml(company.tagline)}</div>
      <div class="company-addr">
        ${escapeHtml(company.address)}<br/>
        ${escapeHtml(company.city)}
      </div>
    </div>
    <div class="company-contact">
      Tel : ${escapeHtml(company.phone)}<br/>
      Web : ${escapeHtml(company.web)}<br/>
      Email : ${escapeHtml(company.email)}
    </div>
    ${logoHTML(company)}
  </div>

  <!-- ── PAN + TITLE ── -->
  <div class="pan-title-row">
    <div class="pan-box">GSTIN : ${escapeHtml(company.gstin)}</div>   
    <div class="invoice-title-center">${invoiceTitle}</div>
    <div class="original-tag">ORIGINAL FOR RECIPIENT</div>
  </div>

  <!-- ── PARTY + INVOICE INFO ── -->
  <div class="info-grid">
    <div>
      <div class="info-cell-title">${partyLabel}</div>
      <div class="info-cell">
        <div><span class="info-lbl">Name</span> ${escapeHtml(data.customer_name || data.customer_name_cash || "—")}</div>
        <div><span class="info-lbl">Phone</span> ${escapeHtml(data.contact_no || "—")}</div>
        <div><span class="info-lbl">GSTIN</span> ${escapeHtml(data.gstin || "—")}</div>
        <div><span class="info-lbl">City</span> ${escapeHtml(data.city || "—")}</div>
      </div>
    </div>
    <div>
      <div class="info-cell-title">Invoice Detail</div>
      <div class="info-cell">
        <div><span class="info-lbl">Invoice No</span> ${escapeHtml(data.bill_no || "—")}</div>
        <div><span class="info-lbl">Invoice Date</span> ${fmtDate(data.date)}</div>
        <div><span class="info-lbl">Type</span> ${data.cash_debit === "C" ? "Cash" : "Debit"}</div>
      </div>
    </div>
  </div>

  <!-- ── ITEMS TABLE ── -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:28px">Sr.</th>
        <th class="tl">Name of Product / Service</th>
        <th style="width:50px">HSN/SAC</th>
        <th style="width:32px">Qty</th>
        <th style="width:52px">Rate</th>
        <th style="width:60px">Taxable Value</th>
        ${isGST ? `
        <th style="width:30px">CGST %</th>
        <th style="width:48px">CGST Amt</th>
        <th style="width:30px">SGST %</th>
        <th style="width:48px">SGST Amt</th>
        ` : ""}
        <th style="width:60px">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows.join("")}
    </tbody>
    <tfoot>
      <tr>
        <td></td>
        <td class="tr">Total</td>
        <td></td>
        <td class="tr">${(data.items || []).reduce((s, i) => s + parseFloat(i.qty || 0), 0)}</td>
        <td></td>
        <td class="tr">${fmt2(taxableTotal)}</td>
        ${isGST ? `
        <td></td>
        <td class="tr">${fmt2(cgstTotal)}</td>
        <td></td>
        <td class="tr">${fmt2(sgstTotal)}</td>
        ` : ""}
        <td class="tr">${fmt2(
    (data.items || []).reduce(
      (s, i) =>
        s +
        parseFloat(i.taxable_amount || 0) +
        parseFloat(i.CGST || 0) +
        parseFloat(i.SGST || 0),
      0
    )
  )}</td>
      </tr>
    </tfoot>
  </table>

  <!-- ── BOTTOM: Total in words + Summary ── -->
  <div class="bottom-grid">
    <div class="bottom-left">
      <div class="words-box">
        <div class="words-label">Total in words</div>
        ${numberToWords(finalAmount)}
      </div>
    </div>
    <div class="bottom-right">
      <div class="summary-table">
        ${summaryRows.join("")}
      </div>
    </div>
  </div>

  <!-- ── BANK DETAILS + QR + TERMS ── -->
  <div class="bank-sign-grid">
    <div class="bank-cell">
      <div class="bank-details">
        <div class="bank-title">Bank Details</div>
        <div class="bank-row"><span class="bank-lbl">Name</span><span class="bank-val">${escapeHtml(company.bank.name)}</span></div>
        <div class="bank-row"><span class="bank-lbl">Branch</span><span class="bank-val">${escapeHtml(company.bank.branch)}</span></div>
        <div class="bank-row"><span class="bank-lbl">Acc. Number</span><span class="bank-val">${escapeHtml(company.bank.acc_number)}</span></div>
        <div class="bank-row"><span class="bank-lbl">IFSC</span><span class="bank-val">${escapeHtml(company.bank.ifsc)}</span></div>
        <div class="bank-row"><span class="bank-lbl">UPI ID</span><span class="bank-val">${escapeHtml(company.bank.upi_id || "—")}</span></div>
      </div>
      <div class="qr-col">
        ${buildUpiQR(company, data, finalAmount)}
        <div class="upi-label">Scan &amp; Pay ₹${fmt2(finalAmount)}</div>
      </div>
    </div>

    <!-- ── TERMS & CONDITIONS ── -->
    <div class="terms-section">
      <div class="terms-title">Terms and Conditions</div>
      <ul>
        ${(company.terms || []).map(t => `<li>${escapeHtml(t)}</li>`).join("")}
        <li>Customer Signature ___________________________</li>
      </ul>
    </div>
  </div>

  <div class="thankyou">Thank you for shopping with us!</div>

</div>`;
}

// ── Build full HTML document for the invoice (print iframe) ─────────────────
function buildInvoiceHTML(data, type, company) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${(data.isGSTBill ? "TAX INVOICE" : "INVOICE")} - ${escapeHtml(data.bill_no)}</title>
<style>${buildInvoiceStyle()}</style>
</head>
<body>
${buildInvoicePageHTML(data, type, company)}
</body>
</html>`;
}

// ── Render the invoice markup into an offscreen element for rasterizing ─────
// Used only by getPDFBlob(). Kept off-screen (not display:none — html2canvas
// can't measure/capture elements that aren't actually laid out) so it never
// flashes on screen for the user.
async function renderOffscreen(pageHTML, styleCss) {
  const container = document.createElement("div");
  container.id = "__gst_invoice_pdf_render__";
  container.style.cssText =
    "position:fixed;top:0;left:-99999px;width:210mm;background:#fff;z-index:-1;";

  const styleEl = document.createElement("style");
  styleEl.textContent = styleCss;
  container.appendChild(styleEl);
  container.insertAdjacentHTML("beforeend", pageHTML);
  document.body.appendChild(container);

  // Wait for the logo + QR <img> tags to actually finish loading — otherwise
  // html2canvas can capture the page before they've arrived and they come
  // out blank in the PDF.
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve; // don't hang the PDF if one image 404s
          })
    )
  );

  return container;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export class GSTInvoicePrinter {
  /**
   * Open browser print dialog for a GST invoice.
   * @param {object} transactionData  — Full transaction object from API / form state
   * @param {"SI"|"PI"} type          — "SI" = Sales Invoice, "PI" = Purchase Invoice
   * @param {object} [companyOverride] — Company/bank/logo data from your backend.
   *                                     Omit to use the built-in defaults.
   */
  static async print(transactionData, type = "SI", companyOverride = null) {
    // Mobile browsers (esp. Android Chrome / in-app WebViews) frequently fail
    // to rasterize a hidden 0x0 iframe when their "Save as PDF" print pipeline
    // runs — instead of the iframe's invoice markup, they end up capturing
    // whatever is visibly behind it (the underlying page, e.g. the bill list).
    // Desktop print dialogs don't have this problem, so we only special-case
    // mobile: generate a real PDF via html2pdf and hand the user that file
    // directly, bypassing the OS print pipeline entirely.
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");

    if (isMobile) {
      try {
        await this._printOnMobile(transactionData, type, companyOverride);
        return;
      } catch (err) {
        console.error("Mobile PDF generation failed, falling back to print dialog:", err);
        // fall through to the iframe approach below as a last resort
      }
    }

    const company = await getCompanyConfig(companyOverride);
    const html = buildInvoiceHTML(transactionData, type, company);
    this._printViaIframe(html);
  }

  /**
   * Desktop/fallback path: hidden iframe + window.print().
   */
  static _printViaIframe(html) {
    // Remove any leftover iframe from a previous print call
    const existing = document.getElementById("__gst_invoice_frame__");
    if (existing) existing.remove();

    // Create a hidden iframe, write the invoice HTML into it, then print
    const iframe = document.createElement("iframe");
    iframe.id = "__gst_invoice_frame__";
    iframe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;";
    document.body.appendChild(iframe);

    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    // Wait for iframe content to fully load before triggering print
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      // Clean up the iframe after the print dialog closes
      iframe.contentWindow.onafterprint = () => iframe.remove();
    };
  }

  /**
   * Mobile path: build an actual PDF Blob (html2pdf, off-screen render — same
   * as getPDFBlob) and open it in a new tab so the mobile browser's built-in
   * PDF viewer shows the *real* invoice, with its own working Save/Share
   * buttons. Falls back to a direct download link if the popup is blocked.
   */
  static async _printOnMobile(transactionData, type, companyOverride) {
    const blob = await this.getPDFBlob(transactionData, type, companyOverride);
    const blobUrl = URL.createObjectURL(blob);
    const filename = `${transactionData.bill_no || "invoice"}.pdf`;

    const win = window.open(blobUrl, "_blank");
    if (!win) {
      // Popup blocked — force a direct download instead.
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    // Give the new tab/download time to actually read the blob before revoking.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  }

  /**
   * Get the raw HTML string (useful for preview or server-side PDF generation).
   * @param {object} transactionData
   * @param {"SI"|"PI"} type
   * @param {object} [companyOverride]
   * @returns {Promise<string>}
   */
  static async getHTML(transactionData, type = "SI", companyOverride = null) {
    const company = await getCompanyConfig(companyOverride);
    return buildInvoiceHTML(transactionData, type, company);
  }

  /**
   * Render the invoice to an actual PDF Blob, client-side — for WhatsApp
   * share (pdfBlob param of sendWhatsApp), direct download, or upload.
   * Requires: npm install html2pdf.js
   *
   * @param {object} transactionData
   * @param {"SI"|"PI"} type
   * @param {object} [companyOverride]
   * @returns {Promise<Blob>} a "application/pdf" Blob
   */
  static async getPDFBlob(transactionData, type = "SI", companyOverride = null) {
    const html2pdf = (await import("html2pdf.js")).default;
    const company = await getCompanyConfig(companyOverride);

    const pageHTML = buildInvoicePageHTML(transactionData, type, company);
    const styleCss = buildInvoiceStyle();
    const container = await renderOffscreen(pageHTML, styleCss);
    const pageEl = container.querySelector(".page");

    try {
      const blob = await html2pdf()
        .set({
          margin: 0,
          filename: `${transactionData.bill_no || "invoice"}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(pageEl)
        .outputPdf("blob");
      return blob;
    } finally {
      container.remove();
    }
  }
}