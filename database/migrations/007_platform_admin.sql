-- =============================================================================
-- 007 — Platform admin (SaaS owner) console
--
-- Adds only what the console needs to onboard and approve customers by hand:
--   * platform_audit — a record of every manual grant/approval, since these
--     actions move money and access with no payment-provider trail behind them
--   * payment.method/reference/note/recorded_by — so a cash receipt says how
--     the money arrived and who entered it
--
-- No new table is needed for the platform admin itself: user.is_platform_admin
-- already exists (migration 001, STEP 2) and the JWT already carries `padmin`.
-- Deliberately NOT a `userrole` row — role rows are listed by routes/userrole.js
-- and would show up as an assignable option in every tenant's Role/User forms.
--
-- Safe to run once, top to bottom.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Every action taken from the platform console
-- -----------------------------------------------------------------------------
CREATE TABLE platform_audit (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  actor_user_id     BIGINT       NOT NULL,        -- the platform admin who did it
  action            VARCHAR(60)  NOT NULL,        -- 'account.create','subscription.set','payment.record'
  target_account_id BIGINT       NULL,
  detail            JSON         NULL,            -- before/after + whatever was submitted
  ip                VARCHAR(45)  NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pa_actor (actor_user_id),
  KEY idx_pa_account (target_account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Offline (cash / bank / UPI / cheque) payment details
-- `payment.provider` is already VARCHAR(20) and holds 'manual' for these — no
-- change needed there.
-- -----------------------------------------------------------------------------
ALTER TABLE payment
  ADD COLUMN method      ENUM('cash','bank_transfer','upi','cheque','other') NULL AFTER status,
  ADD COLUMN reference   VARCHAR(80)  NULL,   -- cheque no / UTR / "collected in person"
  ADD COLUMN note        VARCHAR(255) NULL,
  ADD COLUMN recorded_by BIGINT       NULL;   -- platform admin who entered it

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
-- SELECT COUNT(*) FROM platform_audit;                      -- expect 0
-- SHOW COLUMNS FROM payment LIKE 'method';                  -- expect 1 row
-- SELECT id, name, user_id, account_id, is_platform_admin
--   FROM user WHERE is_platform_admin = 1;                  -- expect 0 until
--   you run: node scripts/make-platform-admin.js <login-id> <password> "<Name>"
