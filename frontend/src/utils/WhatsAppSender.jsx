// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppSender.jsx
// Generic, reusable WhatsApp sender — works from any screen (Sales, Purchase, etc.)
//
// USAGE:
//   import { sendWhatsApp, buildBillMessage } from "../utils/WhatsAppSender";
//
//   await sendWhatsApp({
//     phone: customerPhone,       // optional — popup asks if missing
//     billNo: data.bill_no,
//     amount: data.final_amount,
//     customerName,
//     pdfBlob,                    // optional
//     fileName: `Bill-${billNo}.pdf`,
//   });
//
// BEHAVIOUR:
//   - Builds a valid UPI deep link (upi://pay?...) — see notes below on why the
//     old version silently failed for some UPI apps
//   - phone passed     -> sends straight away (no popup)
//   - phone NOT passed -> shows a themed phone-number popup and sends after submit
//   - pdfBlob passed   -> attempts native share sheet (mobile browsers)
//   - share not supported -> falls back to WhatsApp Web (text + PDF download)
//
// NOTE ON "upi://" IN A CHAT MESSAGE:
//   WhatsApp only auto-links http(s) URLs. A raw "upi://pay?..." string typed
//   into a message will NOT be tappable for the recipient — it just shows as
//   plain text. To actually get a tappable "Pay Now" link you need a real
//   https:// URL (short link) that redirects to this UPI intent — that's what
//   the original /pay/create backend call was meant to do. Wire that up when
//   the endpoint exists (see createPayLink below); until then this still
//   produces a *correct* upi:// string, but treat it as "works when tapped
//   from a UPI app / QR" rather than "tappable straight out of WhatsApp".
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
// Adjust this import path to wherever your shared UI lives in the project
// (the file that exports Modal, Field, Btn — same one used in index.jsx).
import { Modal, Field, Btn } from "../components/ui";
import { C } from "../utils/theme";
import { callAPI } from "./callserver";

// ── COMPANY CONFIG ───────────────────────────────────────────────────────────
// DEFAULT_COMPANY is now only a FALLBACK for when GET /company fails (offline,
// backend down, etc.) or is missing a field. Real values come from the
// company-settings API — see fetchCompanyConfig() below.
const DEFAULT_COMPANY = {
  name: "Inventra Decent",
  upiId: "",
  fromMobile: "", // reserved for future WhatsApp Business API integration
};

// Kept exported for any existing code importing COMPANY_CONFIG directly —
// prefer fetchCompanyConfig() / letting sendWhatsApp fetch it for you instead,
// since this constant is never updated after Company Settings changes.
export const COMPANY_CONFIG = DEFAULT_COMPANY;

// Cached per session — cleared by invalidateCompanyCache() (call that right
// after a successful Company Settings save so the next send picks it up).
let cachedCompany = null;

export function invalidateCompanyCache() {
  cachedCompany = null;
}

async function fetchCompanyConfig(override) {
  if (override) return { ...override };
  if (cachedCompany) return cachedCompany;

  try {
    const res = await callAPI("company", "GET");
    if (res?.success && res.data) {
      cachedCompany = {
        name: res.data.name ,
        upiId: res.data.upi_id ,
        fromMobile: res.data.phone,
        account_holder: res.data.account_holder,
      };
      return cachedCompany;
    }
  } catch (err) {
    console.warn("WhatsAppSender: could not fetch company details, using defaults:", err);
  }
  return ;
}

// ── phone helpers ─────────────────────────────────────────────────────────
export function normalizePhone(phone) {
  if (!phone) return "";
  let clean = String(phone).replace(/[^\d]/g, "");
  if (clean.length === 10) clean = "91" + clean; // assume Indian number if bare 10-digit
  return clean;
}

// ── build a correct UPI deep link ───────────────────────────────────────
// IMPORTANT: never build this with URLSearchParams. URLSearchParams.toString()
// encodes spaces as "+", but the UPI intent spec (and most bank/PSP apps)
// expect "%20". A "+" in `pn` (payee name) or `tn` (note) either shows up
// literally in the app's confirmation screen or gets the whole intent
// rejected as malformed, depending on the app. Some merchant-flavoured apps
// are lenient about "+" — which is exactly why this looked like it "only
// worked for merchant" links. Building the query string manually with
// encodeURIComponent avoids this entirely.
function buildUpiUrl(company, { billNo, amount, customerName }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    console.error("buildUpiUrl: invalid amount", amount);
    return "";
  }

  const params = {
    pa: company.upiId,                           // payee VPA
    pn: company.account_holder,                            // payee name
    am: amt.toFixed(2),                          // amount, 2 decimals
    cu: "INR",                                   // currency
    tn: `${billNo}`,                        // transaction note
    // tr = unique transaction reference. Recommended by the UPI spec so
    // re-sending the same bill (e.g. customer asks twice) doesn't get
    // flagged as a duplicate/replay by the receiving app.
    tr: `${billNo}-${Date.now()}`,
  };

  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  return `upi://pay?${qs}`;
}

