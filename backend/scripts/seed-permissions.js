// Seeds the `permission` table from backend/config/permissions.js.
// Idempotent and re-runnable: existing keys are updated in place (their id
// never changes), new keys are appended. IDs are assigned deterministically
// from the file's order the first time, so a fresh seed in another
// environment (staging/prod) produces the same ids — which matters because
// userrole.rights / user.rights store those ids.
//
// To add a module later: add it to config/permissions.js and re-run this,
// OR just INSERT the row(s) directly into the permission table.
//
// Usage: node scripts/seed-permissions.js
require("dotenv").config();
const pool = require("../config/db");
const CATALOG = require("../config/permissions");

async function main() {
  // Flatten [{module,label,actions:[{key,label}]}] -> ordered permission rows.
  const rows = [];
  CATALOG.forEach((group) => {
    group.actions.forEach((a) => {
      rows.push({
        module: group.module,
        module_label: group.label,
        perm_key: a.key,
        action_label: a.label,
      });
    });
  });

  // Next id to hand out for brand-new keys — continue after whatever's already there.
  const [[{ maxId }]] = await pool.query("SELECT COALESCE(MAX(id), 0) AS maxId FROM permission");
  let nextId = maxId + 1;

  let inserted = 0, updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const [existing] = await pool.query("SELECT id FROM permission WHERE perm_key = ?", [r.perm_key]);
    if (existing.length) {
      await pool.query(
        "UPDATE permission SET module=?, module_label=?, action_label=?, sort_order=?, is_active=1 WHERE perm_key=?",
        [r.module, r.module_label, r.action_label, i, r.perm_key]
      );
      updated++;
    } else {
      // On the very first seed (empty table) this assigns ids 1..N in file
      // order; later runs append new keys after the current max.
      const id = maxId === 0 ? i + 1 : nextId++;
      await pool.query(
        "INSERT INTO permission (id, module, module_label, perm_key, action_label, sort_order, is_active) VALUES (?,?,?,?,?,?,1)",
        [id, r.module, r.module_label, r.perm_key, r.action_label, i]
      );
      inserted++;
    }
  }

  console.log(`Permissions seeded: ${inserted} inserted, ${updated} updated (${rows.length} total in catalog).`);
  process.exit(0);
}

main().catch((e) => {
  console.error("seed-permissions failed:", e.message);
  process.exit(1);
});
