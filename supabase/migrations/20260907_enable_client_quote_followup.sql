-- BAGDROP — Enable the client-facing Quote Follow-up (2h)
--
-- Founder confirmed 2026-09-07: the 'quote_follow_up_2_hours' Fast2SMS
-- template (message_id 31553) is now Meta-Approved, and
-- FAST2SMS_CLIENT_QUOTE_FOLLOWUP_MESSAGE_ID is already set in the Vercel
-- deployment environment. Both preconditions from
-- supabase/migrations/20260905_client_quote_followup.sql's comment are now
-- met, so this flips the setting that migration deliberately left disabled.
--
-- "Only sends once per lead, not again and again" (explicit founder
-- requirement) is already guaranteed by the existing mechanism — not new
-- behavior added here:
--   1. lead_followups has UNIQUE(lead_id, reminder_type, channel).
--      scheduleDueTiers() in lib/sales-followup-reminders.ts upserts the
--      'client_quote_followup_2h' row onto that constraint with
--      ignoreDuplicates: true, so a lead can only ever get ONE such row,
--      no matter how many times the cron tick re-evaluates it.
--   2. sendDuePending() claims a row with an atomic
--      UPDATE ... WHERE status = 'pending' before sending — so even two
--      overlapping cron ticks can't both send the same row.
--   3. Once sent (or cancelled — e.g. the customer already responded by
--      send time), the row's status leaves 'pending' for good; nothing in
--      this codebase ever resets a lead_followups row back to 'pending'.
-- So a given lead's quote follow-up fires at most once, ever — flipping
-- this flag does not change that guarantee, only turns the feature on.

UPDATE settings SET value = 'true' WHERE key = 'client_quote_followup_enabled';

-- Verify
SELECT key, value FROM settings WHERE key IN ('client_quote_followup_enabled', 'client_quote_followup_hours');
