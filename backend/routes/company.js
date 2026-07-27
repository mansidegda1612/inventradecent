const router  = require("express").Router();
const path    = require("path");
const fs      = require("fs");
const multer  = require("multer");
const pool    = require("../config/db");
const auth    = require("../middleware/AuthMiddleware");
const requireRight = require("../middleware/requireRight");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");

router.use(auth, requireActiveSubscription);

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

// Company settings are per-org now (organization + organization_bank),
// not the old single global `company` row every tenant used to share.
// The API shape below is kept identical to what it always was — flat
// fields, `terms` as an array — so CompanyMaster.jsx needed zero changes;
// only where this data actually lives changed.
async function getOrgCompany(orgId) {
  const [rows] = await pool.query(
    `SELECT o.name, o.tagline, o.address, o.city, o.phone, o.email, o.web, o.pan, o.gstin, o.logo_url,
            o.invoice_terms AS terms, o.financial_year_start,
            ob.bank_name, ob.branch AS bank_branch, ob.acc_number AS bank_acc_number,
            ob.ifsc AS bank_ifsc, ob.upi_id, ob.account_holder
     FROM organization o
     LEFT JOIN organization_bank ob ON ob.org_id = o.id AND ob.is_default = 1
     WHERE o.id = ?`,
    [orgId]
  );
  return rows[0] || null;
}

// GET /api/company — any logged-in user (needed to print invoices/WhatsApp bills)
router.get("/company", async (req, res) => {
  // #swagger.tags = ['Company']
  try {
    const company = await getOrgCompany(req.user.oid);
    if (!company) return res.status(404).json({ success: false, message: "Organization not found" });
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
    await pool.query(
      `UPDATE organization SET
        name=?, tagline=?, address=?, city=?, phone=?, email=?, web=?, pan=?, gstin=?, logo_url=?,
        invoice_terms=?, financial_year_start=?
       WHERE id=?`,
      [
        name, tagline, address, city, phone, email, web, pan, gstin, logo_url,
        JSON.stringify(terms || []), financial_year_start || null,
        req.user.oid,
      ]
    );

    const [existingBank] = await pool.query(
      "SELECT id FROM organization_bank WHERE org_id=? AND is_default=1", [req.user.oid]
    );
    if (existingBank.length) {
      await pool.query(
        `UPDATE organization_bank SET bank_name=?, branch=?, acc_number=?, ifsc=?, upi_id=?, account_holder=?
         WHERE id=?`,
        [bank_name, bank_branch, bank_acc_number, bank_ifsc, upi_id, account_holder, existingBank[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO organization_bank (org_id, bank_name, branch, acc_number, ifsc, upi_id, account_holder, is_default)
         VALUES (?,?,?,?,?,?,?,1)`,
        [req.user.oid, bank_name, bank_branch, bank_acc_number, bank_ifsc, upi_id, account_holder]
      );
    }

    res.json({ success: true, message: "Company details updated", data: await getOrgCompany(req.user.oid) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/company/logo — admin only, multipart/form-data field name "logo"
router.post("/company/logo", requireRight("company.edit"), upload.single("logo"), async (req, res) => {
  // #swagger.tags = ['Company']
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
  try {
    const logoUrl = `/uploads/company/${req.file.filename}`;
    await pool.query("UPDATE organization SET logo_url=? WHERE id=?", [logoUrl, req.user.oid]);
    res.json({ success: true, message: "Logo updated", data: { logo_url: logoUrl } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
