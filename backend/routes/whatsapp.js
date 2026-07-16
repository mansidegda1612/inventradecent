// ─────────────────────────────────────────────────────────────────────────────
// routes/whatsapp.js
//
// Proxies WhatsApp requests from the frontend to the Go whatsmeow service
// (see /whatsmeow-service). Follows the same pattern as auth.js / transaction.js
// in this project: express Router + AuthMiddleware.
//
// MOUNT IN YOUR SERVER ENTRYPOINT (wherever auth.js / transaction.js are
// mounted, e.g. app.js / server.js):
//
//   app.use("/api/whatsapp/send-media", express.raw({ type: () => true, limit: "20mb" }));
//   // ^ IMPORTANT: /send-media must NOT be parsed by express.json() first —
//   // it's a raw multipart stream being piped straight through to Go.
//   // Mount this whatsapp router BEFORE app.use(express.json()) runs on that
//   // path, or exclude the path from your json/urlencoded body parsers.
//
//   app.use("/api", require("./routes/whatsapp"));
//
// ENV VARS (add to your .env, same file as JWT_SECRET etc.):
//   WA_SERVICE_URL=http://localhost:8081
//   WA_INTERNAL_KEY=some-long-random-shared-secret   (must match Go service's env)
// ─────────────────────────────────────────────────────────────────────────────

const router = require("express").Router();
const http   = require("http");
const { URL } = require("url");
const auth   = require("../middleware/AuthMiddleware");

const WA_SERVICE_URL  = process.env.WA_SERVICE_URL  || "http://localhost:8081";
const WA_INTERNAL_KEY = process.env.WA_INTERNAL_KEY || "change-me-internal-key";

router.use(auth); // every route below requires a valid JWT, same as transaction.js

// Only admins (userrole 1, matching Sidebar.jsx's roles:[1] convention) may
// start/stop the WhatsApp session — sending messages is open to any logged-in
// user, same as the rest of the billing flow.
function requireAdmin(req, res, next) {
  if (req.user?.userrole !== 1) {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
}

async function callWaService(path, method = "GET", body) {
  const res = await fetch(`${WA_SERVICE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": WA_INTERNAL_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// GET /api/whatsapp/status
router.get("/whatsapp/status", async (req, res) => {
  // #swagger.tags = ['WhatsApp']
  try {
    const { status, data } = await callWaService("/session/status");
    res.status(status).json({ success: true, data });
  } catch (e) {
    res.status(502).json({ success: false, message: "WhatsApp service unreachable: " + e.message });
  }
});

// POST /api/whatsapp/session/start
router.post("/whatsapp/session/start", requireAdmin, async (req, res) => {
  // #swagger.tags = ['WhatsApp']
  try {
    const { status, data } = await callWaService("/session/start", "POST", {});
    res.status(status).json({ success: true, data });
  } catch (e) {
    res.status(502).json({ success: false, message: "WhatsApp service unreachable: " + e.message });
  }
});

// POST /api/whatsapp/session/logout
router.post("/whatsapp/session/logout", requireAdmin, async (req, res) => {
  // #swagger.tags = ['WhatsApp']
  try {
    const { status, data } = await callWaService("/session/logout", "POST", {});
    res.status(status).json({ success: true, data });
  } catch (e) {
    res.status(502).json({ success: false, message: "WhatsApp service unreachable: " + e.message });
  }
});

// POST /api/whatsapp/send-text   { phone, message }
router.post("/whatsapp/send-text", async (req, res) => {
  // #swagger.tags = ['WhatsApp']
  const { phone, message } = req.body || {};
  if (!phone || !message) {
    return res.status(400).json({ success: false, message: "phone and message are required" });
  }
  try {
    const { status, data } = await callWaService("/messages/send-text", "POST", { phone, message });
    res.status(status).json({ success: status < 300, data });
  } catch (e) {
    res.status(502).json({ success: false, message: "WhatsApp service unreachable: " + e.message });
  }
});

// POST /api/whatsapp/send-media  — raw multipart proxy (file + phone + caption)
// This one is a plain byte-for-byte pipe to the Go service so we don't have
// to re-implement multipart parsing/re-encoding in Node.
router.post("/whatsapp/send-media", (req, res) => {
  // #swagger.tags = ['WhatsApp']
  const target = new URL(WA_SERVICE_URL + "/messages/send-media");

  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname,
      method: "POST",
      headers: {
        ...req.headers,
        host: target.host,
        "x-internal-key": WA_INTERNAL_KEY,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (e) => {
    res.status(502).json({ success: false, message: "WhatsApp service unreachable: " + e.message });
  });

  req.pipe(proxyReq);
});

module.exports = router;
