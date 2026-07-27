-- =============================================================================
-- Adds a phone number to `user` — collected at signup so a user can log in
-- with either their email or phone number (routes/auth.js's login now
-- matches user_id OR phone). Safe to run once; add a guard if re-running
-- against a DB that already has the column.
-- =============================================================================

ALTER TABLE user
  ADD COLUMN phone VARCHAR(20) NULL AFTER email;
