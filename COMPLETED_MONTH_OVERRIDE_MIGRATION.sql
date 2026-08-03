-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Completed Bookings: manual month override
-- Run in Supabase Dashboard → SQL Editor (safe to re-run — fully idempotent)
--
-- WHY THIS EXISTS:
--   Dashboard Analytics' "Current/Last Month Completed Bookings" buckets a
--   completed booking by its pickup_date by default (the day the job
--   actually happened). That's correct for the vast majority of bookings,
--   but two real examples showed it can't be fully automatic:
--     - Hetals Homemade (BDA-2026-0069): picked up 29 Jul, delivered 1 Aug
--       — confirmed this should count as JULY (pickup month). pickup_date
--       already gets this right on its own.
--     - Mouly Mistry (BDA-0016): picked up 28 Jun, delivered 1 Jul —
--       confirmed this should count as JULY too. pickup_date alone gets
--       this WRONG (puts it in June); there's no single date field
--       (pickup_date or delivery_date) that gets both examples right at
--       once, so this needs a manual per-booking correction.
--
--   completed_month_override lets an admin fix a specific booking's
--   reporting month directly, without touching pickup_date/delivery_date
--   (which stay accurate for scheduling/logistics purposes). When set, the
--   Dashboard uses this instead of pickup_date for that one booking; when
--   null (the default — nothing changes for any existing booking), the
--   automatic pickup_date rule applies exactly as before.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the override column (idempotent)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completed_month_override DATE;

-- 2. Immediate fix for the one confirmed case: Mouly Mistry should report
--    as a July completion, not June. Any date within July works — only the
--    calendar month is read.
UPDATE bookings
SET completed_month_override = '2026-07-01'
WHERE tracking_id = 'BDA-0016';
