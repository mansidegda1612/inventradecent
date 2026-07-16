// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppSender.jsx
// Generic, reusable WhatsApp sender — works from any screen (Sales, Purchase, etc.)
//
// USAGE:
//   import { sendWhatsApp } from "../utils/WhatsAppSender";
//
//   const result = await sendWhatsApp({
//     phone: customerPhone,       // optional — asked for in the preview popup if missing
//     billNo: data.bill_no,
//     amount: data.final_amount,
//     customerName,
//     pdfBlob,                    // optional — omit for text-only message
//     fileName: `Bill-${billNo}.pdf`,
//   });
//   if (!result.success) { show(result.message, "error"); }
//
// BEHAVIOUR — single popup, three possible steps:
//   1. CHECKING  — calls GET /whatsapp/status once (no background polling
//      anywhere in the app; this is the only time it's called, right when
//      you click "WhatsApp" on a bill).
//   2. QR        — only shown if not already connected. Starts the whatsmeow
//      session, shows the QR code, and polls status every 2.5s until scanned.
//      Nothing needed from the WhatsApp Settings menu — this popup handles
//      connecting inline, one time, right when it's needed.
//   3. PREVIEW   — shows the exact message text + attached PDF name, lets the
//      user confirm/edit the phone number, and only sends once "Send" is
//      clicked. Nothing goes out before that.
//
// Sends via the business's own linked WhatsApp number (whatsmeow backend,
// see routes/whatsapp.js + whatsmeow-service/) — never WhatsApp Web, never a
// share sheet.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
// Adjust this import path to wherever your shared UI lives in the project
// (the file that exports Modal, Field, Btn, Spinner — same one used in index.jsx).
import { Modal, Field, Btn, Spinner } from "../components/ui";
import { C } from "../utils/theme";
import { callAPI } from "./callserver";

// ── COMPANY CONFIG ───────────────────────────────────────────────────────────
// DEFAULT_COMPANY is only a FALLBACK for when GET /company fails (offline,
// backend down, field not filled in yet, etc.) — real values come from the
// company-settings API, see fetchCompanyConfig() below.
const DEFAULT_COMPANY = {
  name: "Inventra Decent",
  upiId: "",
  account_holder: "",
  fromMobile: "",
};

// Cached per session — cleared by invalidateCompanyCache() (call that right
// after a successful Company Settings save so the next send picks it up).
let cachedCompany = null;

export function invalidateCompanyCache() {
  cachedCompany = null;
}

async function fetchCompanyConfig(override) {
  if (override) return { ...DEFAULT_COMPANY, ...override };
  if (cachedCompany) return cachedCompany;

  try {
    const res = await callAPI("company", "GET");
    if (res?.success && res.data) {
      cachedCompany = {
        name: res.data.name || DEFAULT_COMPANY.name,
        upiId: res.data.upi_id || "",
        fromMobile: res.data.phone || "",
        account_holder: res.data.account_holder || res.data.name || DEFAULT_COMPANY.name,
      };
      return cachedCompany;
    }
  } catch (err) {
    console.warn("WhatsAppSender: could not fetch company details, using defaults:", err);
  }
  return { ...DEFAULT_COMPANY };
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
// expect "%20". Building the query string manually with encodeURIComponent
// avoids this entirely.
function buildUpiUrl(company, { billNo, amount, customerName }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    console.error("buildUpiUrl: invalid amount", amount);
    return "";
  }
  if (!company.upiId) {
    console.warn("buildUpiUrl: no UPI ID configured for this company");
    return "";
  }

  const params = {
    pa: company.upiId,
    pn: company.account_holder || company.name,
    am: amt.toFixed(2),
    cu: "INR",
    tn: `${billNo}`,
    tr: `${billNo}-${Date.now()}`,
  };

  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  return `upi://pay?${qs}`;
}

// ── create pay link ───────────────────────────────────────────────────────
async function createPayLink(company, { billNo, amount, customerName }) {
  return buildUpiUrl(company, { billNo, amount, customerName });
}

