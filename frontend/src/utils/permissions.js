/**
 * utils/permissions.js
 *
 * Small pure helpers over the permission catalog (from GET /api/permissions,
 * fetched once in AuthContext and exposed as `permissions` from useAuth()).
 * The catalog groups are { module, label, actions: [{ id, key, label }] }.
 *
 * Rights are now stored/edited as permission IDs (see RightsEditor), so the
 * id helper is what the role/user forms use; the key helper stays for any
 * key-based callers.
 */

export function allPermissionIds(permissions = []) {
  return permissions.flatMap(g => g.actions.map(a => a.id));
}

export function allPermissionKeys(permissions = []) {
  return permissions.flatMap(g => g.actions.map(a => a.key));
}

// Human-readable "Module: Action" labels for a set of permission ids — used
// to show a role's granted rights as readable chips instead of raw numbers.
export function idsToLabels(permissions = [], ids = []) {
  const set = new Set(ids);
  const out = [];
  for (const g of permissions) {
    for (const a of g.actions) {
      if (set.has(a.id)) out.push({ id: a.id, label: `${g.label}: ${a.label}` });
    }
  }
  return out;
}
