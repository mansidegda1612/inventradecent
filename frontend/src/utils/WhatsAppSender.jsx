// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppSender.js
// Generic, reusable WhatsApp sender — works from any screen (Sales, Purchase, etc.)
//
// USAGE:
//   import { sendWhatsApp, buildUPILink, buildBillMessage } from "../utils/WhatsAppSender";
//
//   const message = buildBillMessage({ customerName, billNo, amount: finalAmount });
//   await sendWhatsApp({ phone: customerPhone, message, pdfBlob, fileName: `Bill-${billNo}.pdf` });
//
// BEHAVIOUR:
//   - phone passed         -> sends straight away (no popup)
//   - phone NOT passed     -> shows a phone-number popup (built right here, no
//                             React/Modal dependency needed) and sends after submit
//   - pdfBlob passed       -> attempts native share sheet (navigator.share with
//                             files) so the PDF + text land together in WhatsApp
//                             on supported mobile browsers
//   - share not supported  -> falls back to wa.me text-only link, and downloads
//                             the PDF separately so the user can attach manually
// ─────────────────────────────────────────────────────────────────────────────

// ── STATIC COMPANY CONFIG ────────────────────────────────────────────────────
// TODO (future scope): fetch this from a company-settings API instead of
// hardcoding it here, once that table/endpoint exists.
export const COMPANY_CONFIG = {
  name: "Inventra Decnet",
  upiId: "mansidegda@okhdfcbank",
  fromMobile: "6353397539", // reserved for future WhatsApp Business API integration
};

// ── phone helpers ─────────────────────────────────────────────────────────
export function normalizePhone(phone) {
  if (!phone) return "";
  let clean = String(phone).replace(/[^\d]/g, "");
  if (clean.length === 10) clean = "91" + clean; // assume Indian number if bare 10-digit
  return clean;
}

// ── UPI link ──────────────────────────────────────────────────────────────
export function buildUPILink(amount, note = "", opts = {}) {
  const payeeUpiId = opts.payeeUpiId || COMPANY_CONFIG.upiId;
  const payeeName = opts.payeeName || COMPANY_CONFIG.name;

  const params = new URLSearchParams({
    pa: payeeUpiId,
    pn: payeeName,
    am: Number(amount).toFixed(2),
    cu: "INR",
    tn: note || "Payment",
  });

  return `upi://pay?${params.toString()}`;
}

// ── message text ──────────────────────────────────────────────────────────
export function buildBillMessage({ customerName, billNo, amount, upiLink, companyName }) {
  const company = companyName || COMPANY_CONFIG.name;
  const link = upiLink || buildUPILink(amount, billNo);

  return (
    `Hi ${customerName || ""},\n\n` +
    `Your bill from *${company}* is ready.\n` +
    `Bill No: ${billNo}\n` +
    `Amount: ₹${Number(amount).toFixed(2)}\n\n` +
    `Tap below to pay instantly via any UPI app:\n${link}\n\n` +
    `Thank you for your business!`
  );
}

// ── internal: tiny vanilla-DOM popup for phone entry ────────────────────
// No React/Modal dependency, so this file stays usable from anywhere.
// Returns a Promise<string|null> — null if the user cancels.
function askForPhonePopup() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; font-family: inherit;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
      background: #fff; border-radius: 10px; padding: 24px;
      width: 320px; box-shadow: 0 8px 30px rgba(0,0,0,0.25);
    `;

    box.innerHTML = `
      <div style="font-weight:600; font-size:16px; margin-bottom:12px; color:#111;">
        Send via WhatsApp
      </div>
      <div style="font-size:13px; color:#555; margin-bottom:10px;">
        No phone number on file. Enter the customer's WhatsApp number:
      </div>
      <input id="wa-phone-input" type="tel" placeholder="e.g. 9876543210"
        style="width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:6px;
               font-size:14px; margin-bottom:16px; box-sizing:border-box;" />
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="wa-cancel-btn" style="padding:7px 14px; border:1px solid #ccc;
          background:#fff; border-radius:6px; cursor:pointer; font-size:13px;">Cancel</button>
        <button id="wa-send-btn" style="padding:7px 14px; border:none;
          background:#25D366; color:#fff; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600;">Send</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const input = box.querySelector("#wa-phone-input");
    input.focus();

    const cleanup = () => document.body.removeChild(overlay);

    box.querySelector("#wa-cancel-btn").onclick = () => {
      cleanup();
      resolve(null);
    };

    const submit = () => {
      const val = input.value.trim();
      cleanup();
      resolve(val || null);
    };

    box.querySelector("#wa-send-btn").onclick = submit;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      if (e.key === "Escape") {
        cleanup();
        resolve(null);
      }
    });
  });
}

// ── internal: actually dispatch the message (+ optional PDF) ────────────
async function dispatch(phone, message, pdfBlob, fileName) {
  const cleanPhone = normalizePhone(phone);

  // Try native share sheet first — this is the only way to get text + PDF
  // into WhatsApp together. Only works on supported mobile browsers (HTTPS,
  // Web Share API Level 2 with `files` support).
  if (pdfBlob && navigator.share && navigator.canShare) {
    try {
      const file = new File([pdfBlob], fileName || "bill.pdf", { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: message,
        });
        return; // user picked WhatsApp (or any app) from the native share sheet
      }
    } catch (err) {
      // user cancelled the share sheet, or it failed — fall through to wa.me below
      console.warn("navigator.share failed or was cancelled, falling back:", err);
    }
  }

  // Fallback: wa.me text-only link.
  const encodedMsg = encodeURIComponent(message);
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedMsg}`
    : `https://wa.me/?text=${encodedMsg}`;
  window.open(url, "_blank");

  // If there's a PDF and we couldn't share it natively, download it so the
  // user can attach it manually in the WhatsApp window that just opened.
  if (pdfBlob) {
    const dlUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = fileName || "bill.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(dlUrl);
  }
}

/**
 * Main entry point. Call this from any screen.
 *
 * @param {object} p
 * @param {string} [p.phone]    - customer phone. If omitted, a popup asks for it.
 * @param {string} p.message    - full message text (build with buildBillMessage)
 * @param {Blob}   [p.pdfBlob]  - PDF blob generated by GSTInvoicePrinter (see note below)
 * @param {string} [p.fileName] - filename for the PDF, e.g. "Bill-INV203.pdf"
 */
export async function sendWhatsApp({ phone, message, pdfBlob, fileName }) {
  if (!message) {
    console.error("sendWhatsApp: message is required");
    return false;
  }

  if (phone) {
    await dispatch(phone, message, pdfBlob, fileName);
    return true;
  }

  // No phone passed -> popup, asks here, send happens from this same utility
  const entered = await askForPhonePopup();
  if (!entered) return false; // user cancelled

  await dispatch(entered, message, pdfBlob, fileName);
  return true;
}