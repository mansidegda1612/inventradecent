-- =============================================================================
-- Phase 1 — POST-VERIFICATION step. Do not run until you have checked every
-- query at the bottom of 001_phase1_multitenant_schema.sql and the counts
-- match what you expected.
--
-- This makes org_id mandatory going forward (no more silent default-to-1),
-- and retires the old single-row `company` table now that its data lives in
-- organization + organization_bank.
-- =============================================================================

ALTER TABLE customer                ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE product                 ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE category                ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE `group`                 ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE `transaction`           ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE transaction_items       ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE transaction_adjustments ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE cashcustdetail          ALTER COLUMN org_id DROP DEFAULT;

-- Optional — only once backend/routes/company.js and
-- frontend/src/pages/CompanyMaster.jsx have been repointed at
-- organization/organization_bank (that repointing is NOT part of Phase 1;
-- it happens when the relevant routes are touched in a later phase). Until
-- then, leave `company` in place — the app still reads/writes it.
-- DROP TABLE company;
