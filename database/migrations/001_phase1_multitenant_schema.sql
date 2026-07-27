-- =============================================================================
-- Phase 1 — Multi-tenant schema & data migration
-- Target DB: multiinventradecent  (separate copy of inventradecent — verify
--            you are connected to the right database before running this)
--
-- Run this file top to bottom in ONE session. It is safe to run once. It does
-- NOT touch any business logic — org_id defaults to 1 everywhere, so the
-- existing single-tenant app keeps working unchanged after this runs.
--
-- Do NOT run 002_phase1_post_verification.sql until you have checked the
-- verification queries at the bottom of this file and are satisfied the
-- counts match.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — New billing/tenancy tables (Section 2)
-- -----------------------------------------------------------------------------

-- The paying subscriber
CREATE TABLE account (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  name          VARCHAR(150) NOT NULL,
  owner_email   VARCHAR(150) NOT NULL,
  status        ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_account_email (owner_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A firm/company under an account. All books hang off this.
-- Absorbs the current `company` table (invoice letterhead) — company
-- identity is per-org, so each org's invoices print its own header.
-- NOTE: added `financial_year_start` (not in the original plan doc) because
-- the real `company` table has it and backend/routes/company.js +
-- frontend/src/pages/CompanyMaster.jsx actively read/write it — dropping it
-- would silently lose data the app depends on.
CREATE TABLE organization (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  account_id    BIGINT      NOT NULL,
  name          VARCHAR(150) NOT NULL,          -- company.name
  tagline       VARCHAR(150),                   -- company.tagline
  gstin         VARCHAR(15),                    -- company.gstin
  pan           VARCHAR(10),                    -- company.pan
  address       VARCHAR(255),                   -- company.address
  city          VARCHAR(100),                   -- company.city
  phone         VARCHAR(20),                    -- company.phone
  email         VARCHAR(150),                   -- company.email
  web           VARCHAR(150),                   -- company.web
  logo_url      VARCHAR(500),                   -- company.logo_url
  invoice_terms JSON,                           -- company.terms (array of strings)
  financial_year_start DATE,                    -- company.financial_year_start
  status        ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_org_account (account_id),
  CONSTRAINT fk_org_account FOREIGN KEY (account_id) REFERENCES account(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Bank / UPI block from the company config. One row per org for now.
CREATE TABLE organization_bank (
  id             BIGINT NOT NULL AUTO_INCREMENT,
  org_id         BIGINT NOT NULL,
  bank_name      VARCHAR(100),   -- company.bank_name
  branch         VARCHAR(100),   -- company.bank_branch
  acc_number     VARCHAR(40),    -- company.bank_acc_number
  ifsc           VARCHAR(20),    -- company.bank_ifsc
  upi_id         VARCHAR(80),    -- company.upi_id
  account_holder VARCHAR(120),   -- company.account_holder
  is_default     TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_orgbank_org (org_id),
  CONSTRAINT fk_orgbank_org FOREIGN KEY (org_id) REFERENCES organization(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Catalog of what you sell (seeded later, in Phase 5)
CREATE TABLE plan (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  code            VARCHAR(40) NOT NULL,          -- 'starter','pro'
  name            VARCHAR(80) NOT NULL,
  price_inr       DECIMAL(10,2) NOT NULL,
  billing_interval ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly',
  max_orgs        INT         NOT NULL DEFAULT 1,
  max_users       INT         NOT NULL DEFAULT 2,
  features        JSON,                          -- {"whatsapp":true,"reports":true}
  provider_plan_id VARCHAR(80),                  -- Razorpay plan id
  is_active       TINYINT     NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plan_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One live subscription per account
CREATE TABLE subscription (
  id                    BIGINT NOT NULL AUTO_INCREMENT,
  account_id            BIGINT NOT NULL,
  plan_id               BIGINT,
  status                ENUM('trialing','active','past_due','canceled','expired')
                          NOT NULL DEFAULT 'trialing',
  trial_ends_at         DATETIME,
  current_period_start  DATETIME,
  current_period_end    DATETIME,
  provider              VARCHAR(20),             -- 'razorpay'
  provider_sub_id       VARCHAR(80),
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sub_account (account_id),
  CONSTRAINT fk_sub_account FOREIGN KEY (account_id) REFERENCES account(id),
  CONSTRAINT fk_sub_plan    FOREIGN KEY (plan_id)    REFERENCES plan(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Every payment attempt / success (also the GST invoice source, Phase 5)
CREATE TABLE payment (
  id                  BIGINT NOT NULL AUTO_INCREMENT,
  account_id          BIGINT NOT NULL,
  subscription_id     BIGINT,
  amount_inr          DECIMAL(10,2) NOT NULL,
  status              ENUM('created','captured','failed','refunded') NOT NULL,
  provider            VARCHAR(20)  NOT NULL DEFAULT 'razorpay',
  provider_order_id   VARCHAR(80),
  provider_payment_id VARCHAR(80),
  invoice_no          VARCHAR(40),
  paid_at             DATETIME,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pay_account (account_id),
  CONSTRAINT fk_pay_account FOREIGN KEY (account_id) REFERENCES account(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Which orgs a user can open, and their role in each
-- NOTE: `rights` is JSON here (plan doc originally said VARCHAR(100)) to match
-- the existing convention: user.rights and userrole.rights are both JSON
-- arrays of right-strings, read via the parseRights()/effectiveRights()
-- helpers in backend/routes/auth.js. A VARCHAR would break that pattern.
CREATE TABLE user_org_access (
  id          BIGINT NOT NULL AUTO_INCREMENT,
  user_id     BIGINT NOT NULL,
  org_id      BIGINT NOT NULL,
  userrole    INT    NOT NULL,          -- reuses existing userrole ids
  rights      JSON,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_org (user_id, org_id),
  KEY idx_uoa_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Idempotent webhook processing (prevents double-crediting on retries)
CREATE TABLE webhook_event (
  id            BIGINT NOT NULL AUTO_INCREMENT,
  provider      VARCHAR(20) NOT NULL,
  event_id      VARCHAR(100) NOT NULL,
  processed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_webhook (provider, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- STEP 2 — Evolve the existing `user` table (Section 2)
-- -----------------------------------------------------------------------------

ALTER TABLE user
  ADD COLUMN account_id        BIGINT NULL AFTER id,
  ADD COLUMN email             VARCHAR(150) NULL,
  ADD COLUMN is_platform_admin TINYINT NOT NULL DEFAULT 0,  -- you = 1
  ADD KEY idx_user_account (account_id);

-- -----------------------------------------------------------------------------
-- STEP 3 — Add org_id to every business table (Section 3)
-- -----------------------------------------------------------------------------

ALTER TABLE customer                ADD COLUMN org_id BIGINT NOT NULL DEFAULT 1, ADD KEY idx_customer_org (org_id);
ALTER TABLE product                 ADD COLUMN org_id BIGINT NOT NULL DEFAULT 1, ADD KEY idx_product_org (org_id);
ALTER TABLE category                ADD COLUMN org_id BIGINT NOT NULL DEFAULT 1, ADD KEY idx_category_org (org_id);
ALTER TABLE `group`                 ADD COLUMN org_id BIGINT NOT NULL DEFAULT 1, ADD KEY idx_group_org (org_id);
ALTER TABLE `transaction`           ADD COLUMN org_id BIGINT NOT NULL DEFAULT 1, ADD KEY idx_txn_org (org_id);
ALTER TABLE transaction_items       ADD COLUMN org_id BIGINT NOT NULL DEFAULT 1, ADD KEY idx_ti_org (org_id);
ALTER TABLE transaction_adjustments ADD COLUMN org_id BIGINT NOT NULL DEFAULT 1, ADD KEY idx_adj_org (org_id);
ALTER TABLE cashcustdetail          ADD COLUMN org_id BIGINT NOT NULL DEFAULT 1, ADD KEY idx_ccd_org (org_id);

-- -----------------------------------------------------------------------------
-- STEP 4 — Composite hot-path indexes (Section 11)
-- -----------------------------------------------------------------------------

ALTER TABLE `transaction`     ADD KEY idx_txn_org_date (org_id, `date`);
ALTER TABLE `transaction`     ADD KEY idx_txn_org_cust_type (org_id, customer_id, trans_type);
ALTER TABLE transaction_items ADD KEY idx_ti_org_txn (org_id, transaction_id);
ALTER TABLE product           ADD KEY idx_product_org_name (org_id, name);
ALTER TABLE customer          ADD KEY idx_customer_org_name (org_id, name);

-- -----------------------------------------------------------------------------
-- STEP 5 — Backfill Account #1 / Org #1 (Section 4)
-- -----------------------------------------------------------------------------
-- All existing business rows already have org_id = 1 from the DEFAULT 1 in
-- STEP 3, so no per-row UPDATE is needed there.

START TRANSACTION;

-- ⚠️ Replace 'REPLACE_WITH_OWNER_EMAIL' with the real owner email before running.
INSERT INTO account (id, name, owner_email, status)
  VALUES (1, 'Founding Customer', 'REPLACE_WITH_OWNER_EMAIL', 'active');

-- Copy the single existing `company` row into Org #1.
INSERT INTO organization
  (id, account_id, name, tagline, gstin, pan, address, city, phone, email, web,
   logo_url, invoice_terms, financial_year_start, status)
SELECT 1, 1, name, tagline, gstin, pan, address, city, phone, email, web,
       logo_url, terms, financial_year_start, 'active'
FROM company
LIMIT 1;

-- Move the bank/UPI details into organization_bank
INSERT INTO organization_bank
  (org_id, bank_name, branch, acc_number, ifsc, upi_id, account_holder, is_default)
SELECT 1, bank_name, bank_branch, bank_acc_number, bank_ifsc, upi_id, account_holder, 1
FROM company
LIMIT 1;

-- Comped subscription so the founding account isn't locked out post-migration
INSERT INTO subscription (account_id, plan_id, status, current_period_end)
  VALUES (1, NULL, 'active', '2027-12-31 00:00:00');

-- Attach the existing user(s) to the account, and grant Org #1 access
UPDATE user SET account_id = 1;
INSERT INTO user_org_access (user_id, org_id, userrole, rights)
  SELECT id, 1, userrole, rights FROM user;

COMMIT;

-- -----------------------------------------------------------------------------
-- VERIFICATION — run all of these and eyeball the results before proceeding
-- to 002_phase1_post_verification.sql
-- -----------------------------------------------------------------------------

-- 1) Every business row should show org_id = 1 (counts should equal each
--    table's total row count — compare against a pre-migration `SELECT
--    COUNT(*) FROM <table>` you ran before this script).
SELECT 'customer'                AS tbl, COUNT(*) AS total, SUM(org_id = 1) AS org1_count FROM customer
UNION ALL SELECT 'product',                 COUNT(*), SUM(org_id = 1) FROM product
UNION ALL SELECT 'category',                COUNT(*), SUM(org_id = 1) FROM category
UNION ALL SELECT 'group',                   COUNT(*), SUM(org_id = 1) FROM `group`
UNION ALL SELECT 'transaction',             COUNT(*), SUM(org_id = 1) FROM `transaction`
UNION ALL SELECT 'transaction_items',       COUNT(*), SUM(org_id = 1) FROM transaction_items
UNION ALL SELECT 'transaction_adjustments', COUNT(*), SUM(org_id = 1) FROM transaction_adjustments
UNION ALL SELECT 'cashcustdetail',          COUNT(*), SUM(org_id = 1) FROM cashcustdetail;

-- 2) New tenancy rows exist exactly once each
SELECT * FROM account;
SELECT * FROM organization;
SELECT * FROM organization_bank;
SELECT * FROM subscription;

-- 3) Every existing user is attached to account_id = 1 and has org access
SELECT id, user_id, account_id, is_platform_admin FROM user;
SELECT * FROM user_org_access;

-- 4) Sanity-check the organization row against the original company row
SELECT * FROM company;
