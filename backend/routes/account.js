
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const pool   = require("../config/db");
const auth   = require("../middleware/AuthMiddleware");

router.use(auth);

// GET /api/account/profile
router.get("/account/profile", async (req, res) => {
 // #swagger.tags = ['Account']
  try {
    const [rows] = await pool.query(
      "SELECT u.id, u.user_id, u.name, u.userrole, u.rights, ur.role AS role_name FROM user u LEFT JOIN userrole ur ON u.userrole = ur.id WHERE u.id = ?",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/account/profile
router.put("/account/profile", async (req, res) => {
 // #swagger.tags = ['Account']
  const { name, user_id, rights } = req.body;
  if (!name && !user_id && !rights)
    return res.status(400).json({ success: false, message: "Nothing to update" });

  try {
    if (user_id) {
      const [ex] = await pool.query("SELECT id FROM user WHERE user_id=? AND id!=?", [user_id, req.user.id]);
      if (ex.length) return res.status(409).json({ success: false, message: "user_id already taken" });
    }
    const fields = [], vals = [];
    if (name)   { fields.push("name=?");   vals.push(name); }
    if (user_id) { fields.push("user_id=?"); vals.push(user_id); }
    if (rights) { fields.push("rights=?"); vals.push(rights); }
    vals.push(req.user.id);
    await pool.query(`UPDATE user SET ${fields.join(",")} WHERE id=?`, vals);
    res.json({ success: true, message: "Profile updated" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/account/change-password
router.put("/account/change-password", async (req, res) => {
 // #swagger.tags = ['Account']
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ success: false, message: "Both current and new password required" });
  try {
    const [rows] = await pool.query("SELECT password FROM user WHERE id=?", [req.user.id]);
    if (!(await bcrypt.compare(currentPassword, rows[0].password)))
      return res.status(401).json({ success: false, message: "Current password is wrong" });

    await pool.query("UPDATE user SET password=? WHERE id=?", [await bcrypt.hash(newPassword, 10), req.user.id]);
    res.json({ success: true, message: "Password changed" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/account/delete
router.delete("/account/delete", async (req, res) => {
 // #swagger.tags = ['Account']
  try {
    await pool.query("DELETE FROM user WHERE id=?", [req.user.id]);
    res.json({ success: true, message: "Account deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
