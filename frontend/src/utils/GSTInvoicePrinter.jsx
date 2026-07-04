// ─────────────────────────────────────────────────────────────────────────────
// GSTInvoicePrinter.js
// Reusable GST Invoice generator — supports Sales (SI) and Purchase (PI).
// Usage:
//   import { GSTInvoicePrinter } from "./GSTInvoicePrinter";
//   GSTInvoicePrinter.print(transactionData, "SI");   // Sales Invoice
//   GSTInvoicePrinter.print(transactionData, "PI");   // Purchase Invoice
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
// ─────────────────────────────────────────────────────────────────────────────

// ── Company Config ────────────────────────────────────────────────────────────
// TODO: Replace getCompanyConfig() body with an API call when backend is ready:
//   const res = await fetch("/api/company-settings");
//   return res.json();
async function getCompanyConfig() {
  return {
    name: "InventraDecent",
    tagline: "Inventory · Billing · Accounting",
    address: "Plot No A 64, Road No 21, Waghle Indl Estate",
    city: "Rajkot, Gujarat - 360001",
    phone: "02225820309",
    email: "info@inventradecent.com",
    web: "www.inventradecent.com",
    pan: "ABCDE1234F",
    gstin: "24ABCDE1234F1Z5",
    bank: {
      name: "HDFC Bank",
      branch: "Rajkot Main",
      acc_number: "00112345678901",
      ifsc: "HDFC0001234",
      upi_id: "inventra@hdfcbank",
    },
    terms: [
      "Subject to Rajkot Jurisdiction.",
      "Our Responsibility Ceases as soon as goods leaves our Premises.",
      "Goods once sold will not taken back.",
      "Delivery Ex-Premises.",
    ],
  };
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

// ── Logo SVG (embedded inline — no external file needed) ─────────────────────
function logoSVG() {
  return `
  <svg width="72" height="72" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <polygon points="100,10 168,50 168,150 100,190 32,150 32,50" fill="#1A3A5C"/>
    <line x1="42" y1="88"  x2="158" y2="88"  stroke="#fff" stroke-width="8" stroke-linecap="round"/>
    <line x1="42" y1="115" x2="158" y2="115" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
    <line x1="42" y1="142" x2="158" y2="142" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
    <line x1="100" y1="35" x2="100" y2="158" stroke="#4FC3F7" stroke-width="6" stroke-linecap="round"/>
    <rect x="44"  y="65"  width="25" height="20" rx="3" fill="#4FC3F7"/>
    <rect x="75"  y="65"  width="20" height="20" rx="3" fill="#90CAF9"/>
    <rect x="112" y="65"  width="25" height="20" rx="3" fill="#4FC3F7"/>
    <rect x="44"  y="93"  width="20" height="20" rx="3" fill="#90CAF9"/>
    <rect x="70"  y="93"  width="27" height="20" rx="3" fill="#4FC3F7"/>
    <rect x="112" y="93"  width="25" height="20" rx="3" fill="#90CAF9"/>
    <rect x="44"  y="121" width="25" height="18" rx="3" fill="#4FC3F7"/>
    <rect x="112" y="121" width="25" height="18" rx="3" fill="#90CAF9"/>
  </svg>`;
}

// ── Build HTML for the invoice ────────────────────────────────────────────────
function buildInvoiceHTML(data, type, company) {
  const isGST = data.isGSTBill;
  const isSale = type === "SI";
  const invoiceTitle = isGST ? "TAX INVOICE" : "INVOICE";
  const partyLabel = isSale ? "Customer Detail" : "Supplier Detail";

  // ── Totals ────────────────────────────────────────────────────────────────
  const taxableTotal = (data.items || []).reduce((s, i) => s + parseFloat(i.taxable_amount || 0), 0);
  const cgstTotal = (data.items || []).reduce((s, i) => s + parseFloat(i.CGST || 0), 0);
  const sgstTotal = (data.items || []).reduce((s, i) => s + parseFloat(i.SGST || 0), 0);
  const gstTotal = cgstTotal + sgstTotal;
  const finalAmount = parseFloat(data.final_amount || 0);

  // Pull named expenses (Discount, Round Off etc.) — filter zeros
  const expenseLines = (data.expenses || [])
    .filter(e => e.key !== "roundoff" && parseFloat(e.amount || 0) !== 0)
    .map(e => ({ label: e.label || e.key, amount: parseFloat(e.amount || 0) }));
  // const roundoff = (data.expenses || []).find(e => e.key === "roundoff");
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
      <td>${item.name || ""}</td>
      <td class="tr">${item.hsn_code || ""}</td>
      <td class="tr">${item.qty}</td>
      <td class="tr">${fmt2(item.rate)}</td>
      <td class="tr">${fmt2(item.taxable_amount)}</td>
      ${isGST ? `
      <td class="tr">${fmt2(item.cgst_pct)}%</td>
      <td class="tr">${fmt2(item.CGST)}</td>
      <td class="tr">${fmt2(item.sgst_pct)}%</td>
      <td class="tr">${fmt2(item.SGST)}</td>
      ` : ""}
      <td class="tr"><strong>${fmt2(total)}</strong></td>
    </tr>`;
  });

  // Pad to minimum rows for clean look
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
  summaryRows.push(`<tr><td>Taxable Amount</td><td class="tr">${fmt2(taxableTotal)}</td></tr>`);
  if (isGST) {
    summaryRows.push(`<tr><td>Add: CGST</td><td class="tr">${fmt2(cgstTotal)}</td></tr>`);
    summaryRows.push(`<tr><td>Add: SGST</td><td class="tr">${fmt2(sgstTotal)}</td></tr>`);
    //summaryRows.push(`<tr><td>Total Tax</td><td class="tr">${fmt2(gstTotal)}</td></tr>`);
  }
  expenseLines.forEach(e => {
    const sign = e.amount < 0 ? "" : e.amount > 0 && e.label.toLowerCase().includes("discount") ? "- " : "+ ";
    summaryRows.push(`<tr><td>${e.label}</td><td class="tr">${sign}${fmt2(Math.abs(e.amount))}</td></tr>`);
  });
  if (roundoffAmt !== 0) {
    summaryRows.push(`<tr><td>Round Off</td><td class="tr">${roundoffAmt > 0 ? "+" : ""}${fmt2(roundoffAmt)}</td></tr>`);
  }
  summaryRows.push(`
    <tr class="final-row">
      <td>Total Amount After Tax</td>
      <td class="tr"><strong>&#8377;${fmt2(finalAmount)}</strong></td>
    </tr>`);

  // ── Full HTML ─────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${invoiceTitle} - ${data.bill_no}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #111;
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
    border-bottom: 3px solid #1A3A5C;
    padding-bottom: 6px;
    margin-bottom: 4px;
  }
  .inv-header-left { flex: 1; }
  .company-name {
    font-size: 22px;
    font-weight: 700;
    color: #1A3A5C;
    letter-spacing: -0.5px;
    line-height: 1.1;
  }
  .company-tagline {
    background: #1A3A5C;
    color: #fff;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 1.5px;
    padding: 2px 8px;
    margin: 3px 0;
    display: inline-block;
  }
  .company-addr { font-size: 10px; color: #444; line-height: 1.5; margin-top: 2px; }
  .company-contact { font-size: 10px; color: #444; text-align: right; line-height: 1.6; }
  .inv-logo { width: 72px; height: 72px; margin-left: 12px; flex-shrink: 0; }

  /* ── PAN + Title banner ── */
  .pan-title-row {
    display: flex;
    align-items: center;
    border: 1px solid #ccc;
    border-top: none;
    background: #f5f7fa;
    padding: 4px 8px;
    gap: 12px;
  }
  .pan-box { font-size: 11px; font-weight: 700; color: #1A3A5C; flex: 1; }
  .invoice-title-center {
    flex: 1;
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    color: #1A3A5C;
    letter-spacing: 1px;
  }
  .original-tag { flex: 1; text-align: right; font-size: 9px; font-weight: 600; color: #444; }

  /* ── Info grid ── */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid #ccc;
    border-top: none;
    margin-bottom: 0;
  }
  .info-cell {
    padding: 5px 7px;
    border-right: 1px solid #ccc;
    line-height: 1.7;
  }
  .info-cell:last-child { border-right: none; }
  .info-cell-title {
    font-size: 9px;
    font-weight: 700;
    background: #1A3A5C;
    color: #fff;
    padding: 2px 7px;
    letter-spacing: 0.5px;
  }
  .info-lbl { color: #555; font-weight: 600; display: inline-block; min-width: 72px; }

  /* ── Items table ── */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0;
    font-size: 10.5px;
  }
  .items-table th {
    background: #4d83bc;
    color: #424141;
    padding: 4px 4px;
    font-size: 9.5px;
    font-weight: 600;
    border: 1px solid #28323c;
    text-align: center;
  }
  .items-table th.tl { text-align: left; }
  .items-table td {
    border: 1px solid #ddd;
    padding: 3px 4px;
    vertical-align: top;
  }
  .items-table .blank-row td { height: 12px; }
  .items-table tfoot td {
    border: 1px solid #ccc;
    padding: 4px 4px;
    font-weight: 700;
    background: #f5f7fa;
  }
  .tc { text-align: center; }
  .tr { text-align: right; }
  .tl { text-align: left; }

  /* ── Bottom section ── */
  .bottom-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid #ccc;
    border-top: 2px solid #1A3A5C;
  }
  .bottom-left { border-right: 1px solid #ccc; padding: 5px 7px; }
  .bottom-right { padding: 5px 7px; }

  .summary-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .summary-table td { padding: 2px 4px; }
  .final-row td {
    background: #1A3A5C;
    color: #0a0000;
    font-size: 11.5px;
    padding: 4px 4px;
    border-top: 2px solid #1A3A5C;
  }
  .eoe-row td { font-size: 9px; color: #777; padding: 1px 4px; }

  .words-box {
    font-size: 10px;
    font-weight: 600;
    color: #1A3A5C;
    background: #eef2f7;
    border: 1px solid #c8d4e3;
    padding: 5px 7px;
    margin-bottom: 6px;
    border-radius: 2px;
    line-height: 1.4;
  }

  /* ── Bank + Signatory ── */
  .bank-sign-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid #ccc;
    border-top: none;
  }
  .bank-cell { border-right: 1px solid #ccc; padding: 5px 7px; }
  .bank-title, .sign-title {
    font-size: 9px;
    font-weight: 700;
    background: #1A3A5C;
    color: #fff;
    padding: 2px 7px;
    margin: -5px -7px 5px -7px;
    letter-spacing: 0.5px;
  }

  .qr-placeholder {
    width: 60px;
    height: 60px;
    border: 1px dashed #aaa;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    color: #999;
    margin: 4px 0;
  }
  .upi-label { font-size: 9px; font-weight: 600; color: #1A3A5C; }

  /* ── Terms ── */
  .terms-section {
    border: 1px solid #ccc;
    border-top: none;
    padding: 5px 7px;
  }
  .terms-title { font-size: 9px; font-weight: 700; color: #1A3A5C; margin-bottom: 2px; }
  .terms-section ul { padding-left: 14px; }
  .terms-section li { font-size: 9px; color: #555; line-height: 1.6; }

  .thankyou {
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    color: #1A3A5C;
    margin-top: 6px;
    padding: 4px;
    border-top: 2px solid #1A3A5C;
  }

  /* ── Print overrides ── */
  @media print {
    body { background: #fff !important; }
    .page { padding: 6mm 8mm; margin: 0; }
    @page { size: A4; margin: 0; }
     
  /* ── ADD THESE ── */
  .bank-sign-grid  { page-break-inside: avoid; }
  .terms-section   { page-break-inside: avoid; }
  .bottom-grid     { page-break-inside: avoid; }
  .thankyou        { page-break-inside: avoid; page-break-before: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- ── HEADER ── -->
  <div class="inv-header">
    <div class="inv-header-left">
      <div class="company-name">${company.name}</div>
      <div class="company-tagline">${company.tagline}</div>
      <div class="company-addr">
        ${company.address}<br/>
        ${company.city}
      </div>
    </div>
    <div class="company-contact">
      Tel : ${company.phone}<br/>
      Web : ${company.web}<br/>
      Web : ${company.email}
    </div>
    <div class="inv-logo">${logoSVG()}</div>
  </div>

  <!-- ── PAN + TITLE ── -->
  <div class="pan-title-row">
    <div class="pan-box">PAN : ${company.pan}</div>
    <div class="invoice-title-center">${invoiceTitle}</div>
    <div class="original-tag">ORIGINAL FOR RECIPIENT</div>
  </div>

  <!-- ── PARTY + INVOICE INFO ── -->
  <div class="info-grid">
    <div>
      <div class="info-cell-title">${partyLabel}</div>
      <div class="info-cell">
        <div><span class="info-lbl">M/S</span> ${data.customer_name || data.customer_name_cash || "—"}</div>
        <div><span class="info-lbl">Address</span> ${data.customer_address || "—"}</div>
        <div><span class="info-lbl">Phone</span> ${data.customer_phone || "—"}</div>
        <div><span class="info-lbl">GSTIN</span> ${data.customer_gstin || "—"}</div>
        <div><span class="info-lbl">Place of Supply</span> ${data.place_of_supply || "—"}</div>
      </div>
    </div>
    <div>
      <div class="info-cell-title">Invoice Detail</div>
      <div class="info-cell">
        <div><span class="info-lbl">Invoice No</span> ${data.bill_no || "—"}</div>
        <div><span class="info-lbl">Invoice Date</span> ${fmtDate(data.date)}</div>
        <div><span class="info-lbl">Type</span> ${data.cash_debit === "C" ? "Cash" : "Credit / Debit"}</div>
        <div><span class="info-lbl">Company GSTIN</span> ${company.gstin}</div>
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
        <div style="font-size:9px;color:#555;margin-bottom:2px;">Total in words</div>
        ${numberToWords(finalAmount)}
      </div>
    </div>
    <div class="bottom-right">
      <table class="summary-table">
        ${summaryRows.join("")}
      </table>
    </div>
  </div>

  <!-- ── BANK DETAILS + SIGNATORY ── -->
  <div class="bank-sign-grid">
    <div class="bank-cell">
      <div class="bank-title">Bank Details</div>
      <table style="font-size:10px;line-height:1.8;width:100%">
        <tr><td style="color:#555;width:80px">Name</td><td>${company.bank.name}</td></tr>
        <tr><td style="color:#555">Branch</td><td>${company.bank.branch}</td></tr>
        <tr><td style="color:#555">Acc. Number</td><td>${company.bank.acc_number}</td></tr>
        <tr><td style="color:#555">IFSC</td><td>${company.bank.ifsc}</td></tr>
        <tr><td style="color:#555">UPI ID</td><td>${company.bank.upi_id}</td></tr>
      </table>
      <div class="qr-placeholder">QR Code</div>
      <div class="upi-label">Pay using UPI</div>
    </div>
    
     <!-- ── TERMS & CONDITIONS ── -->
     <div class="terms-section">
      <div class="terms-title">Terms and Conditions</div>
        <ul>
          ${company.terms.map(t => `<li>${t}</li>`).join("")}
          <li>Customer Signature ___________________________</li>
        </ul>
        </div>
      </div>
  </div>
  <div class="thankyou">Thank you for shopping with us!</div>

</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export class GSTInvoicePrinter {
  /**
   * Open browser print dialog for a GST invoice.
   * @param {object} transactionData  — Full transaction object from API / form state
   * @param {"SI"|"PI"} type          — "SI" = Sales Invoice, "PI" = Purchase Invoice
   */
    static async print(transactionData, type = "SI") {
    const company = await getCompanyConfig();
    const html = buildInvoiceHTML(transactionData, type, company);


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
   * Get the raw HTML string (useful for preview or server-side PDF generation).
   * @param {object} transactionData
   * @param {"SI"|"PI"} type
   * @returns {Promise<string>}
   */
  static async getHTML(transactionData, type = "SI") {
    const company = await getCompanyConfig();
    return buildInvoiceHTML(transactionData, type, company);
  }
}