const router = require("express").Router();
const bcrypt = require("bcryptjs");
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");
const requireRight = require("../middleware/requireRight");

router.use(auth);

// GET /api/users  — list all users (admin screen)
router.get("/users/", requireRight("users.view"), async (req, res) => {
  // #swagger.tags = ['Users']
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.user_id, u.name, u.userrole, u.rights, u.is_active, u.last_login,
              ur.role AS role_name
       FROM user u LEFT JOIN userrole ur ON u.userrole = ur.id
       ORDER BY u.name ASC`
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
       WHERE u.id=?`,
      [req.params.id]
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
    const [ex] = await pool.query("SELECT id FROM user WHERE user_id=?", [user_id]);
    if (ex.length) return res.status(409).json({ success: false, message: "user_id already exists" });

    const [r] = await pool.query(
      "INSERT INTO user (name, user_id, password, userrole, rights, is_active) VALUES (?,?,?,?,?,?)",
      [
        name, user_id, await bcrypt.hash(password, 10), userrole || 1,
        rights && rights.length ? JSON.stringify(rights) : null,
        is_active === false ? 0 : 1,
      ]
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

    const [r] = await pool.query(
      "UPDATE user SET name=?, user_id=?, userrole=?, rights=?, is_active=? WHERE id=?",
      [
        name, user_id, userrole || 1,
        rights && rights.length ? JSON.stringify(rights) : null,
        is_active === false ? 0 : 1,
        req.params.id,
      ]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "User not found" });
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
    await pool.query("UPDATE user SET password=? WHERE id=?", [await bcrypt.hash(newPassword, 10), req.params.id]);
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
    const [r] = await pool.query("DELETE FROM user WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "User deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
