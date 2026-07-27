const router = require("express").Router();
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");
const loadContext = require("../middleware/loadContext");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");

// Was public (no `auth`) — see the identical note in routes/category.js.
router.use(auth, loadContext, requireActiveSubscription);

// Groups are per-org, with shared system defaults (same convention as
// userrole.account_id — see migrations/005 and 008):
//   org_id IS NULL -> system default ("customer"/"supplier"), visible to every
//                     org, editable/deletable by none.
//   org_id = <id>  -> that org's own custom group.
// `is_system` lets the UI mark them and skip edit/delete. The reports in
// accountReports.js classify accounts by group name, which is why the two
// defaults must stay untouched rather than being each tenant's to rename.
const VISIBLE = "(org_id = ? OR org_id IS NULL)";

// The org's own groups plus the system ones, system first.
const SELECT_LIST = `SELECT id, name, org_id, (org_id IS NULL) AS is_system
                     FROM \`group\` WHERE ${VISIBLE}
                     ORDER BY (org_id IS NULL) DESC, name ASC`;

// Look a group up within what this org may see. Returns undefined when the id
// belongs to another org (indistinguishable from "doesn't exist", by design).
async function findVisible(id, orgId) {
  const [rows] = await pool.query(
    `SELECT id, name, org_id, (org_id IS NULL) AS is_system
     FROM \`group\` WHERE id = ? AND ${VISIBLE}`,
    [id, orgId]
  );
  return rows[0];
}

// Case-insensitive name clash against anything this org can see — its own
// groups or a system default. Keeps a tenant from shadowing "customer" with a
// second row of the same name, which would leave two identical dropdown entries
// and split the accountReports name matching across both.
async function nameTaken(name, orgId, exceptId = null) {
  const [rows] = await pool.query(
    `SELECT id FROM \`group\`
     WHERE LOWER(name) = LOWER(?) AND ${VISIBLE} AND (? IS NULL OR id <> ?)`,
    [name, orgId, exceptId, exceptId]
  );
  return rows.length > 0;
}

// GET /api/groups  — used in customer dropdowns
router.get("/groups/", async (req, res) => {
 // #swagger.tags = ['Groups']
  try {
    const [rows] = await pool.query(SELECT_LIST, [req.ctx.orgId]);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/groups/:id
router.get("/groups/:id", async (req, res) => {
 // #swagger.tags = ['Groups']
  try {
    const row = await findVisible(req.params.id, req.ctx.orgId);
    if (!row) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/groups — always creates a group owned by the caller's org
router.post("/groups/", async (req, res) => {
 // #swagger.tags = ['Groups']
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    if (await nameTaken(name, req.ctx.orgId)) {
      return res.status(409).json({ success: false, message: `A group named "${name}" already exists` });
    }
    const [r] = await pool.query("INSERT INTO `group` (name, org_id) VALUES (?,?)", [name, req.ctx.orgId]);
    res.status(201).json({ success: true, message: "Group created", data: { id: r.insertId, name } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/groups/:id — the org's own groups only; system defaults are read-only
router.put("/groups/:id", async (req, res) => {
 // #swagger.tags = ['Groups']
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const row = await findVisible(req.params.id, req.ctx.orgId);
    if (!row) return res.status(404).json({ success: false, message: "Group not found" });
    if (row.is_system) {
      return res.status(403).json({ success: false, message: "System default groups can't be edited" });
    }
    if (await nameTaken(name, req.ctx.orgId, row.id)) {
      return res.status(409).json({ success: false, message: `A group named "${name}" already exists` });
    }
    // org_id in the predicate as well — belt and braces, so a system row can
    // never be reached even if the check above is ever refactored away.
    const [r] = await pool.query("UPDATE `group` SET name=? WHERE id=? AND org_id=?", [name, row.id, req.ctx.orgId]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true, message: "Group updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/groups/:id — own groups only; system defaults are undeletable
router.delete("/groups/:id", async (req, res) => {
 // #swagger.tags = ['Groups']
  try {
    const row = await findVisible(req.params.id, req.ctx.orgId);
    if (!row) return res.status(404).json({ success: false, message: "Group not found" });
    if (row.is_system) {
      return res.status(403).json({ success: false, message: "System default groups can't be deleted" });
    }
    const [r] = await pool.query("DELETE FROM `group` WHERE id=? AND org_id=?", [row.id, req.ctx.orgId]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Group not found" });
    res.json({ success: true, message: "Group deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
