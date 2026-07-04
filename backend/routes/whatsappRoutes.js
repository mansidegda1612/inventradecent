// whatsappRoutes.js
// Express route that sends a WhatsApp message (text + UPI link) and a PDF bill
// via the official WhatsApp Business Cloud API (Meta Graph API).
//
// No WhatsApp Web/app window ever opens — the message is delivered directly
// into the customer's WhatsApp chat from the server.
//
// SETUP (.env file):
//   WHATSAPP_TOKEN=EAAxxxx...           <- temporary or permanent access token
//   WHATSAPP_PHONE_NUMBER_ID=1234567890 <- from Meta API Setup page
//   GRAPH_API_VERSION=v20.0
//
// Mount in your main server file:
//   const whatsappRoutes = require("./whatsappRoutes");
//   app.use("/api/whatsapp", whatsappRoutes);
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");

const router = express.Router();

const GRAPH_VERSION = process.env.GRAPH_API_VERSION || "v20.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ── STATIC COMPANY CONFIG ────────────────────────────────────────────────────
// TODO (future scope): pull this from your company-settings table instead.
const COMPANY_CONFIG = {
  name: "Your Company Name",
  upiId: "yourupi@bank",
};

// ── helpers ───────────────────────────────────────────────────────────────

function normalizePhone(phone) {
  let clean = String(phone).replace(/[^\d]/g, "");
  if (clean.length === 10) clean = "91" + clean; // assume India if bare 10-digit
  return clean;
}

function buildUPILink(amount, note = "") {
  const params = new URLSearchParams({
    pa: COMPANY_CONFIG.upiId,
    pn: COMPANY_CONFIG.name,
    am: Number(amount).toFixed(2),
    cu: "INR",
    tn: note || "Payment",
  });
  return `upi://pay?${params.toString()}`;
}

function buildBillMessage({ customerName, billNo, amount }) {
  const link = buildUPILink(amount, billNo);
  return (
    `Hi ${customerName || ""},\n\n` +
    `Your bill from *${COMPANY_CONFIG.name}* is ready.\n` +
    `Bill No: ${billNo}\n` +
    `Amount: ₹${Number(amount).toFixed(2)}\n\n` +
    `Tap below to pay instantly via any UPI app:\n${link}\n\n` +
    `Thank you for your business!`
  );
}

/**
 * Step 1: upload the PDF buffer to Meta, get back a media id.
 * Required before you can attach it to a message.
 */
async function uploadMedia(pdfBuffer, fileName) {
  const form = new FormData();
  form.append("file", pdfBuffer, { filename: fileName, contentType: "application/pdf" });
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");

  const res = await axios.post(
    `${GRAPH_BASE}/${PHONE_NUMBER_ID}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        ...form.getHeaders(),
      },
    }
  );

  return res.data.id; // media_id
}

/**
 * Step 2a: send the PDF as a document message.
 */
async function sendDocumentMessage(to, mediaId, fileName, caption) {
  return axios.post(
    `${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: {
        id: mediaId,
        filename: fileName,
        caption: caption || undefined,
      },
    },
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
}

/**
 * Step 2b: send the text message (bill summary + UPI link) as a separate message.
 * (WhatsApp doesn't support combining a document + long text body in one message,
 * so we send two messages: the PDF, then the text — they land back-to-back.)
 */
async function sendTextMessage(to, body) {
  return axios.post(
    `${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    },
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
}

// ── route ────────────────────────────────────────────────────────────────
// POST /api/whatsapp/send-bill
// body: {
//   phone: "9876543210",
//   customerName: "Ramesh",
//   billNo: "INV-203",
//   amount: 1500.0,
//   pdfBase64: "<base64-encoded PDF, no data: prefix>"   // optional
// }
router.post("/whatsapp/send-bill", async (req, res) => {
  try {
    const { phone, customerName, billNo, amount, pdfBase64 } = req.body;

    if (!phone || !billNo || amount == null) {
      return res.status(400).json({ success: false, message: "phone, billNo, and amount are required" });
    }

    const to = normalizePhone(phone);
    const message = buildBillMessage({ customerName, billNo, amount });

    // If a PDF was provided, upload + send it first
    if (pdfBase64) {
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const mediaId = await uploadMedia(pdfBuffer, `Bill-${billNo}.pdf`);
      await sendDocumentMessage(to, mediaId, `Bill-${billNo}.pdf`);
    }

    // Then send the text message with the bill summary + UPI pay link
    await sendTextMessage(to, message);

    res.json({ success: true, message: "WhatsApp message sent" });
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: "Failed to send WhatsApp message",
      error: err.response?.data || err.message,
    });
  }
});

module.exports = router;
