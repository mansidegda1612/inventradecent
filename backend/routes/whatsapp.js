// ─────────────────────────────────────────────────────────────────────────────
// routes/whatsapp.js
//
// Proxies WhatsApp requests from the frontend to the Go whatsmeow service
// (see /whatsmeow-service). Follows the same pattern as auth.js / transaction.js
// in this project: express Router + AuthMiddleware.
//
// MULTI-TENANT: the WhatsApp number is scoped to the ACCOUNT. Every call to the
// Go service carries X-Tenant-Id = the account id, taken from the verified JWT
// (req.user.aid) and NEVER from the request body/query/headers — the same rule
// middleware/loadContext.js documents for org_id. A client that could choose
// its own tenant id could send from another business's WhatsApp number.
//
// MOUNT IN YOUR SERVER ENTRYPOINT (already done in server.js):
//
//   app.use("/api", require("./routes/whatsapp"));
//
//   /whatsapp/send-media is piped through as raw bytes. That works with the
//   global express.json()/urlencoded() in server.js because both skip
//   multipart/form-data bodies, leaving the stream unread for req.pipe() below.
//   Don't add a body parser that touches multipart on this path.
//
// ENV VARS (add to your .env, same file as JWT_SECRET etc.):
//   WA_SERVICE_URL=http://localhost:8081
//   WA_INTERNAL_KEY=some-long-random-shared-secret   (must match Go service's env)
//   WA_SERVICE_TIMEOUT_MS=8000                       (optional)
// ─────────────────────────────────────────────────────────────────────────────

const router = require("express").Router();
const http = require("http");
const https = require("https");
const { URL } = require("url");
const auth = require("../middleware/AuthMiddleware");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");
const { requireFeature } = require("../middleware/requireFeature");

const WA_SERVICE_URL = process.env.WA_SERVICE_URL || "http://localhost:8081";
const WA_INTERNAL_KEY = process.env.WA_INTERNAL_KEY || "change-me-internal-key";

// Short on purpose. These are localhost calls to a Go service that either
// answers in milliseconds or is broken; waiting 60s to find that out is how a
// user ends up staring at a spinner. Sending media gets a longer budget since
// it uploads a file to WhatsApp's servers.
const WA_TIMEOUT_MS = Number(process.env.WA_SERVICE_TIMEOUT_MS) || 8000;
const WA_MEDIA_TIMEOUT_MS = Number(process.env.WA_MEDIA_TIMEOUT_MS) || 60000;

// Machine-readable code the frontend keys off to STOP retrying. Any human-
// readable message can change; this must not.
const SERVICE_DOWN = "WA_SERVICE_DOWN";

// Every route below requires a valid JWT, an active subscription (or a
// trial/comped account, which counts as unrestricted — see
// requireActiveSubscription.js), and a plan that includes the "whatsapp"
// feature. A Starter account gets 402 UPGRADE_REQUIRED and never reaches
// the Go service.
router.use(auth, requireActiveSubscription, requireFeature("whatsapp"));

// Resolves the tenant for every WhatsApp call: the account id off the verified
// JWT. One account = one linked WhatsApp number, shared by all of that
// account's users and organizations.
function requireAccount(req, res, next) {
  const accountId = req.user?.aid;
  if (accountId === undefined || accountId === null || accountId === "") {
    return res.status(403).json({
      success: false,
      message: "No account on this session — sign in again",
    });
  }
  req.waTenantId = String(accountId);
  next();
}
router.use(requireAccount);