// ── message text ──────────────────────────────────────────────────────────
export function buildBillMessage({ customerName, billNo, amount, payUrl, companyName }) {
  return (
    `Hi ${customerName || ""},\n\n` +
    `Your bill from *${companyName || "us"}* is ready.\n` +
    `Bill No: *${billNo}*\n` +
    `Amount: *₹${Number(amount).toFixed(2)}*\n\n` +
    (payUrl ? `Pay Now 👉 ${payUrl}\n\n` : "") +
    `Thank you for your business! 🙏`
  );
}

// ── actually send via the whatsmeow-backed backend (routes/whatsapp.js) ───
async function dispatchViaServer(phone, message, pdfBlob, fileName) {
  const cleanPhone = normalizePhone(phone);
  const token = localStorage.getItem("token");
  const base = import.meta.env.VITE_API_URL;

  let res, data;

  if (pdfBlob) {
    // Multipart upload — deliberately NOT using callAPI() here since that
    // helper always sends Content-Type: application/json; FormData needs
    // its own multipart boundary set by the browser instead.
    const fd = new FormData();
    fd.append("phone", cleanPhone);
    fd.append("caption", message || "");
    fd.append("file", pdfBlob, fileName || "document.pdf");

    res = await fetch(`${base}whatsapp/send-media`, {
      method: "POST",
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      body: fd,
    });
  } else {
    res = await fetch(`${base}whatsapp/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ phone: cleanPhone, message }),
    });
  }

  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = { message: text }; }

  if (!res.ok || data?.success === false) {
    return {
      success: false,
      message: data?.message || data?.data?.error || "Failed to send WhatsApp message",
    };
  }
  return { success: true, data };
}

const POLL_INTERVAL_MS = 2500;

// ── the one combined popup: checking -> qr (if needed) -> preview -> sent ──
function WhatsAppFlowModal({ phone: initialPhone, message, pdfBlob, fileName, onDone }) {
  const [step, setStep] = useState("checking"); // checking | qr | blocked | preview | sending | done
  const [qr, setQr] = useState("");
  const [phone, setPhone] = useState(initialPhone || "");
  const [phoneError, setPhoneError] = useState("");
  const [blockedMsg, setBlockedMsg] = useState("");
  const [sendError, setSendError] = useState("");
  const pollRef = useRef(null);
  const phoneInputRef = useRef(null);
  const autoRetriesRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  const MAX_AUTO_RETRIES = 3;
  const MAX_CONSECUTIVE_FAILURES = 3;

  useEffect(() => {
    checkStatus();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === "preview") {
      setTimeout(() => phoneInputRef.current?.focus(), 0);
    }
  }, [step]);

  // Tries the status check up to MAX_CONSECUTIVE_FAILURES times (short gap
  // between attempts) before giving up — a single 502 during a cold start or
  // a mid-restart moment shouldn't immediately dead-end the popup, but it
  // also must NOT retry forever: after a few genuine failures, stop and say
  // so plainly instead of hammering a backend that isn't answering.
  async function checkStatusOnce(attempt = 1) {
    try {
      const res = await callAPI("whatsapp/status", "GET");
      if (!res.success) throw new Error(res.message || "WhatsApp service did not respond");
      return res;
    } catch (err) {
      if (attempt >= MAX_CONSECUTIVE_FAILURES) throw err;
      await new Promise((r) => setTimeout(r, 1200));
      return checkStatusOnce(attempt + 1);
    }
  }

  async function checkStatus() {
    clearInterval(pollRef.current); // guard against a stale interval from a previous attempt
    autoRetriesRef.current = 0; // manual (re)check always gets a fresh budget of auto-retries
    consecutiveFailuresRef.current = 0;
    setStep("checking");
    try {
      const res = await checkStatusOnce();
      const data = res.data || {};
      if (data.status === "connected") {
        setStep("preview");
      } else {
        // disconnected, error, or never-linked — always try reconnecting via
        // QR automatically (capped, so a persistently broken backend doesn't
        // loop forever — beginConnect()'s own failure path still lands on
        // the manual-retry "blocked" screen).
        beginConnect();
      }
    } catch (err) {
      setBlockedMsg("Could not reach WhatsApp service after a few tries: " + err.message);
      setStep("blocked");
    }
  }

  async function beginConnect() {
    if (autoRetriesRef.current >= MAX_AUTO_RETRIES) {
      setBlockedMsg("Still having trouble connecting to WhatsApp after a few tries. Please try again.");
      setStep("blocked");
      return;
    }
    autoRetriesRef.current += 1;

    let startRes;
    try {
      startRes = await callAPI("whatsapp/session/start", "POST", {});
    } catch (err) {
      setBlockedMsg("Could not reach WhatsApp service: " + err.message);
      setStep("blocked");
      return;
    }
    if (!startRes.success) {
      setBlockedMsg(startRes.message || "Could not start WhatsApp connection");
      setStep("blocked");
      return;
    }
    setStep("qr");
    consecutiveFailuresRef.current = 0;
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    pollStatus();
  }

  async function pollStatus() {
    try {
      const res = await callAPI("whatsapp/status", "GET");
      if (!res.success) throw new Error(res.message || "WhatsApp service did not respond");

      consecutiveFailuresRef.current = 0; // got a real response — reset the failure budget
      const data = res.data || {};
      if (data.status === "connected") {
        clearInterval(pollRef.current);
        setStep("preview");
      } else if (data.status === "qr" && data.qr) {
        setQr(data.qr);
      } else if (data.status === "disconnected" || data.status === "error" || data.error) {
        // The backend self-heals from stale-device issues by resetting to a
        // fresh device and reporting "disconnected" — so treat this as "the
        // link was lost, get a new QR" rather than a dead end. Restart the
        // connect flow once instead of just sitting on the old, now-invalid
        // QR image or silently failing.
        clearInterval(pollRef.current);
        beginConnect();
      }
    } catch (err) {
      // A single dropped request during active QR polling can be transient
      // (e.g. a cold-start blip) — but if it keeps failing, stop instead of
      // polling a dead backend forever.
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        clearInterval(pollRef.current);
        setBlockedMsg("WhatsApp service stopped responding: " + err.message);
        setStep("blocked");
      }
    }
  }

  function handleSend() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setPhoneError("Enter a valid 10-digit WhatsApp number");
      return;
    }
    setStep("sending");
    dispatchViaServer(digits, message, pdfBlob, fileName).then((result) => {
      if (result.success) {
        setStep("done");
        setTimeout(() => onDone(result), 900);
      } else {
        setSendError(result.message || "Failed to send");
        setStep("preview");
      }
    });
  }

  function handleCancel() {
    clearInterval(pollRef.current);
    onDone({ success: false, cancelled: true });
  }

  return (
    <Modal open onClose={handleCancel} title="Send via WhatsApp" width={420} popup={true}>
      {step === "checking" && (
        <div style={{ padding: "24px 4px", textAlign: "center" }}>
          <Spinner label="Checking WhatsApp connection…" />
        </div>
      )}

      {step === "blocked" && (
        <div>
          <p style={{ color: C.red, marginBottom: 16, fontSize: 14 }}>{blockedMsg}</p>
          <p style={{ color: C.muted, marginBottom: 16, fontSize: 13 }}>
            Ask an admin to connect WhatsApp, then try sending again.
          </p>
          <div className="wa-actions">
            <Btn variant="ghost" onClick={handleCancel}>Close</Btn>
            <Btn onClick={checkStatus}>Retry</Btn>
          </div>
        </div>
      )}

      {step === "qr" && (
        <div style={{ textAlign: "center" }}>
          {qr ? (
            <img
              src={`data:image/png;base64,${qr}`}
              alt="Scan with WhatsApp"
              style={{ width: 240, height: 240, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, background: "#fff" }}
            />
          ) : (
            <div style={{ padding: "30px 4px" }}>
              <Spinner label="Preparing QR code…" />
            </div>
          )}
          <p style={{ color: C.muted, marginTop: 12, fontSize: 13 }}>
            WhatsApp isn't linked yet — open WhatsApp on your phone → <b>Settings → Linked Devices → Link a device</b>,
            then scan this code. This only needs to be done once.
          </p>
          <div className="wa-actions">
            <Btn variant="ghost" onClick={handleCancel}>Cancel</Btn>
          </div>
        </div>
      )}

      {(step === "preview" || step === "sending" || step === "done") && (
        <div>
          <div
            style={{
              background: C.bgSoft ?? "#f4f6f8",
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
              maxHeight: 220,
              overflowY: "auto",
              marginBottom: 12,
            }}
          >
            {message}
          </div>

          {pdfBlob && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: C.bgAccent ?? "#e4edf3",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                color: C.text,
                marginBottom: 14,
              }}
            >
              📄 <span style={{ fontWeight: 600 }}>{fileName || "document.pdf"}</span>
              <span style={{ color: C.muted, fontSize: 12 }}>({Math.max(1, Math.round(pdfBlob.size / 1024))} KB)</span>
            </div>
          )}

          <Field label="Customer's WhatsApp number" required>
            <input
              ref={phoneInputRef}
              type="tel"
              value={phone}
              disabled={step !== "preview"}
              placeholder="e.g. 9876543210"
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && step === "preview" && handleSend()}
              className={`wa-phone-input ${phoneError ? "wa-phone-input-error" : ""}`}
            />
            {phoneError && <div className="wa-error-text">{phoneError}</div>}
          </Field>

          {sendError && (
            <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{sendError}</div>
          )}
          {step === "done" && (
            <div style={{ color: C.green, fontSize: 13, marginTop: 8, fontWeight: 600 }}>
              ✓ Sent on WhatsApp
            </div>
          )}

          <div className="wa-actions">
            <Btn variant="ghost" onClick={handleCancel} disabled={step !== "preview"}>
              Cancel
            </Btn>
            <Btn onClick={handleSend} className="wa-send-btn" disabled={step !== "preview"}>
              {step === "sending" ? "Sending…" : step === "done" ? "Sent ✓" : "Send"}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Mounts the flow popup into a throwaway container so this file stays
// callable from anywhere (not just inside a mounted React tree).
function openWhatsAppFlow({ phone, message, pdfBlob, fileName }) {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = (result) => {
      root.unmount();
      container.remove();
      resolve(result);
    };

    root.render(
      <WhatsAppFlowModal
        phone={phone}
        message={message}
        pdfBlob={pdfBlob}
        fileName={fileName}
        onDone={cleanup}
      />
    );
  });
}

/**
 * Main entry point. Call this from any screen.
 *
 * Builds the UPI pay link + bill message, then opens a single popup that:
 * checks the WhatsApp connection, walks through QR pairing inline if it's
 * not connected yet, then shows a preview of the exact message + attachment
 * before actually sending — nothing goes out until "Send" is clicked.
 *
 * @param {object} p
 * @param {string} [p.phone]           - customer phone, prefilled in the preview step (still editable)
 * @param {string} p.billNo            - bill number (used in the pay link + message)
 * @param {number} p.amount            - final bill amount
 * @param {string} [p.customerName]    - shown in the message greeting
 * @param {Blob}   [p.pdfBlob]         - PDF blob from GSTInvoicePrinter (optional)
 * @param {string} [p.fileName]        - PDF filename, e.g. "Bill-INV203.pdf"
 * @param {object} [p.companyOverride] - skip the GET /company fetch and use this instead
 * @returns {Promise<{success: boolean, message?: string, cancelled?: boolean, data?: any}>}
 */
export async function sendWhatsApp({ phone, billNo, amount, customerName, pdfBlob, fileName, companyOverride }) {
  if (!billNo || amount == null) {
    return { success: false, message: "billNo and amount are required" };
  }

  try {
    const company = await fetchCompanyConfig(companyOverride);
    const payUrl = await createPayLink(company, { billNo, amount, customerName });
    const message = buildBillMessage({
      customerName,
      billNo,
      amount,
      payUrl,
      companyName: company.name,
    });

    return await openWhatsAppFlow({ phone, message, pdfBlob, fileName });
  } catch (err) {
    console.error("sendWhatsApp failed:", err);
    return { success: false, message: err.message };
  }
}