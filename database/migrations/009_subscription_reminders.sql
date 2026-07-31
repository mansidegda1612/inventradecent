-- =============================================================================
-- 009 — Trial / subscription expiry reminders
--
-- Adds the one table the reminder job needs: a send log, so a customer gets
-- each milestone email exactly once.
--
-- Why a table and not just "compute it on the fly": the job runs daily, but a
-- server restart, a manual `node scripts/send-subscription-reminders.js`, or a
-- second app instance would each re-derive the same "3 days left" state and
-- mail the customer again. A UNIQUE row claimed before the mail goes out makes
-- the second attempt a no-op.
--
-- `target_date` is part of the unique key on purpose: it pins each reminder to
-- the specific expiry date it was about. When a customer renews and
-- current_period_end moves to next year, the new cycle's 10/5/3/1-day
-- reminders are new rows and send normally — without it, they'd be suppressed
-- forever by last year's rows.
--
-- Safe to run once, top to bottom.
-- =============================================================================

CREATE TABLE subscription_reminder (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  account_id   BIGINT       NOT NULL,
  kind         ENUM('trial','subscription') NOT NULL,  -- which countdown this was
  days_before  INT          NOT NULL,                  -- 10 / 5 / 3 / 1
  target_date  DATE         NOT NULL,                  -- the trial_ends_at / current_period_end being counted down to
  sent_to      VARCHAR(150) NULL,                      -- account.owner_email at send time
  sent_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reminder (account_id, kind, days_before, target_date),
  KEY idx_reminder_account (account_id, sent_at),
  CONSTRAINT fk_reminder_account FOREIGN KEY (account_id) REFERENCES account(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
-- SELECT COUNT(*) FROM subscription_reminder;   -- expect 0
--
-- Which accounts the job would consider today, and how many days each has left:
-- SELECT a.id, a.name, a.owner_email, s.status,
--        DATEDIFF(DATE(s.trial_ends_at),      CURDATE()) AS trial_days_left,
--        DATEDIFF(DATE(s.current_period_end), CURDATE()) AS sub_days_left
--   FROM subscription s
--   JOIN account a ON a.id = s.account_id
--  WHERE s.status IN ('trialing','active');
