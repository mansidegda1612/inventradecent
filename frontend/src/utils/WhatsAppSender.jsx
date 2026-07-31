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
//   2. QR        — only shown if this ACCOUNT has never linked a number.
//      Starts the whatsmeow session, shows the QR code, and polls status until
//      scanned. Nothing needed from the WhatsApp Settings menu — this popup
//      handles connecting inline, one time, right when it's needed.
//   3. PREVIEW   — shows the message and the attachment, BOTH EDITABLE: the
//      generated bill text is prefilled but the user can rewrite it, and the
//      generated PDF can be replaced with any other file (or removed). Also
//      confirms/edits the phone number. Nothing goes out until "Send".
//
// ONE NUMBER PER ACCOUNT: the linked WhatsApp number belongs to the account, so
// once any admin scans, every user in that account sends from it with no
// further scanning. A different account gets its own QR and links its own
// phone. The account is resolved server-side from the JWT — see
// routes/whatsapp.js and whatsmeow-service/main.go.
//
// FAILURE POLICY (deliberate — read before "improving" the retry logic):
// this file NEVER retries automatically in a loop. A WhatsApp service that is
// down, hung, or mid-restart must produce a visible error in seconds, not a
// spinner the user sits in front of. Concretely:
//   - Every request has a short, explicit timeout (see the constants below).
//   - A 503 + code:WA_SERVICE_DOWN from the backend is FATAL: stop immediately,
//     show the message, offer a manual Retry button. No auto-retry.
//   - QR polling stops on a hard deadline, and on a couple of consecutive
//     transient failures.
//   - A failed send is never retried on the user's behalf.
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
import { callAPI, notifyUpgradeRequired } from "./callserver";

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
function buildUpiUrl(company, { billNo, amount }) {
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

// ── timing / limits ───────────────────────────────────────────────────────
// These are the whole answer to "the popup hangs forever". callAPI's default
// timeout is 60s, which is far too long for a localhost hop to the WhatsApp
// service: three retries at 60s each is three minutes of spinner. Keep these
// short — a healthy service answers in milliseconds.
const STATUS_TIMEOUT_MS = 8000;
const START_TIMEOUT_MS = 12000;
const SEND_TEXT_TIMEOUT_MS = 25000;
const SEND_MEDIA_TIMEOUT_MS = 90000; // uploads a file to WhatsApp's servers

const POLL_INTERVAL_MS = 2500;
// Hard stop on QR polling. Nobody is coming back to a QR screen after three
// minutes, and polling a code nobody will scan is pure noise.
const QR_DEADLINE_MS = 3 * 60 * 1000;
// Consecutive dropped polls tolerated mid-pairing before giving up. Small: it
// exists for a single blip, not to keep a dead backend alive.
const MAX_TRANSIENT_FAILURES = 2;
// How many times we'll re-open pairing on our own (e.g. the QR expired, or the
// backend self-healed a stale device). Then it's the user's call.
const MAX_RELINK_ATTEMPTS = 2;

// Matches whatsmeow-service's ParseMultipartForm(20 << 20).
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Must match routes/whatsapp.js. Anything carrying this code means the Go
// service could not be reached at all — never retry it automatically.
const WA_SERVICE_DOWN = "WA_SERVICE_DOWN";

// A fatal error ends the flow immediately instead of feeding the retry budget.
class ServiceDownError extends Error {
  constructor(message) {
    super(message || "WhatsApp service is unavailable");
    this.name = "ServiceDownError";
    this.fatal = true;
  }
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ── actually send via the whatsmeow-backed backend (routes/whatsapp.js) ───
async function dispatchViaServer(phone, message, blob, fileName) {
  const cleanPhone = normalizePhone(phone);
  const token = localStorage.getItem("token");
  const base = import.meta.env.VITE_API_URL;

  let res, data;

  try {
    if (blob) {
      // Multipart upload — deliberately NOT using callAPI() here since that
      // helper always sends Content-Type: application/json; FormData needs
      // its own multipart boundary set by the browser instead.
      const fd = new FormData();
      fd.append("phone", cleanPhone);
      fd.append("caption", message || "");
      fd.append("file", blob, fileName || "document.pdf");

      res = await fetch(`${base}whatsapp/send-media`, {
        method: "POST",
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        body: fd,
        signal: AbortSignal.timeout(SEND_MEDIA_TIMEOUT_MS),
      });
    } else {
      res = await fetch(`${base}whatsapp/send-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ phone: cleanPhone, message }),
        signal: AbortSignal.timeout(SEND_TEXT_TIMEOUT_MS),
      });
    }
  } catch (err) {
    // Raw fetch, so a timeout/offline lands here rather than as a status code.
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      success: false,
      message: timedOut
        ? "Sending timed out — the WhatsApp service did not respond. The message was most likely not sent."
        : `Could not reach the server: ${err.message}`,
    };
  }

  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = { message: text }; }

  // send-text/send-media go through a raw fetch (see the comment above),
  // bypassing callAPI's own 402 handling — surface it here instead so a
  // Starter-tier account still gets the same upgrade dialog as everywhere else.
  if (res.status === 402) notifyUpgradeRequired(data);

  if (!res.ok || data?.success === false) {
    return {
      success: false,
      message: data?.message || data?.data?.error || "Failed to send WhatsApp message",
    };
  }
  return { success: true, data };
}

// ── the one combined popup: checking -> qr (if needed) -> preview -> sent ──
function WhatsAppFlowModal({
  phone: initialPhone,
  message: defaultMessage,
  pdfBlob,
  fileName: defaultFileName,
  onDone,
}) {
  const [step, setStep] = useState("checking"); // checking | qr | blocked | preview | sending | done
  const [qr, setQr] = useState("");
  const [phone, setPhone] = useState(initialPhone || "");
  const [phoneError, setPhoneError] = useState("");
  const [blockedMsg, setBlockedMsg] = useState("");
  const [sendError, setSendError] = useState("");

  // Editable message. Starts as the generated bill text; the user can rewrite
  // it freely, and "Reset" puts the generated version back.
  const [msg, setMsg] = useState(defaultMessage || "");

  // Editable attachment. Starts as the generated PDF (when the caller passed
  // one) and can be replaced with any file, or removed entirely.
  const [attachment, setAttachment] = useState(
    pdfBlob ? { blob: pdfBlob, name: defaultFileName || "document.pdf" } : null
  );
  const [attachError, setAttachError] = useState("");

  const pollRef = useRef(null);
  const phoneInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Guards against setState-after-unmount when a slow request resolves after
  // the user has already closed the popup.
  const aliveRef = useRef(true);
  // Stops overlapping polls: one slow request must not stack up behind the
  // interval and turn into a burst.
  const pollInFlightRef = useRef(false);
  const relinkAttemptsRef = useRef(0);
  const transientFailuresRef = useRef(0);
  const qrDeadlineRef = useRef(0);

  useEffect(() => {
    checkStatus();
    return () => {
      aliveRef.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === "preview") {
      setTimeout(() => phoneInputRef.current?.focus(), 0);
    }
  }, [step]);

  function stopPolling() {
    clearInterval(pollRef.current);
    pollRef.current = null;
  }

  function block(message) {
    stopPolling();
    if (!aliveRef.current) return;
    setBlockedMsg(message);
    setStep("blocked");
  }

  // One status call, one short timeout, no retry loop. `silent` keeps the
  // global loader out of the way — the popup shows its own spinner.
  async function fetchStatus() {
    const res = await callAPI("whatsapp/status", "GET", null, false, STATUS_TIMEOUT_MS, true);
    if (res?.code === WA_SERVICE_DOWN) throw new ServiceDownError(res.message);
    if (!res?.success) throw new Error(res?.message || "WhatsApp service did not respond");
    return res.data || {};
  }

  async function checkStatus() {
    stopPolling();
    // A manual retry gets a fresh budget.
    relinkAttemptsRef.current = 0;
    transientFailuresRef.current = 0;
    setStep("checking");
    setBlockedMsg("");

    try {
      const data = await fetchStatus();
      if (!aliveRef.current) return;
      if (data.status === "connected") {
        setStep("preview");
      } else {
        // Not linked yet (or the link was lost) — walk this account through
        // pairing inline.
        beginConnect();
      }
    } catch (err) {
      block(err.message);
    }
  }

  async function beginConnect() {
    if (relinkAttemptsRef.current >= MAX_RELINK_ATTEMPTS) {
      block("Could not link WhatsApp after a couple of attempts. Please try again.");
      return;
    }
    relinkAttemptsRef.current += 1;

    let startRes;
    try {
      startRes = await callAPI("whatsapp/session/start", "POST", {}, false, START_TIMEOUT_MS, true);
    } catch (err) {
      block("Could not reach WhatsApp service: " + err.message);
      return;
    }
    if (!aliveRef.current) return;

    if (startRes?.code === WA_SERVICE_DOWN) {
      block(startRes.message);
      return;
    }
    if (!startRes?.success) {
      // Includes the 403 a non-admin gets — only admins may start a session.
      block(startRes?.message || "Could not start WhatsApp connection");
      return;
    }

    setStep("qr");
    transientFailuresRef.current = 0;
    qrDeadlineRef.current = Date.now() + QR_DEADLINE_MS;
    stopPolling();
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    pollStatus();
  }

  async function pollStatus() {
    if (pollInFlightRef.current) return;
    if (Date.now() > qrDeadlineRef.current) {
      block("The QR code wasn't scanned in time. Click Retry when you're ready to scan.");
      return;
    }
    pollInFlightRef.current = true;

    try {
      const data = await fetchStatus();
      if (!aliveRef.current) return;
      transientFailuresRef.current = 0;

      if (data.status === "connected") {
        stopPolling();
        setStep("preview");
      } else if (data.status === "qr" && data.qr) {
        setQr(data.qr);
      } else if (data.status === "disconnected" || data.status === "error" || data.error) {
        // The backend self-heals from stale-device issues by resetting to a
        // fresh device and reporting "disconnected" — so treat this as "the
        // link was lost, get a new QR" rather than a dead end. Capped by
        // MAX_RELINK_ATTEMPTS so a persistently broken backend lands on the
        // blocked screen instead of cycling forever.
        stopPolling();
        beginConnect();
      }
    } catch (err) {
      if (!aliveRef.current) return;
      if (err.fatal) {
        // Service is gone. Don't burn the transient budget pretending otherwise.
        block(err.message);
        return;
      }
      transientFailuresRef.current += 1;
      if (transientFailuresRef.current >= MAX_TRANSIENT_FAILURES) {
        block("WhatsApp service stopped responding: " + err.message);
      }
    } finally {
      pollInFlightRef.current = false;
    }
  }

  // ── attachment editing ──────────────────────────────────────────────────
  function handlePickFile(e) {
    const picked = e.target.files?.[0];
    // Let the same file be re-picked later (Chrome won't fire change otherwise).
    e.target.value = "";
    if (!picked) return;

    if (picked.size > MAX_FILE_BYTES) {
      setAttachError(`That file is ${formatSize(picked.size)} — the limit is ${formatSize(MAX_FILE_BYTES)}.`);
      return;
    }
    if (picked.size === 0) {
      setAttachError("That file is empty.");
      return;
    }
    setAttachError("");
    setAttachment({ blob: picked, name: picked.name });
  }

  function handleRemoveFile() {
    setAttachError("");
    setAttachment(null);
  }

  const messageEdited = msg !== (defaultMessage || "");
  const attachmentChanged = attachment?.blob !== pdfBlob;
  const editable = step === "preview";

  function handleSend() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setPhoneError("Enter a valid 10-digit WhatsApp number");
      return;
    }
    // With both fields editable it's now possible to empty everything out.
    if (!msg.trim() && !attachment) {
      setSendError("Add a message or attach a file before sending.");
      return;
    }

    setSendError("");
    setStep("sending");
    dispatchViaServer(digits, msg, attachment?.blob, attachment?.name).then((result) => {
      if (!aliveRef.current) return;
      if (result.success) {
        setStep("done");
        setTimeout(() => onDone(result), 900);
      } else {
        // Never auto-retried: the user decides whether to send again, because
        // a failed send may still have partially delivered.
        setSendError(result.message || "Failed to send");
        setStep("preview");
      }
    });
  }

  function handleCancel() {
    stopPolling();
    onDone({ success: false, cancelled: true });
  }

  return (
    <Modal open onClose={handleCancel} title="Send via WhatsApp" width={460} popup={true}>
      {step === "checking" && (
        <div style={{ padding: "24px 4px", textAlign: "center" }}>
          <Spinner label="Checking WhatsApp connection…" />
        </div>
      )}

      {step === "blocked" && (
        <div>
          <p style={{ color: C.red, marginBottom: 16, fontSize: 14 }}>{blockedMsg}</p>
          <p style={{ color: C.muted, marginBottom: 16, fontSize: 13 }}>
            If this keeps happening, ask an admin to check the WhatsApp connection.
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
            This business hasn't linked WhatsApp yet — open WhatsApp on your phone →{" "}
            <b>Settings → Linked Devices → Link a device</b>, then scan this code. It appears
            there as <b>InventraDecent session</b>. This only needs to be done once for the
            whole business.
          </p>
          <div className="wa-actions">
            <Btn variant="ghost" onClick={handleCancel}>Cancel</Btn>
          </div>
        </div>
      )}

      {(step === "preview" || step === "sending" || step === "done") && (
        <div>
          {/* ── message: prefilled with the generated bill text, fully editable ── */}
          <div className="wa-block">
            <div className="wa-label-row">
              <span className="wa-label">Message</span>
              {messageEdited && (
                <button
                  type="button"
                  className="wa-link-btn"
                  disabled={!editable}
                  onClick={() => setMsg(defaultMessage || "")}
                >
                  Reset to default
                </button>
              )}
            </div>
            <textarea
              className="wa-msg-input"
              value={msg}
              disabled={!editable}
              rows={6}
              placeholder="Type the message to send…"
              onChange={(e) => {
                setMsg(e.target.value);
                setSendError("");
              }}
            />
          </div>

          {/* ── attachment: the generated PDF by default, replaceable ── */}
          <div className="wa-block">
            <div className="wa-label-row">
              <span className="wa-label">Attachment</span>
              {attachment && (
                <span style={{ display: "flex", gap: 12 }}>
                  <button
                    type="button"
                    className="wa-link-btn"
                    disabled={!editable}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    className="wa-link-btn wa-link-danger"
                    disabled={!editable}
                    onClick={handleRemoveFile}
                  >
                    Remove
                  </button>
                </span>
              )}
            </div>

            {attachment ? (
              <div className="wa-attach">
                <span>📄</span>
                <span className="wa-attach-name">{attachment.name}</span>
                <span className="wa-attach-size">({formatSize(attachment.blob.size)})</span>
                <span className="wa-attach-spacer" />
                {attachmentChanged && <span className="wa-attach-size">replaced</span>}
              </div>
            ) : (
              <button
                type="button"
                className="wa-attach-empty"
                disabled={!editable}
                onClick={() => fileInputRef.current?.click()}
              >
                + Attach a file
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={handlePickFile}
            />
            {attachError
              ? <div className="wa-error-text">{attachError}</div>
              : <div className="wa-hint">PDF, image or document — up to {formatSize(MAX_FILE_BYTES)}.</div>}
          </div>

          <Field label="Customer's WhatsApp number" required>
            <input
              ref={phoneInputRef}
              type="tel"
              value={phone}
              disabled={!editable}
              placeholder="e.g. 9876543210"
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && editable && handleSend()}
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
 * checks this account's WhatsApp connection, walks through QR pairing inline if
 * the account has never linked a number, then shows the message + attachment —
 * both editable — before actually sending. Nothing goes out until "Send".
 *
 * @param {object} p
 * @param {string} [p.phone]           - customer phone, prefilled in the preview step (still editable)
 * @param {string} p.billNo            - bill number (used in the pay link + message)
 * @param {number} p.amount            - final bill amount
 * @param {string} [p.customerName]    - shown in the message greeting
 * @param {Blob}   [p.pdfBlob]         - PDF blob from GSTInvoicePrinter (optional; user can replace or remove it)
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
