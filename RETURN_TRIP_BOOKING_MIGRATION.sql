-- ============================================================
-- BAGDROP — Return Trip: independent booking for the return leg
-- Run in Supabase Dashboard → SQL Editor
--
-- Phase 1 of Return Trip support. Purely additive — every new column
-- is nullable (or has a safe default), so existing one-way leads and
-- bookings are completely unaffected. Nothing here changes how the
-- existing single-booking-per-lead workflow behaves.
--
-- Background: a lead already gets exactly one booking the moment it's
-- created (leads.booking_id), and that single booking's status drives
-- the entire operational workflow (LR, driver assignment, indemnity,
-- trip sheets, invoices). The existing "Return Quote" feature only
-- stores return-journey pricing on the lead (return_quote_* columns,
-- added by RETURN_QUOTE_MIGRATION.sql) — it has no booking of its own,
-- so there's nowhere to run an independent operational workflow for
-- the return leg. This migration adds that missing link.
-- ============================================================

-- ── bookings: which leg of a (possible) round trip is this? ────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS trip_leg TEXT NOT NULL DEFAULT 'onward';
  -- 'onward' | 'return' — every existing row defaults to 'onward',
  -- matching current behavior exactly (a plain one-way booking IS the
  -- onward leg, there's just no return leg to pair it with).

COMMENT ON COLUMN bookings.trip_leg IS
  'onward | return — which leg of the trip this booking represents. Existing one-way bookings are all ''onward''.';

-- ── leads: link to the return leg's own booking + a couple of return
--    journey detail fields the earlier RETURN_QUOTE_MIGRATION.sql
--    didn't cover yet ──────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS return_booking_id   UUID REFERENCES bookings(id),
  ADD COLUMN IF NOT EXISTS return_pickup_time  TEXT,
  ADD COLUMN IF NOT EXISTS return_drop_address TEXT;

COMMENT ON COLUMN leads.return_booking_id IS
  'The independent booking row for the return leg (trip_leg=''return''), separate from leads.booking_id (the onward leg). NULL for one-way leads.';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bookings' AND column_name = 'trip_leg'
UNION ALL
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name LIKE 'return_%'
ORDER BY column_name;
