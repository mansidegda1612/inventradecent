const router = require("express").Router();
const bcrypt = require("bcryptjs");
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");
const requireRight = require("../middleware/requireRight");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");

router.use(auth, requireActiveSubscription);

// GET /api/users  — list all users (admin screen)
// NOTE: previously unscoped by account — every tenant's users were visible
// to any logged-in user. Fixed alongside the max_users work below, since
// that needed an account-scoped count anyway.
router.get("/users/", requireRight("users.view"), async (req, res) => {
  // #swagger.tags = ['Users']
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.user_id, u.name, u.userrole, u.rights, u.is_active, u.last_login,
              ur.role AS role_name
       FROM user u LEFT JOIN userrole ur ON u.userrole = ur.id
       WHERE u.account_id = ?
       ORDER BY u.name ASC`,
      [req.user.aid]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/users/:id  — includes the role's own rights too, so the edit
// form can show "extra rights on top of <role>" clearly.
router.get("/users/:id", requireRight("users.view"), async (req, res) => {
  // #swagger.tags = ['Users']
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.user_id, u.name, u.userrole, u.rights, u.is_active, u.last_login,
              ur.role AS role_name, ur.rights AS role_rights
       FROM user u LEFT JOIN userrole ur ON u.userrole = ur.id
       WHERE u.id=? AND u.account_id=?`,
      [req.params.id, req.user.aid]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/users  — admin creates a user
router.post("/users/", requireRight("users.create"), async (req, res) => {
  // #swagger.tags = ['Users']
  const { name, user_id, password, userrole, rights, is_active } = req.body;
  if (!name || !user_id || !password)
    return res.status(400).json({ success: false, message: "name, user_id and password required" });
  try {
    const maxUsers = req.ctx?.plan?.maxUsers;
    if (maxUsers != null) {
      const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM user WHERE account_id = ?", [req.user.aid]);
      if (cnt >= maxUsers) {
        return res.status(402).json({
          success: false,
          code: "USER_LIMIT_REACHED",
          message: `Your plan (${req.ctx.plan.name}) allows up to ${maxUsers} user(s). Upgrade to add more.`,
          data: { max: maxUsers },
        });
      }
    }

    const [ex] = await pool.query("SELECT id FROM user WHERE user_id=?", [user_id]);
    if (ex.length) return res.status(409).json({ success: false, message: "user_id already exists" });

    const role = userrole || 1;
    // The role must be a system role or one this account owns — otherwise a
    // tenant could assign another tenant's role id by tampering with the body.
    const [okRole] = await pool.query(
      "SELECT id FROM userrole WHERE id=? AND (account_id=? OR account_id IS NULL)", [role, req.user.aid]
    );
    if (!okRole.length) return res.status(400).json({ success: false, message: "Invalid role" });

    const [r] = await pool.query(
      "INSERT INTO user (name, user_id, password, userrole, rights, is_active, account_id) VALUES (?,?,?,?,?,?,?)",
      [
        name, user_id, await bcrypt.hash(password, 10), role,
        rights && rights.length ? JSON.stringify(rights) : null,
        is_active === false ? 0 : 1,
        req.user.aid,
      ]
    );
    // New teammates get access to the creating admin's current org. Access
    // to additional orgs is a separate concern (no UI for it yet).
    await pool.query(
      "INSERT INTO user_org_access (user_id, org_id, userrole) VALUES (?,?,?)",
      [r.insertId, req.user.oid, role]
    );
    res.status(201).json({ success: true, message: "User created", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/users/:id  — admin updates a user (name, role, extra rights, active flag)
router.put("/users/:id", requireRight("users.edit"), async (req, res) => {
  // #swagger.tags = ['Users']
  const { name, user_id, userrole, rights, is_active } = req.body;
  if (!name || !user_id) return res.status(400).json({ success: false, message: "name and user_id required" });
  try {
    const [ex] = await pool.query("SELECT id FROM user WHERE user_id=? AND id!=?", [user_id, req.params.id]);
    if (ex.length) return res.status(409).json({ success: false, message: "user_id already taken" });

    const role = userrole || 1;
    const [okRole] = await pool.query(
      "SELECT id FROM userrole WHERE id=? AND (account_id=? OR account_id IS NULL)", [role, req.user.aid]
    );
    if (!okRole.length) return res.status(400).json({ success: false, message: "Invalid role" });

    const [r] = await pool.query(
      "UPDATE user SET name=?, user_id=?, userrole=?, rights=?, is_active=? WHERE id=? AND account_id=?",
      [
        name, user_id, role,
        rights && rights.length ? JSON.stringify(rights) : null,
        is_active === false ? 0 : 1,
        req.params.id, req.user.aid,
      ]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "User not found" });

    // Keep every org this user has access to in sync with the role just set
    // above — login/switch-org read the role from user_org_access, not from
    // `user.userrole`, so without this an edited role would silently not
    // take effect until someone manually re-granted org access.
    await pool.query("UPDATE user_org_access SET userrole=? WHERE user_id=?", [role, req.params.id]);

    res.json({ success: true, message: "User updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PATCH /api/users/:id/reset-password  — admin resets another user's password
router.patch("/users/:id/reset-password", requireRight("users.edit"), async (req, res) => {
  // #swagger.tags = ['Users']
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ success: false, message: "newPassword required" });
  try {
    const [r] = await pool.query(
      "UPDATE user SET password=? WHERE id=? AND account_id=?",
      [await bcrypt.hash(newPassword, 10), req.params.id, req.user.aid]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "Password reset" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/users/:id
router.delete("/users/:id", requireRight("users.delete"), async (req, res) => {
  // #swagger.tags = ['Users']
  if (req.params.id == req.user.id)
    return res.status(400).json({ success: false, message: "Cannot delete your own account from here" });
  try {
    const [r] = await pool.query("DELETE FROM user WHERE id=? AND account_id=?", [req.params.id, req.user.aid]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "User not found" });
    await pool.query("DELETE FROM user_org_access WHERE user_id=?", [req.params.id]);
    res.json({ success: true, message: "User deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
