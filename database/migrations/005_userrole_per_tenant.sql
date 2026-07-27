-- =============================================================================
-- Make user roles per-tenant. Until now `userrole` had no account_id, so a
-- custom role one tenant created showed up in every tenant's role list — a
-- cross-tenant bleed once role management is exposed to each account's admin.
--
-- Model:
--   account_id IS NULL  -> shared SYSTEM role (the seeded "admin"/"guest").
--                          Visible to every account, editable/deletable by none.
--   account_id = <id>   -> a custom role owned by that account. Visible to and
--                          editable only by that account.
--
-- The two existing seeded rows keep account_id = NULL (column default), so
-- they become the shared system roles automatically — no data backfill needed.
-- =============================================================================

-- Two statements: TiDB rejects adding a column and an index that references
-- it in a single ALTER.
ALTER TABLE userrole ADD COLUMN account_id BIGINT NULL AFTER id;
ALTER TABLE userrole ADD KEY idx_userrole_account (account_id);
