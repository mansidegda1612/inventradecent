// Creates (or promotes) the platform admin — the SaaS owner's login.
//
// Deliberately a local script and not an API endpoint: nothing reachable over
// HTTP should ever be able to set is_platform_admin, or a tenant-side bug
// becomes a full platform takeover.
//
// The platform admin sits outside the tenant model entirely — account_id NULL,
// userrole NULL, rights NULL, and no user_org_access rows. That's what keeps it
// invisible to every tenant query (all of which scope by account_id/org_id).
//
// Usage:
//   node scripts/make-platform-admin.js <login-id> <password> "<Full Name>"
// e.g.
//   node scripts/make-platform-admin.js owner@inventradecent.com 'S0me-Strong-Pass' "Mansi Degda"
//
// Re-running with the same login-id resets that admin's password.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../config/db");

async function main() {
  const [loginId, password, name] = process.argv.slice(2);

  if (!loginId || !password) {
    console.error('Usage: node scripts/make-platform-admin.js <login-id> <password> "<Full Name>"');
    process.exit(1);
  }
  if (password.length < 10) {
    // This one account can read and change every customer's subscription, so a
    // short password here is a different class of risk than a tenant user's.
    console.error("Refusing: use a password of at least 10 characters for the platform admin.");
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 10);
  const [existing] = await pool.query(
    "SELECT id, account_id, is_platform_admin FROM user WHERE user_id = ?",
    [loginId]
  );

  if (existing.length) {
    const row = existing[0];
    // A real customer's login must never be converted — they'd instantly lose
    // access to their own books (the padmin login path returns no org).
    if (row.account_id != null) {
      console.error(
        `Refusing: "${loginId}" is user #${row.id} and belongs to account #${row.account_id} — ` +
        "that's a customer login. Pick a login id that isn't in use by a tenant."
      );
      process.exit(1);
    }
    await pool.query(
      `UPDATE user SET password = ?, name = COALESCE(?, name), is_platform_admin = 1,
              is_active = 1, account_id = NULL, userrole = NULL, rights = NULL
       WHERE id = ?`,
      [hashed, name || null, row.id]
    );
    console.log(
      row.is_platform_admin
        ? `Password reset for existing platform admin "${loginId}" (user #${row.id}).`
        : `Promoted "${loginId}" (user #${row.id}) to platform admin.`
    );
  } else {
    const [r] = await pool.query(
      `INSERT INTO user (user_id, email, name, password, userrole, rights, is_active,
                         account_id, is_platform_admin)
       VALUES (?,?,?,?,NULL,NULL,1,NULL,1)`,
      [loginId, loginId, name || "Platform Admin", hashed]
    );
    console.log(`Created platform admin "${loginId}" (user #${r.insertId}).`);
  }

  console.log("Sign in at the normal login screen — you'll land on the platform console.");
  process.exit(0);
}

main().catch((e) => {
  console.error("make-platform-admin failed:", e.message);
  process.exit(1);
});
