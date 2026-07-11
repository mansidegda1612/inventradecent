const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const crypto  = require("crypto");
const pool    = require("../config/db");
const auth    = require("../middleware/AuthMiddleware");
const requireRight = require("../middleware/requireRight");

const JWT_SECRET          = process.env.JWT_SECRET          || "secret";
const JWT_EXPIRES_IN      = process.env.JWT_EXPIRES_IN      || "1d";
const JWT_REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET  || "refresh_secret";
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || "7d";

// ── rights helpers ──────────────────────────────────────────────────────
// mysql2 returns JSON columns already parsed, but older rows (or a manual
// edit) might still hold a plain string — handle both without throwing.
function parseRights(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Effective rights = role rights ∪ per-user override rights.
function effectiveRights(roleRights, userRights) {
  return Array.from(new Set([...parseRights(roleRights), ...parseRights(userRights)]));
}

async function loadUserWithRole(id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.user_id, u.userrole, u.rights AS user_rights, u.is_active,
            ur.role AS role_name, ur.rights AS role_rights
     FROM user u LEFT JOIN userrole ur ON u.userrole = ur.id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
}

// POST /api/auth/register
// Locked down: only an existing admin (users.create) can create accounts.
// Public self-registration was a security hole — anyone could pick their
// own userrole and hand themselves admin rights.
router.post("/auth/register", auth, requireRight("users.create"), async (req, res) => {
  // #swagger.tags = ['Auth']
  const { name, user_id, password, userrole } = req.body;
  if (!name || !user_id || !password)
    return res.status(400).json({ success: false, message: "name, user_id and password required" });

  try {
    const [ex] = await pool.query("SELECT id FROM user WHERE user_id = ?", [user_id]);
    if (ex.length) return res.status(409).json({ success: false, message: "user_id already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      "INSERT INTO user (name, user_id, password, userrole, is_active) VALUES (?,?,?,?,1)",
      [name, user_id, hashed, userrole || 1]
    );
    res.status(201).json({ success: true, message: "User registered", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  // #swagger.tags = ['Auth']
  const { user_id, password } = req.body;
  if (!user_id || !password)
    return res.status(400).json({ success: false, message: "user_id and password required" });

  try {
    const [rows] = await pool.query(
      `SELECT u.*, ur.role AS role_name, ur.rights AS role_rights
       FROM user u LEFT JOIN userrole ur ON u.userrole = ur.id
       WHERE u.user_id = ?`,
      [user_id]
    );
    if (!rows.length) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const user = rows[0];
    if (user.is_active === 0)
      return res.status(403).json({ success: false, message: "This account has been disabled" });

    if (!(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const rights = effectiveRights(user.role_rights, user.rights);

    const accessToken = jwt.sign(
      { id: user.id, user_id: user.user_id, userrole: user.userrole, rights },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES });

    await pool.query("UPDATE user SET last_login = NOW() WHERE id = ?", [user.id]);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id, name: user.name, user_id: user.user_id,
          userrole: user.userrole, role_name: user.role_name, rights,
        },
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/auth/me  (protected)
// Frontend calls this on page load/refresh to rehydrate AuthContext from
// the token alone, instead of trusting whatever was last stashed in
// localStorage. Also returns company settings in the same round trip.
router.get("/auth/me", auth, async (req, res) => {
  // #swagger.tags = ['Auth']
  try {
    const user = await loadUserWithRole(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const rights = effectiveRights(user.role_rights, user.user_rights);

    const [companyRows] = await pool.query("SELECT * FROM company ORDER BY id ASC LIMIT 1");

    res.json({
      success: true,
      data: {
        user: {
          id: user.id, name: user.name, user_id: user.user_id,
          userrole: user.userrole, role_name: user.role_name, rights,
        },
        company: companyRows[0] || null,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/auth/logout  (protected)
router.post("/auth/logout", auth, (req, res) => {
  // #swagger.tags = ['Auth']
  res.json({ success: true, message: "Logged out successfully" });
});

// POST /api/auth/refresh-token
router.post("/auth/refresh-token", async (req, res) => {
  // #swagger.tags = ['Auth']
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, message: "Refresh token required" });

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await loadUserWithRole(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: "User not found" });
    if (user.is_active === 0) return res.status(403).json({ success: false, message: "This account has been disabled" });

    const rights = effectiveRights(user.role_rights, user.user_rights);
    const accessToken = jwt.sign(
      { id: user.id, user_id: user.user_id, userrole: user.userrole, rights },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
  }
});

// POST /api/auth/forgot-password
router.post("/auth/forgot-password", async (req, res) => {
  // #swagger.tags = ['Auth']
  const { user_id } = req.body;
  try {
    const [rows] = await pool.query("SELECT id FROM user WHERE user_id = ?", [user_id]);
    if (!rows.length) return res.json({ success: true, message: "If user exists, reset token generated" });

    const token  = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 3600000);
    await pool.query("UPDATE user SET reset_token=?, reset_token_expiry=? WHERE id=?", [token, expiry, rows[0].id]);
    // TODO: send token via email/SMS
    res.json({ success: true, message: "Reset token generated", resetToken: token });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/auth/reset-password/:token
router.post("/auth/reset-password/:token", async (req, res) => {
  // #swagger.tags = ['Auth']
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ success: false, message: "New password required" });
  try {
    const [rows] = await pool.query(
      "SELECT id FROM user WHERE reset_token=? AND reset_token_expiry > NOW()", [req.params.token]
    );
    if (!rows.length) return res.status(400).json({ success: false, message: "Invalid or expired token" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE user SET password=?, reset_token=NULL, reset_token_expiry=NULL WHERE id=?", [hashed, rows[0].id]);
    res.json({ success: true, message: "Password reset successfully" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
