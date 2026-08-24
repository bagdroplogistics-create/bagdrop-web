-- ================================================================
-- Bagdrop — One-time repair: close the 0125/0126 gap by renumbering
-- Nidhi Vasava's booking from BDA-2026-0127 / BDL-2026-0127 down to
-- BDA-2026-0125 / BDL-2026-0125, and rolling the counters back so the
-- next new inquiry becomes BDA-2026-0126 instead of BDA-2026-0128.
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- 0125 and 0126 were consumed by manually-created duplicate inquiries
-- that were deleted directly from the database (2026-08-24). By design
-- (see supabase/migrations/20260817_atomic_number_series.sql), the
-- bagdrop_number_counters table never re-derives itself from existing
-- rows, so deleting those rows did NOT roll the counter back on its own
-- — the next real inquiry (Nidhi Vasava) correctly continued from
-- wherever the counter was left (127), leaving a 125/126 gap rather
-- than reusing a retired number. That's the intended, safe behavior.
--
-- Founder decision (2026-08-24): rather than leave the gap, manually
-- renumber this ONE booking down to close it, since it was confirmed to
-- be the very next real inquiry after the deleted duplicates and no
-- other number has been issued since. This is a conscious, one-time
-- exception — NOT something the application logic does automatically,
-- and NOT something to repeat casually. Numbers already communicated to
-- a customer (WhatsApp, email, quote/indemnity bond PDF) should
-- normally never change; this was approved specifically because it was
-- caught immediately, before any other numbers were issued after it.
--
-- SAFETY NOTES
-- - Only bookings.tracking_id and leads.lead_number are updated — every
--   other table (payments, lrs, invoices, trip_sheets) links to a
--   booking/lead via its UUID (booking_id/lead_id), never by the text
--   tracking_id/lead_number, so nothing else needs to change.
-- - Historical status_history / notes entries that already mention
--   "BDA-2026-0127" or "BDL-2026-0127" as plain text are left as-is —
--   they're an append-only audit log, not a live reference, and
--   rewriting history is out of scope (and undesirable) here.
-- - Any WhatsApp/email/PDF already sent to the customer referencing
--   BDA-2026-0127 will no longer match her booking going forward — this
--   was the accepted trade-off of choosing to renumber instead of
--   leaving the gap.
-- - Wrapped in a transaction — if anything unexpected happens (e.g. the
--   target numbers 0125/0126 turn out not to be free after all), no
--   partial update is left behind.
-- ================================================================

BEGIN;

-- Guard: confirm the target numbers are actually free before touching
-- anything. Aborts the whole transaction (raises an error) if not —
-- safer than silently overwriting a row that turns out to still exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bookings WHERE tracking_id = 'BDA-2026-0125') THEN
    RAISE EXCEPTION 'BDA-2026-0125 already exists — aborting renumber.';
  END IF;
  IF EXISTS (SELECT 1 FROM leads WHERE lead_number = 'BDL-2026-0125') THEN
    RAISE EXCEPTION 'BDL-2026-0125 already exists — aborting renumber.';
  END IF;
END $$;

UPDATE bookings SET tracking_id = 'BDA-2026-0125' WHERE tracking_id = 'BDA-2026-0127';
UPDATE leads    SET lead_number = 'BDL-2026-0125' WHERE lead_number = 'BDL-2026-0127';

-- Roll the counters back to 125 so the very next mint of each series
-- returns .../0126 — never lower than 125, matching GREATEST-style
-- safety already used in the 20260821 realignment script (this one is a
-- deliberate rollback, not a race-safety bump, so it's a plain SET).
UPDATE bagdrop_number_counters SET last_seq = 125 WHERE series = 'BDA' AND year = 2026;
UPDATE bagdrop_number_counters SET last_seq = 125 WHERE series = 'BDL' AND year = 2026;

COMMIT;

-- Verify — should show Nidhi Vasava's booking as BDA-2026-0125 and both
-- counters at 125.
SELECT tracking_id, customer_name FROM bookings WHERE tracking_id = 'BDA-2026-0125';
SELECT lead_number, name FROM leads WHERE lead_number = 'BDL-2026-0125';
SELECT series, year, last_seq FROM bagdrop_number_counters WHERE series IN ('BDA', 'BDL') AND year = 2026;
