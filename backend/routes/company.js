const router  = require("express").Router();
const path    = require("path");
const fs      = require("fs");
const multer  = require("multer");
const pool    = require("../config/db");
const auth    = require("../middleware/AuthMiddleware");
const requireRight = require("../middleware/requireRight");

router.use(auth);

// ── logo upload storage ─────────────────────────────────────────────────
// Back to backend-owned storage — writing into the frontend's folder only
// worked because both projects happened to share a disk in local dev. Once
// they're deployed to two different hosts there's no folder to reach into
// at all, so that approach doesn't generalize.
//
// The actual fix for "logo missing from printed PDF" isn't about which
// server stores the file — it's that html2canvas (used by getPDFBlob /
// mobile print) blanks out any image it can't verify as CORS-safe. Two
// things fix that regardless of hosting topology:
//   1. Serve /uploads with Access-Control-Allow-Origin (done in your main
//      server file — see note below).
//   2. Mark the <img> as crossorigin="anonymous" (done in GSTInvoicePrinter's
//      logoHTML() — the exact same pattern already used for the QR code
//      image, which is why THAT one always rendered fine even though it
//      comes from a completely different origin, api.qrserver.com).
//
// Requires `npm install multer`. In your main server file, serve /uploads
// WITH CORS headers so any origin (your frontend, wherever it's deployed)
// can load it cross-origin without tainting the canvas:
//
//   app.use("/uploads", express.static("uploads", {
//     setHeaders: (res) => res.setHeader("Access-Control-Allow-Origin", "*"),
//   }));
//
// Multer doesn't create destination folders on its own — create it once at
// module load so a fresh checkout/server never hits ENOENT.
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "company");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `logo_${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (!/image\/(png|jpe?g|webp|svg\+xml)/.test(file.mimetype))
      return cb(new Error("Only PNG/JPG/WEBP/SVG images are allowed"));
    cb(null, true);
  },
});

async function getOrCreateCompany() {
  const [rows] = await pool.query("SELECT * FROM company ORDER BY id ASC LIMIT 1");
  if (rows.length) return rows[0];
  const [r] = await pool.query("INSERT INTO company (name) VALUES ('My Company')");
  const [rows2] = await pool.query("SELECT * FROM company WHERE id=?", [r.insertId]);
  return rows2[0];
}

// GET /api/company — any logged-in user (needed to print invoices/WhatsApp bills)
router.get("/company", async (req, res) => {
  // #swagger.tags = ['Company']
  try {
    const company = await getOrCreateCompany();
    res.json({ success: true, data: company });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/company — admin only
router.put("/company", requireRight("company.edit"), async (req, res) => {
  // #swagger.tags = ['Company']
  const {
    name, tagline, address, city, phone, email, web, pan, gstin, logo_url,
    bank_name, bank_branch, bank_acc_number, bank_ifsc, upi_id, account_holder,
    terms, financial_year_start,
  } = req.body;
  try {
    const company = await getOrCreateCompany();
    await pool.query(
      `UPDATE company SET
        name=?, tagline=?, address=?, city=?, phone=?, email=?, web=?, pan=?, gstin=?, logo_url=?,
        bank_name=?, bank_branch=?, bank_acc_number=?, bank_ifsc=?, upi_id=?, account_holder=?,
        terms=?, financial_year_start=?
       WHERE id=?`,
      [
        name, tagline, address, city, phone, email, web, pan, gstin, logo_url,
        bank_name, bank_branch, bank_acc_number, bank_ifsc, upi_id, account_holder,
        JSON.stringify(terms || []), financial_year_start || null,
        company.id,
      ]
    );
    res.json({ success: true, message: "Company details updated", data: await getOrCreateCompany() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/company/logo — admin only, multipart/form-data field name "logo"
// Saves the file into frontend/public/uploads/company/ and stores the
// resulting same-origin-from-the-frontend path ("/uploads/company/xxx.png")
// in company.logo_url — that's the path GSTInvoicePrinter/WhatsAppSender read.
router.post("/company/logo", requireRight("company.edit"), upload.single("logo"), async (req, res) => {
  // #swagger.tags = ['Company']
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
  try {
    const company = await getOrCreateCompany();
    const logoUrl = `/uploads/company/${req.file.filename}`;
    await pool.query("UPDATE company SET logo_url=? WHERE id=?", [logoUrl, company.id]);
    res.json({ success: true, message: "Logo updated", data: { logo_url: logoUrl } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;