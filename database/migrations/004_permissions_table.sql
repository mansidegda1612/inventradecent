-- =============================================================================
-- Permission catalog table — moves the permission list out of the static
-- backend/config/permissions.js file and into the DB, so adding a new module
-- in future is a data change (one INSERT, or re-running scripts/seed-permissions.js)
-- rather than a code change.
--
-- `userrole.rights` and `user.rights` (both JSON arrays) now store permission
-- IDs referencing this table, plus the special "*" sentinel meaning "all
-- rights" (used by the seeded admin role so the account owner automatically
-- gains access to any module added later). auth.js resolves those IDs back to
-- perm_key strings when it mints the JWT, so requireRight()/hasRight() and the
-- frontend keep working with stable string keys.
--
-- Seed it with:  node backend/scripts/seed-permissions.js
-- =============================================================================

CREATE TABLE permission (
  id            INT          NOT NULL AUTO_INCREMENT,
  module        VARCHAR(50)  NOT NULL,             -- e.g. "sale"
  module_label  VARCHAR(100) NOT NULL,             -- e.g. "Sale Entry"
  perm_key      VARCHAR(80)  NOT NULL,             -- e.g. "sale.create"
  action_label  VARCHAR(80)  NOT NULL,             -- e.g. "Create"
  sort_order    INT          NOT NULL DEFAULT 0,
  is_active     TINYINT      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_perm_key (perm_key),
  KEY idx_perm_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
