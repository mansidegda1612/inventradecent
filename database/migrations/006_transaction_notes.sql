-- =============================================================================
-- One free-text note field for EVERY voucher type (SI / PI / CR / CP).
--
-- Until now only Cash/Bank Receipt & Payment had a note, under the name
-- `narration`, and it was capped at varchar(255) because it was a single-line
-- input. Sale and Purchase entries had nowhere to record a note at all.
--
-- This replaces `narration` with `notes`:
--   * TEXT instead of varchar(255) — the UI is now a multi-line textarea, and
--     TEXT means an oversized API payload can never blow up the INSERT.
--   * used by all four document types, so the entry screens can share one
--     component and one column instead of special-casing CR/CP.
--
-- Done as add → copy → drop rather than a rename/MODIFY: TiDB handles all
-- three of these cleanly, while changing a column's type in place is a reorg
-- with more caveats. Existing narration text is carried over, so nothing a
-- user has already typed on a receipt or payment is lost.
-- =============================================================================

ALTER TABLE `transaction`
  ADD COLUMN `notes` TEXT NULL COMMENT 'Free text note (all voucher types)' AFTER `ref_no`;

UPDATE `transaction`
   SET `notes` = `narration`
 WHERE `narration` IS NOT NULL AND `narration` <> '';

ALTER TABLE `transaction` DROP COLUMN `narration`;
