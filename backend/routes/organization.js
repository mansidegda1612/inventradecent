// Lets an account have more than one organization ("business unit") —
// e.g. a shop owner running two separate stores under one subscription.
// Each org gets its own products/customers/transactions (Phase 3 scoping)
// and its own letterhead (Company/Organization Details page).
const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/AuthMiddleware");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");

router.use(auth, requireActiveSubscription);

// GET /api/organizations — every org under this account (not just the ones
// the current user personally has access to — the account owner should see
// the account's whole footprint here; max_orgs is an account-wide limit).
router.get("/organizations", async (req, res) => {
  // #swagger.tags = ['Organizations']
  try {
    const [rows] = await pool.query(
      "SELECT id, name, status, created_at FROM organization WHERE account_id = ? ORDER BY created_at ASC",
      [req.user.aid]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/organizations  { name }
// Creates a new org under the account and grants the creating user access
// to it (their current role) so they can switch straight in and fill out
// its details. Admin-only — same lightweight check as whatsapp.js's
// requireAdmin; there's no dedicated "organizations.create" permission key
// for this yet.
router.post("/organizations", async (req, res) => {
  // #swagger.tags = ['Organizations']
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  if (req.user.userrole !== 1)
    return res.status(403).json({ success: false, message: "Admin access required" });

  try {
    const maxOrgs = req.ctx?.plan?.maxOrgs;
    if (maxOrgs != null) {
      const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM organization WHERE account_id = ?", [req.user.aid]);
      if (cnt >= maxOrgs) {
        return res.status(402).json({
          success: false,
          code: "ORG_LIMIT_REACHED",
          message: `Your plan (${req.ctx.plan.name}) allows up to ${maxOrgs} organization(s). Upgrade to add more.`,
          data: { max: maxOrgs },
        });
      }
    }

    const [r] = await pool.query(
      "INSERT INTO organization (account_id, name, status) VALUES (?,?,'active')",
      [req.user.aid, name]
    );
    await pool.query(
      "INSERT INTO user_org_access (user_id, org_id, userrole) VALUES (?,?,?)",
      [req.user.id, r.insertId, req.user.userrole]
    );
    res.status(201).json({ success: true, message: "Organization created", data: { id: r.insertId, name } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
