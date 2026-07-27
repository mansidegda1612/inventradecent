const express    = require("express");
const cors       = require("cors");
const dotenv     = require("dotenv");
const swaggerUi  = require("swagger-ui-express");
const swaggerDoc = require("./swagger-output.json");

dotenv.config();

// ─── JWT secret validation ──────────────────────────────────────────────────
// Old code fell back to a hardcoded "secret"/"refresh_secret" if the env var
// was unset, which is a token-forgery risk in a multi-tenant world. Refuse to
// boot in production if a real secret isn't set; only warn in dev so a bare
// checkout without a full .env doesn't hard-fail locally.
const WEAK_JWT_SECRETS = new Set(["secret", "refresh_secret", "changeme", "password"]);
function assertStrongSecret(name) {
  const value = process.env[name];
  const weak = !value || value.length < 20 || WEAK_JWT_SECRETS.has(value);
  if (weak && process.env.NODE_ENV === "production") {
    console.error(`Refusing to start: ${name} is missing or too weak for production. Set a strong random value in the environment.`);
    process.exit(1);
  }
  if (weak) {
    console.warn(`Warning: ${name} is missing or weak (only acceptable outside production).`);
  }
}
assertStrongSecret("JWT_SECRET");
assertStrongSecret("JWT_REFRESH_SECRET");

const app = express();
app.use(cors());
// `verify` captures the raw request body onto req.rawBody as a side effect
// of the normal JSON parse — every route still gets req.body as before,
// but routes/billing.js's webhook handler needs the exact raw bytes (not a
// re-serialized JSON.stringify(req.body)) to verify Razorpay's HMAC
// signature correctly.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// ─── Swagger UI  →  http://localhost:5000/api-docs ────────────────────────
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDoc, {
    swaggerOptions: {
      persistAuthorization: true,   // keeps your JWT saved after page refresh
    },
    customSiteTitle: "InventraDecent",
  })
);

// ─── Routes ───────────────────────────────────────────────────────────────
// billing is mounted right after auth, BEFORE account/category/etc. — every
// one of those routers applies a blanket `router.use(auth, ...)` with no
// path restriction, and since they're all mounted at the same generic
// "/api/" prefix, that middleware would otherwise intercept ANY /api/*
// request that reaches it first — including /api/billing/webhook, which
// must stay reachable without a JWT (Razorpay calls it directly). Mounting
// billing.js first means its own specific routes match and respond before
// any later router's auth check gets a chance to run.
//
// platform is mounted here for the same reason: those blanket
// `router.use(auth, requireActiveSubscription)` calls would otherwise run
// against every /api/platform/* request on its way past, and
// requireActiveSubscription rejects a console session (no account_id) outright —
// so the console has to match and respond before any of them is reached.
app.use("/api/",  require("./routes/auth"));
app.use("/api/",  require("./routes/billing"));
app.use("/api/",  require("./routes/platform"));
app.use("/api/",  require("./routes/account"));
app.use("/api/",  require("./routes/category"));
app.use("/api/",  require("./routes/group"));
app.use("/api/",  require("./routes/customer"));
app.use("/api/",  require("./routes/product"));
app.use("/api/",  require("./routes/transaction"));
app.use("/api/",  require("./routes/user"));
app.use("/api/",  require("./routes/userrole"));
app.use("/api/",  require("./routes/dashboard"));
app.use("/api/",  require("./routes/accountReports"));
app.use("/api/",  require("./routes/inventoryReport"));
app.use("/api/",  require("./routes/balanceSheet"));
app.use("/api/",  require("./routes/whatsappRoutes"));
app.use("/api/",  require("./routes/permissions"));
app.use("/api/",  require("./routes/company"));
app.use("/api/",  require("./routes/organization"));
app.use("/api/",  require("./routes/whatsapp"));
app.use(express.json({
       verify: (req) => req.originalUrl.startsWith("/api/whatsapp/send-media"),
     }));
app.use("/uploads", express.static("uploads", {
  setHeaders: (res) => res.setHeader("Access-Control-Allow-Origin", "*"),
}));

// ─── Health Check ─────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ success: true, message: "API running" }));

// ─── 404 ──────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));

// ─── Global Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Internal server error", error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server   → http://localhost:${PORT}`);
  console.log(`API Docs → http://localhost:${PORT}/api-docs`);
});
module.exports = app;
