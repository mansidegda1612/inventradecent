// In-memory cache of the permission catalog (the `permission` table), so
// resolving rights ids -> perm_key strings on every login/token-mint doesn't
// hit the DB each time. The catalog only changes when a module is added
// (a deliberate, rare admin/deploy action), so a short TTL is plenty; call
// invalidatePermissionCache() after seeding if you want it picked up without
// waiting for the TTL or a restart.
const pool = require("../config/db");

const TTL_MS = 5 * 60 * 1000;
let cache = null;       // { idToKey: {id:key}, rows: [...] }
let loadedAt = 0;

async function load() {
  const [rows] = await pool.query(
    "SELECT id, module, module_label, perm_key, action_label, sort_order FROM permission WHERE is_active = 1 ORDER BY sort_order ASC, id ASC"
  );
  const idToKey = {};
  for (const r of rows) idToKey[r.id] = r.perm_key;
  cache = { idToKey, rows };
  loadedAt = Date.now();
  return cache;
}

async function getCatalog() {
  if (!cache || Date.now() - loadedAt > TTL_MS) await load();
  return cache;
}

// Maps a rights array (permission ids, possibly plus the "*" sentinel) to the
// set of perm_key strings the rest of the app checks against. "*" short-
// circuits to itself — requireRight/hasRight already treat it as "all".
async function idsToKeys(ids = []) {
  if (!Array.isArray(ids)) return [];
  if (ids.includes("*")) return ["*"];
  const { idToKey } = await getCatalog();
  const keys = [];
  for (const id of ids) {
    const key = idToKey[id];
    if (key) keys.push(key);
  }
  return keys;
}

function invalidatePermissionCache() {
  cache = null;
  loadedAt = 0;
}

module.exports = { getCatalog, idsToKeys, invalidatePermissionCache };
