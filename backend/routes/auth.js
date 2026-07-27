const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const crypto  = require("crypto");
const rateLimit = require("express-rate-limit");
const pool    = require("../config/db");
const auth    = require("../middleware/AuthMiddleware");
const requireRight = require("../middleware/requireRight");
const requireActiveSubscription = require("../middleware/requireActiveSubscription");
const { sendMail } = require("../utils/mailer");
const { computeEffectiveStatus } = require("../utils/subscriptionStatus");
const { idsToKeys } = require("../utils/permissionCatalog");

// 10 attempts per 15 minutes per IP — generous enough for real users retyping
// a password, tight enough to blunt brute-force/credential-stuffing attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
});

const JWT_SECRET          = process.env.JWT_SECRET;
const JWT_EXPIRES_IN      = process.env.JWT_EXPIRES_IN      || "1d";
const JWT_REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET;
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

// Effective rights = union of every rights source passed in (role rights,
// per-user override rights, per-org-access override rights). Each source is
// a JSON array of permission IDs (plus the "*" sentinel on the admin role);
// resolve them to the stable perm_key strings the rest of the app checks
// against (requireRight / frontend hasRight). "*" short-circuits to itself.
async function effectiveRights(...sources) {
  const ids = sources.flatMap(parseRights);
  const keys = await idsToKeys(ids);
  return Array.from(new Set(keys));
}

async function loadUserWithRole(id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.user_id, u.email, u.userrole, u.rights AS user_rights,
            u.is_active, u.account_id, u.is_platform_admin,
            ur.role AS role_name, ur.rights AS role_rights
     FROM user u LEFT JOIN userrole ur ON u.userrole = ur.id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
}

// `identifier` can be either the email (stored in user_id — signup uses the
// email as the login id) or the phone number collected at signup.
async function loadUserByLoginId(identifier) {
  const [rows] = await pool.query(
    `SELECT u.*, u.rights AS user_rights,
            ur.role AS role_name, ur.rights AS role_rights
     FROM user u LEFT JOIN userrole ur ON u.userrole = ur.id
     WHERE u.user_id = ? OR u.phone = ?`,
    [identifier, identifier]
  );
  return rows[0] || null;
}

// Every org a user can open, with the role + rights that apply in each org.
async function loadUserOrgs(userId) {
  const [rows] = await pool.query(
    `SELECT uoa.org_id, uoa.userrole, uoa.rights AS org_rights,
            o.name AS org_name,
            ur.role AS role_name, ur.rights AS role_rights
     FROM user_org_access uoa
     JOIN organization o ON o.id = uoa.org_id
     LEFT JOIN userrole ur ON ur.id = uoa.userrole
     WHERE uoa.user_id = ?`,
    [userId]
  );
  return rows;
}

// So the frontend can show a trial countdown / upgrade banner without a
// separate round trip — same effective-status logic the
// requireActiveSubscription middleware enforces with.
async function loadSubscription(accountId) {
  const [rows] = await pool.query(
    `SELECT s.*, p.name AS plan_name, p.max_orgs, p.max_users, p.features
     FROM subscription s LEFT JOIN plan p ON p.id = s.plan_id
     WHERE s.account_id = ?`,
    [accountId]
  );
  const sub = rows[0] || null;
  return {
    status: computeEffectiveStatus(sub),
    trial_ends_at: sub?.trial_ends_at || null,
    current_period_end: sub?.current_period_end || null,
    // null when no real plan is attached yet (trial/comped) — unrestricted,
    // same convention as req.ctx.plan in requireActiveSubscription.js.
    plan: sub?.plan_id
      ? { name: sub.plan_name, maxOrgs: sub.max_orgs, maxUsers: sub.max_users, features: sub.features || {} }
      : null,
  };
}

// ── platform admin (the SaaS owner) ─────────────────────────────────────────
// A platform admin sits outside the tenant model entirely: account_id NULL, no
// user_org_access rows, no subscription. Every token-minting path below rejects
// a user with no org ("This user has no organization access"), so each one needs
// this branch or the owner simply can't sign in.
//
// rights is [] on purpose, not ["*"]: if the tenant UI were ever rendered for
// this session by mistake, every page would be denied rather than fully open.
// The console authorises off `padmin` alone, via requirePlatformAdmin.
function platformAdminPayload(user) {
  return {
    id: user.id, user_id: user.user_id, userrole: null, rights: [],
    aid: null, oid: null, role: null, padmin: true,
  };
}

function platformAdminSession(user) {
  return {
    user: {
      id: user.id, name: user.name, user_id: user.user_id,
      userrole: null, role_name: "Platform Admin", rights: [], padmin: true,
    },
    org: null, orgs: [], subscription: null, platform: true,
  };
}

