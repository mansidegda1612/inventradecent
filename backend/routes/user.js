const router = require("express").Router();
const bcrypt = require("bcryptjs");
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

router.use(auth);

// GET /api/users  — list all users (admin screen)
router.get("/users/", async (req, res) => {
 // #swagger.tags = ['Users']
  try {
    const [rows] = await pool.query(
      "SELECT u.id, u.userid, u.name, u.userrole, u.rights, ur.role AS role_name FROM user u LEFT JOIN userrole ur ON u.userrole=ur.id ORDER BY u.name ASC"
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/users/:id
router.get("/users/:id", async (req, res) => {
 // #swagger.tags = ['Users']
  try {
    const [rows] = await pool.query(
      "SELECT u.id, u.userid, u.name, u.userrole, u.rights, ur.role AS role_name FROM user u LEFT JOIN userrole ur ON u.userrole=ur.id WHERE u.id=?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/users  — admin creates a user
router.post("/users/", async (req, res) => {
 // #swagger.tags = ['Users']
  const { name, userid, password, userrole, rights } = req.body;
  if (!name || !userid || !password)
    return res.status(400).json({ success: false, message: "name, userid and password required" });
  try {
    const [ex] = await pool.query("SELECT id FROM user WHERE userid=?", [userid]);
    if (ex.length) return res.status(409).json({ success: false, message: "userid already exists" });

    const [r] = await pool.query(
      "INSERT INTO user (name, userid, password, userrole, rights) VALUES (?,?,?,?,?)",
      [name, userid, await bcrypt.hash(password, 10), userrole||1, rights||null]
    );
    res.status(201).json({ success: true, message: "User created", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/users/:id  — admin updates a user
router.put("/users/:id", async (req, res) => {
 // #swagger.tags = ['Users']
  const { name, userid, userrole, rights } = req.body;
  if (!name || !userid) return res.status(400).json({ success: false, message: "name and userid required" });
  try {
    const [ex] = await pool.query("SELECT id FROM user WHERE userid=? AND id!=?", [userid, req.params.id]);
    if (ex.length) return res.status(409).json({ success: false, message: "userid already taken" });

    const [r] = await pool.query(
      "UPDATE user SET name=?, userid=?, userrole=?, rights=? WHERE id=?",
      [name, userid, userrole||1, rights||null, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "User updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PATCH /api/users/:id/reset-password  — admin resets another user's password
router.patch("/users/:id/reset-password", async (req, res) => {
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
router.delete("/users/:id", async (req, res) => {
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
