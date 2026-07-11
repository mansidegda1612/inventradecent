/**
 * utils/permissions.js
 *
 * No longer holds a static copy of the permission list — that used to
 * duplicate backend/config/permissions.js and could drift out of sync.
 * The list now comes from GET /api/permissions (fetched once in
 * AuthContext and exposed as `permissions` from useAuth()).
 *
 * This file just keeps a couple of pure helpers that operate on whatever
 * list is passed in.
 */

export function allPermissionKeys(permissions = []) {
  return permissions.flatMap(g => g.actions.map(a => a.key));
}
