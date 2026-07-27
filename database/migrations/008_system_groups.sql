-- =============================================================================
-- System default account groups ("customer" / "supplier").
--
-- These two were never really tenant data: every tenant needs both, the
-- receivable/payable reports match customers by group *name*
-- (routes/accountReports.js — `LOWER(g.name) LIKE '%customer%'` /
-- `'%supplier%'`), and AccountFormModal defaults a new account to group 1.
-- But migration 001 back-filled them to org_id = 1, so only the legacy org
-- had them: a freshly signed-up tenant started with an empty group list, wrote
-- group = 1 (another org's row) onto its customers, and got empty outstanding
-- and supplier-balance reports.
--
-- Model — same convention as userrole.account_id (see 005_userrole_per_tenant.sql):
--   org_id IS NULL  -> shared SYSTEM group. Visible to every org,
--                      editable/deletable by none.
--   org_id = <id>   -> a custom group owned by that org, visible only to it.
--
-- routes/group.js exposes the distinction as a computed `is_system` column and
-- refuses PUT/DELETE on the NULL-owner rows.
-- =============================================================================

-- 1. org_id becomes nullable so NULL can carry the "shared by all orgs"
--    meaning. Migration 002 already dropped its default, so rows created by
--    the app must still name org_id explicitly — routes/group.js does.
ALTER TABLE `group` MODIFY COLUMN org_id BIGINT NULL;

-- 2. Make sure both system groups exist. Keep ids 1/2 — those are the
--    pre-multitenant seed rows that existing `customer`.`group` values already
--    point at, so promoting them in place needs no data repointing.
--    INSERT IGNORE is a no-op when the ids are already there (the usual case,
--    coming from the dump); it only matters on a DB built from migrations.
INSERT IGNORE INTO `group` (id, name, org_id) VALUES (1, 'customer', NULL), (2, 'supplier', NULL);

-- 3. Promote them from "owned by org 1" to system.
UPDATE `group` SET org_id = NULL WHERE id = 1 AND LOWER(name) = 'customer';
UPDATE `group` SET org_id = NULL WHERE id = 2 AND LOWER(name) = 'supplier';

-- 4. Verify: expect exactly the two rows below, both with org_id NULL.
SELECT id, name, org_id FROM `group` WHERE org_id IS NULL ORDER BY id;


-- ─── OPTIONAL follow-up: merge per-org duplicates ────────────────────────────
-- If a tenant already created its own group literally named "customer" or
-- "supplier", it now sees that one *and* the system one in the dropdown. The
-- block below folds the tenant copies into the system rows. It DELETES rows,
-- so it is left commented out — run the audit query first, confirm the list is
-- what you expect, then run the three statements by hand.
--
-- Audit (which duplicates exist, and how many accounts hang off each):
--
--   SELECT g.id, g.name, g.org_id, COUNT(c.id) AS accounts
--   FROM `group` g LEFT JOIN customer c ON c.`group` = g.id
--   WHERE g.org_id IS NOT NULL AND LOWER(g.name) IN ('customer', 'supplier')
--   GROUP BY g.id, g.name, g.org_id ORDER BY g.org_id, g.name;
--
-- Merge (repoint accounts onto the system group, then drop the tenant copy):
--
--   UPDATE customer c JOIN `group` g ON g.id = c.`group`
--      SET c.`group` = 1
--    WHERE g.org_id IS NOT NULL AND LOWER(g.name) = 'customer';
--
--   UPDATE customer c JOIN `group` g ON g.id = c.`group`
--      SET c.`group` = 2
--    WHERE g.org_id IS NOT NULL AND LOWER(g.name) = 'supplier';
--
--   DELETE FROM `group`
--    WHERE org_id IS NOT NULL AND LOWER(name) IN ('customer', 'supplier');
--
-- Note this only catches exact names. Near-misses like "Customer A/c" also
-- satisfy the reports' LIKE match, so they are deliberately left alone —
-- decide those case by case.