// Only admins (userrole 1, matching Sidebar.jsx's roles:[1] convention) may
// start/stop the WhatsApp session — sending messages is open to any logged-in
// user, same as the rest of the billing flow.
function requireAdmin(req, res, next) {
  if (req.user?.userrole !== 1) {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
}

async function callWaService(tenantId, path, method = "GET", body) {
  const res = await fetch(`${WA_SERVICE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": WA_INTERNAL_KEY,
      "X-Tenant-Id": tenantId,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Without this, a Go service that accepts the TCP connection but never
    // answers (hung, mid-restart, deadlocked) leaves this request open until
    // the OS gives up — minutes of the user watching a spinner.
    signal: AbortSignal.timeout(WA_TIMEOUT_MS),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

// One place that turns "couldn't reach the Go service" into a response the
// frontend can act on definitively. 503 + code:WA_SERVICE_DOWN means "stop,
// tell the user, do not poll" — as opposed to a 409 (not linked yet, show the
// QR) or a 502 (WhatsApp itself rejected the send, worth showing verbatim).
function serviceDown(res, err) {
  const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
  console.error("WhatsApp service unreachable:", err?.message || err);
  return res.status(503).json({
    success: false,
    code: SERVICE_DOWN,
    message: timedOut
      ? "WhatsApp service is not responding. Please try again in a moment or contact support."
      : "WhatsApp service is unreachable. Please try again in a moment or contact support.",
  });
}

// GET /api/whatsapp/status
router.get("/whatsapp/status", async (req, res) => {
  // #swagger.tags = ['WhatsApp']
  try {
    const { status, data } = await callWaService(req.waTenantId, "/session/status");
    res.status(status).json({ success: status < 300, data });
  } catch (e) {
    serviceDown(res, e);
  }
});

// POST /api/whatsapp/session/start
router.post("/whatsapp/session/start", requireAdmin, async (req, res) => {
  // #swagger.tags = ['WhatsApp']
  try {
    const { status, data } = await callWaService(req.waTenantId, "/session/start", "POST", {});
    res.status(status).json({ success: status < 300, data });
  } catch (e) {
    serviceDown(res, e);
  }
});

// POST /api/whatsapp/session/logout
router.post("/whatsapp/session/logout", requireAdmin, async (req, res) => {
  // #swagger.tags = ['WhatsApp']
  try {
    const { status, data } = await callWaService(req.waTenantId, "/session/logout", "POST", {});
    res.status(status).json({ success: status < 300, data });
  } catch (e) {
    serviceDown(res, e);
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
    const { status, data } = await callWaService(req.waTenantId, "/messages/send-text", "POST", { phone, message });
    res.status(status).json({ success: status < 300, data });
  } catch (e) {
    serviceDown(res, e);
  }
});

// POST /api/whatsapp/send-media  — raw multipart proxy (file + phone + caption)
// This one is a plain byte-for-byte pipe to the Go service so we don't have
// to re-implement multipart parsing/re-encoding in Node.
router.post("/whatsapp/send-media", (req, res) => {
  // #swagger.tags = ['WhatsApp']
  const target = new URL(WA_SERVICE_URL + "/messages/send-media");
  const isHttps = target.protocol === "https:";
  const transport = isHttps ? https : http;

  // Forward ONLY what the multipart body needs, plus our own auth/tenant
  // headers. Spreading req.headers here would let a client smuggle its own
  // x-tenant-id or x-internal-key through to the Go service.
  const headers = {
    "X-Internal-Key": WA_INTERNAL_KEY,
    "X-Tenant-Id": req.waTenantId,
  };
  if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];
  if (req.headers["content-length"]) headers["Content-Length"] = req.headers["content-length"];

  let settled = false;
  const fail = (err) => {
    if (settled) return;
    settled = true;
    serviceDown(res, err);
  };

  const proxyReq = transport.request(
    {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname,
      method: "POST",
      headers,
    },
    (proxyRes) => {
      settled = true;
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.setTimeout(WA_MEDIA_TIMEOUT_MS, () => {
    proxyReq.destroy(new Error(`no response within ${WA_MEDIA_TIMEOUT_MS}ms`));
  });
  proxyReq.on("error", fail);
  // If the browser aborts mid-upload, don't leave the socket to the Go service
  // dangling.
  req.on("aborted", () => proxyReq.destroy());

  req.pipe(proxyReq);
});

module.exports = router;