// Builds the JWT payload (Section 5.4: aid/oid/role/padmin, alongside the
// existing id/user_id/rights fields other routes already depend on — see
// req.user.id in account.js/transaction.js/user.js and req.user.rights in
// requireRight.js) and the effective rights for one user in one org.
async function buildOrgContext(user, orgAccess) {
  const rights = await effectiveRights(orgAccess.role_rights, user.user_rights, orgAccess.org_rights);
  const payload = {
    id: user.id, user_id: user.user_id, userrole: orgAccess.userrole, rights,
    aid: user.account_id, oid: orgAccess.org_id, role: orgAccess.userrole,
    padmin: !!user.is_platform_admin,
  };
  return { payload, rights };
}

// POST /api/auth/register
// Locked down: only an existing admin (users.create) can create accounts.
// Public self-registration was a security hole — anyone could pick their
// own userrole and hand themselves admin rights.
router.post("/auth/register", auth, requireActiveSubscription, requireRight("users.create"), async (req, res) => {
  // #swagger.tags = ['Auth']
  const { name, user_id, password, userrole } = req.body;
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

    const [ex] = await pool.query("SELECT id FROM user WHERE user_id = ?", [user_id]);
    if (ex.length) return res.status(409).json({ success: false, message: "user_id already exists" });

    const role = userrole || 1;
    // Role must be a system role or one this account owns (see routes/user.js).
    const [okRole] = await pool.query(
      "SELECT id FROM userrole WHERE id=? AND (account_id=? OR account_id IS NULL)", [role, req.user.aid]
    );
    if (!okRole.length) return res.status(400).json({ success: false, message: "Invalid role" });

    const hashed = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      "INSERT INTO user (name, user_id, password, userrole, is_active, account_id) VALUES (?,?,?,?,1,?)",
      [name, user_id, hashed, role, req.user.aid]
    );
    // Grant the new user access to the creating admin's current org — same
    // pattern as routes/user.js's POST /users, which is the endpoint the
    // frontend actually calls; kept here too since this route is still
    // reachable directly.
    await pool.query(
      "INSERT INTO user_org_access (user_id, org_id, userrole) VALUES (?,?,?)",
      [r.insertId, req.user.oid, role]
    );
    res.status(201).json({ success: true, message: "User registered", data: { id: r.insertId } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Welcome email sent right after a successful signup — product overview
// plus the trial expiry date when the new account is on a trial (it always
// is, today, but this stays correct if a future signup flow ever skips the
// trial e.g. a comped/invited account).
function buildWelcomeEmail({ name, businessName, trialEndsAt }) {
  const trialLine = trialEndsAt
    ? `\nYou're on a free trial through ${new Date(trialEndsAt).toDateString()} — explore everything risk-free, no card required.\n`
    : "";
  return {
    subject: "Welcome to InventraDecent!",
    text:
      `Hi ${name},\n\n` +
      `Welcome to InventraDecent — your GST-ready inventory & accounting platform!\n\n` +
      `Your business "${businessName}" is all set up. Here's what you can do:\n` +
      `  - Manage products, stock, and barcodes\n` +
      `  - Create GST-compliant sales & purchase invoices\n` +
      `  - Track customer/supplier ledgers and outstanding balances\n` +
      `  - Send bills directly over WhatsApp\n` +
      `  - Get real-time inventory and financial reports\n` +
      trialLine +
      `\nLog in anytime with the email or phone number you signed up with.\n\n` +
      `Thanks for choosing InventraDecent!\n`,
  };
}

// POST /api/auth/signup — public: creates a brand-new Account + owner User +
// first Organization + trialing Subscription, all in one transaction.
router.post("/auth/signup", authLimiter, async (req, res) => {
  // #swagger.tags = ['Auth']
  const { name, email, phone, password, business_name } = req.body;
  if (!name || !email || !phone || !password || !business_name)
    return res.status(400).json({ success: false, message: "name, email, phone, password and business_name are required" });

  try {
    const [existingAccount] = await pool.query("SELECT id FROM account WHERE owner_email = ?", [email]);
    if (existingAccount.length)
      return res.status(409).json({ success: false, message: "An account with this email already exists" });

    const [existingUser] = await pool.query("SELECT id FROM user WHERE user_id = ?", [email]);
    if (existingUser.length)
      return res.status(409).json({ success: false, message: "An account with this email already exists" });

    const [existingPhone] = await pool.query("SELECT id FROM user WHERE phone = ?", [phone]);
    if (existingPhone.length)
      return res.status(409).json({ success: false, message: "An account with this phone number already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const trialDays = parseInt(process.env.TRIAL_DAYS, 10) || 14;
    const OWNER_ROLE_ID = 1; // seeded "admin" role — rights = ["*"]

    const conn = await pool.getConnection();
    let userId, orgId;
    try {
      await conn.beginTransaction();

      const [accountResult] = await conn.query(
        "INSERT INTO account (name, owner_email, status) VALUES (?,?,'active')",
        [business_name, email]
      );
      const accountId = accountResult.insertId;

      const [userResult] = await conn.query(
        `INSERT INTO user (user_id, email, phone, password, name, userrole, is_active, account_id)
         VALUES (?,?,?,?,?,?,1,?)`,
        [email, email, phone, hashed, name, OWNER_ROLE_ID, accountId]
      );
      userId = userResult.insertId;

      const [orgResult] = await conn.query(
        "INSERT INTO organization (account_id, name, status) VALUES (?,?,'active')",
        [accountId, business_name]
      );
      orgId = orgResult.insertId;

      await conn.query(
        `INSERT INTO subscription (account_id, plan_id, status, trial_ends_at)
         VALUES (?, NULL, 'trialing', DATE_ADD(NOW(), INTERVAL ? DAY))`,
        [accountId, trialDays]
      );

      await conn.query(
        "INSERT INTO user_org_access (user_id, org_id, userrole) VALUES (?,?,?)",
        [userId, orgId, OWNER_ROLE_ID]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const user = await loadUserWithRole(userId);
    const orgs = await loadUserOrgs(userId);
    const { payload, rights } = await buildOrgContext(user, orgs[0]);
    const subscription = await loadSubscription(user.account_id);

    const accessToken  = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ id: user.id, oid: orgs[0].org_id }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES });

    // Best-effort — a mail hiccup shouldn't fail a signup that already
    // succeeded and was already committed to the database.
    try {
      const { subject, text } = buildWelcomeEmail({
        name: user.name,
        businessName: orgs[0].org_name,
        trialEndsAt: subscription.status === "trialing" ? subscription.trial_ends_at : null,
      });
      await sendMail({ to: user.email || email, subject, text });
    } catch (e) {
      console.error("Failed to send welcome email:", e.message);
    }

    res.status(201).json({
      success: true,
      message: "Account created",
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id, name: user.name, user_id: user.user_id, email: user.email,
          userrole: payload.role, role_name: orgs[0].role_name, rights, padmin: payload.padmin,
        },
        org: { id: orgs[0].org_id, name: orgs[0].org_name },
        orgs: orgs.map(o => ({ id: o.org_id, name: o.org_name })),
        subscription,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/auth/login
router.post("/auth/login", authLimiter, async (req, res) => {
  // #swagger.tags = ['Auth']
  const { user_id, password } = req.body;
  if (!user_id || !password)
    return res.status(400).json({ success: false, message: "Email/phone and password required" });

  try {
    const user = await loadUserByLoginId(user_id);
    if (!user) return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (user.is_active === 0)
      return res.status(403).json({ success: false, message: "This account has been disabled" });

    if (!(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    // Same login form, different app: the frontend renders the platform console
    // instead of the tenant shell when it sees padmin on the user.
    if (user.is_platform_admin) {
      await pool.query("UPDATE user SET last_login = NOW() WHERE id = ?", [user.id]);
      const accessToken  = jwt.sign(platformAdminPayload(user), JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      const refreshToken = jwt.sign({ id: user.id, padmin: true }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES });
      return res.json({
        success: true,
        message: "Login successful",
        data: { accessToken, refreshToken, ...platformAdminSession(user) },
      });
    }

    const orgs = await loadUserOrgs(user.id);
    if (!orgs.length)
      return res.status(403).json({ success: false, message: "This user has no organization access. Contact an admin." });

    await pool.query("UPDATE user SET last_login = NOW() WHERE id = ?", [user.id]);

    // Default to the first org. If there's more than one, the frontend shows
    // an org picker (Section 5.2/5.4) and calls /auth/switch-org to mint a
    // token for whichever one the user actually wants.
    const activeOrg = orgs[0];
    const { payload, rights } = await buildOrgContext(user, activeOrg);

    const accessToken  = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ id: user.id, oid: activeOrg.org_id }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id, name: user.name, user_id: user.user_id,
          userrole: payload.role, role_name: activeOrg.role_name, rights, padmin: payload.padmin,
        },
        org: { id: activeOrg.org_id, name: activeOrg.org_name },
        orgs: orgs.map(o => ({ id: o.org_id, name: o.org_name })),
        subscription: await loadSubscription(user.account_id),
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

    // No org and no company letterhead to return — the console doesn't have one.
    if (user.is_platform_admin)
      return res.json({ success: true, data: { ...platformAdminSession(user), company: null } });

    const orgs = await loadUserOrgs(user.id);
    if (!orgs.length)
      return res.status(403).json({ success: false, message: "This user has no organization access. Contact an admin." });

    // Prefer the org the current token is scoped to; fall back to the first
    // org for tokens minted before org context existed (forces a one-time
    // re-login onto a fresh, fully-scoped token, which is expected).
    const activeOrg = orgs.find(o => String(o.org_id) === String(req.user.oid)) || orgs[0];
    const { rights } = await buildOrgContext(user, activeOrg);

    // Company settings live on organization/organization_bank now, scoped to
    // the active org — same shape routes/company.js's getOrgCompany() returns.
    const [companyRows] = await pool.query(
      `SELECT o.name, o.tagline, o.address, o.city, o.phone, o.email, o.web, o.pan, o.gstin, o.logo_url,
              o.invoice_terms AS terms, o.financial_year_start,
              ob.bank_name, ob.branch AS bank_branch, ob.acc_number AS bank_acc_number,
              ob.ifsc AS bank_ifsc, ob.upi_id, ob.account_holder
       FROM organization o
       LEFT JOIN organization_bank ob ON ob.org_id = o.id AND ob.is_default = 1
       WHERE o.id = ?`,
      [activeOrg.org_id]
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id, name: user.name, user_id: user.user_id,
          userrole: activeOrg.userrole, role_name: activeOrg.role_name, rights,
          padmin: !!user.is_platform_admin,
        },
        org: { id: activeOrg.org_id, name: activeOrg.org_name },
        orgs: orgs.map(o => ({ id: o.org_id, name: o.org_name })),
        subscription: await loadSubscription(user.account_id),
        company: companyRows[0] || null,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/auth/switch-org  (protected)
router.post("/auth/switch-org", auth, async (req, res) => {
  // #swagger.tags = ['Auth']
  const { org_id } = req.body;
  if (!org_id) return res.status(400).json({ success: false, message: "org_id required" });

  try {
    const orgs = await loadUserOrgs(req.user.id);
    const target = orgs.find(o => String(o.org_id) === String(org_id));
    if (!target)
      return res.status(403).json({ success: false, message: "You do not have access to that organization" });

    const user = await loadUserWithRole(req.user.id);
    const { payload, rights } = await buildOrgContext(user, target);

    const accessToken  = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ id: user.id, oid: target.org_id }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES });

    res.json({
      success: true,
      message: "Switched organization",
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id, name: user.name, user_id: user.user_id,
          userrole: payload.role, role_name: target.role_name, rights, padmin: payload.padmin,
        },
        org: { id: target.org_id, name: target.org_name },
        orgs: orgs.map(o => ({ id: o.org_id, name: o.org_name })),
        subscription: await loadSubscription(user.account_id),
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

    // Without this the console's session would die after JWT_EXPIRES_IN, since
    // the org lookup below would reject the refresh.
    if (user.is_platform_admin) {
      const accessToken = jwt.sign(platformAdminPayload(user), JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      return res.json({ success: true, data: { accessToken } });
    }

    const orgs = await loadUserOrgs(user.id);
    if (!orgs.length)
      return res.status(403).json({ success: false, message: "This user has no organization access. Contact an admin." });

    // Keep the same active org the refresh token was minted for; fall back
    // to the first org for refresh tokens issued before org context existed.
    const activeOrg = orgs.find(o => String(o.org_id) === String(decoded.oid)) || orgs[0];
    const { payload } = await buildOrgContext(user, activeOrg);

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
  }
});

// POST /api/auth/forgot-password
router.post("/auth/forgot-password", authLimiter, async (req, res) => {
  // #swagger.tags = ['Auth']
  const { user_id } = req.body;
  try {
    const [rows] = await pool.query("SELECT id, email FROM user WHERE user_id = ? OR phone = ?", [user_id, user_id]);
    if (rows.length) {
      const token  = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 3600000);
      await pool.query("UPDATE user SET reset_token=?, reset_token_expiry=? WHERE id=?", [token, expiry, rows[0].id]);
      await sendMail({
        to: rows[0].email || user_id,
        subject: "Password reset request",
        text: `Use this token to reset your password: ${token}`,
      });
    }
    // Same response whether or not the account exists, and the token itself
    // is never returned to the caller (it used to be, in the response body).
    res.json({ success: true, message: "If an account exists, a reset link has been sent." });
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