// ── create pay link ───────────────────────────────────────────────────────
// Calls POST /pay/create to get a clean, tappable short URL like
// https://yourapp.com/pay/INV-0009 which server-side redirects into the UPI
// intent above. Falls back to the raw UPI intent if the backend call fails
// or the endpoint doesn't exist yet.
async function createPayLink(company, { billNo, amount, customerName }) {
  const upiUrl = buildUpiUrl(company, { billNo, amount, customerName });

  // try {
  //   const res = await fetch("/pay/create", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ billNo, amount, customerName, upiUrl }),
  //   });
  //   if (res.ok) {
  //     const data = await res.json();
  //     if (data?.url) return data.url;
  //   }
  // } catch (err) {
  //   console.warn("createPayLink: /pay/create unavailable, using raw UPI link:", err);
  // }

  return upiUrl;
}

// ── message text ──────────────────────────────────────────────────────────
export function buildBillMessage({ customerName, billNo, amount, payUrl, companyName }) {
  const company = companyName ;

  return (
    `Hi ${customerName || ""},\n\n` +
    `Your bill from *${company}* is ready.\n` +
    `Bill No: *${billNo}*\n` +
    `Amount: *₹${Number(amount).toFixed(2)}*\n\n` +
    `Pay Now 👉 ${payUrl}\n\n` +
    `Thank you for your business! 🙏`
  );
}

// ── themed phone-entry popup (React, uses project's Modal/Field/Btn) ─────
function PhonePopup({ onSubmit, onCancel }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Enter a valid 10-digit WhatsApp number");
      return;
    }
    onSubmit(digits);
  };

  return (
    <Modal open onClose={onCancel} title="Send via WhatsApp" width={360} popup={true}>
      <Field label="Customer's WhatsApp number" required>
        <input
          ref={inputRef}
          type="tel"
          value={phone}
          placeholder="e.g. 9876543210"
          onChange={(e) => {
            setPhone(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          className={`wa-phone-input ${error ? "wa-phone-input-error" : ""}`}
        />
        {error && (
          <div className="wa-error-text">
            {error}
          </div>
        )}
      </Field>

      <div className="wa-actions">
        <Btn variant="ghost" onClick={onCancel}>
          Cancel
        </Btn>
        <Btn onClick={submit} className="wa-send-btn">
          Send
        </Btn>
      </div>
    </Modal>
  );
}

// Mounts the themed popup into a throwaway container so this file stays
// callable from anywhere (not just inside a mounted React tree).
function askForPhonePopup() {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      container.remove();
    };

    root.render(
      <PhonePopup
        onSubmit={(phone) => {
          cleanup();
          resolve(phone);
        }}
        onCancel={() => {
          cleanup();
          resolve(null);
        }}
      />
    );
  });
}

// ── is this an actual mobile device? ──────────────────────────────────────
// Desktop Chrome/Edge also implement navigator.share, but there it opens the
// OS-level "Share" panel (Mail, Teams, Nearby Sharing, Phone Link, etc.) —
// not WhatsApp — so we only want the native-share path on real mobile
// devices, where that sheet is the phone's compact app picker with WhatsApp
// one tap away.
function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  if (navigator.userAgentData?.mobile != null) return navigator.userAgentData.mobile;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

// ── internal: actually dispatch the message (+ optional PDF) ────────────
async function dispatch(phone, message, pdfBlob, fileName) {
  const cleanPhone = normalizePhone(phone);

  // Native share sheet — mobile only (see isMobileDevice above). This is the
  // only way to get text + PDF into WhatsApp together in one step.
  if (pdfBlob && isMobileDevice() && navigator.share && navigator.canShare) {
    try {
      const file = new File([pdfBlob], fileName || "bill.pdf", { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: message });
        return;
      }
    } catch (err) {
      console.warn("navigator.share failed or was cancelled, falling back:", err);
    }
  }

  // Fallback: open WhatsApp Web directly to the chat with message pre-filled
  const encodedMsg = encodeURIComponent(message);
  const url = cleanPhone
    ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`
    : `https://web.whatsapp.com/send?text=${encodedMsg}`;
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
 * @param {string} [p.phone]           - customer phone. If omitted, a popup asks for it.
 * @param {string} p.billNo            - bill number (used to create pay link)
 * @param {number} p.amount            - final bill amount
 * @param {string} [p.customerName]    - shown in the message greeting
 * @param {Blob}   [p.pdfBlob]         - PDF blob from GSTInvoicePrinter (optional)
 * @param {string} [p.fileName]        - PDF filename, e.g. "Bill-INV203.pdf"
 * @param {object} [p.companyOverride] - skip the GET /company fetch and use this instead
 */
export async function sendWhatsApp({ phone, billNo, amount, customerName, pdfBlob, fileName, companyOverride }) {
  if (!billNo || amount == null) {
    console.error("sendWhatsApp: billNo and amount are required");
    return false;
  }

  const company = await fetchCompanyConfig(companyOverride);
  const payUrl = await createPayLink(company, { billNo, amount, customerName });
  const message = buildBillMessage({ customerName, billNo, amount, payUrl, companyName: company.name });

  if (phone) {
    await dispatch(phone, message, pdfBlob, fileName);
    return true;
  }

  const entered = await askForPhonePopup();
  if (!entered) return false; // user cancelled

  await dispatch(entered, message, pdfBlob, fileName);
  return true;
}