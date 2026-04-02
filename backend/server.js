const express    = require("express");
const cors       = require("cors");
const dotenv     = require("dotenv");
const swaggerUi  = require("swagger-ui-express");
const swaggerDoc = require("./swagger-output.json");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
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
app.use("/api/",  require("./routes/auth"));
app.use("/api/",  require("./routes/account"));
app.use("/api/",  require("./routes/category"));
app.use("/api/",  require("./routes/group"));
app.use("/api/",  require("./routes/customer"));
app.use("/api/",  require("./routes/product"));
app.use("/api/",  require("./routes/transaction"));
app.use("/api/",  require("./routes/user"));
app.use("/api/",  require("./routes/userrole"));
app.use("/api/",  require("./routes/dashboard"));

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
