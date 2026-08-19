-- BAGDROP — add +91 99986 65328 as a THIRD internal WhatsApp recipient
-- for the same three notification tracks covered by
-- 20260818_internal_whatsapp_number.sql: new_inquiry_whatsapp,
-- sales_followup_whatsapp (also covers "Quote Pending Reminder"), and
-- ops_reminder_whatsapp ("Upcoming Pickup Reminder").
--
-- Per founder request (2026-08-19). The two existing numbers,
-- +916357335733 and +919130063884, MUST keep receiving these messages —
-- this migration only ever appends, never replaces, the `settings.value`
-- string for these keys.
--
-- Handles both cases:
--   1. The row already exists (from 20260818_internal_whatsapp_number.sql
--      or a founder edit) — append ',+919998665328' only if it isn't
--      already present, so this is safe to re-run and won't duplicate the
--      number or clobber a manually-customized list.
--   2. The row doesn't exist yet on this database — insert it with all
--      three numbers, matching lib/internal-whatsapp-recipients.ts's
--      DEFAULT_INTERNAL_WHATSAPP_NUMBERS code-level fallback.
--
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).

UPDATE settings
SET value = value || ',+919998665328',
    updated_at = now()
WHERE key IN ('new_inquiry_whatsapp', 'sales_followup_whatsapp', 'ops_reminder_whatsapp')
  AND value NOT LIKE '%9998665328%';

INSERT INTO settings (key, value, updated_at) VALUES
  ('new_inquiry_whatsapp',    '+916357335733,+919130063884,+919998665328', now()),
  ('sales_followup_whatsapp', '+916357335733,+919130063884,+919998665328', now()),
  ('ops_reminder_whatsapp',   '+916357335733,+919130063884,+919998665328', now())
ON CONFLICT (key) DO NOTHING;
