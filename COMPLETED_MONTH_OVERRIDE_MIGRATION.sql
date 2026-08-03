-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Completed Bookings: manual month override
-- Run in Supabase Dashboard → SQL Editor (safe to re-run — fully idempotent)
--
-- WHY THIS EXISTS:
--   Dashboard Analytics' "Current/Last Month Completed Bookings" buckets a
--   completed booking by its pickup_date by default (the day the job
--   actually happened). That's correct for most bookings, but the user
--   confirmed all 17 of this database's completed bookings should report
--   as JULY, including two that don't get there automatically from any
--   single date field:
--     - Hetals Homemade (BDA-2026-0069): picked up 29 Jul, delivered 1 Aug
--       — pickup_date already gets this right (July) on its own.
--     - Mouly Mistry (BDA-0016): picked up 28 Jun, delivered 1 Jul —
--       pickup_date alone gets this WRONG (puts it in June).
--     - Krupesh Patel (BDA-TWSAGJ): picked up 21 Jun AND delivered 22 Jun —
--       no boundary-crossing at all, both dates are genuinely June, but
--       confirmed by the user as a July completion anyway (business reason
--       not captured by any stored date field).
--   There's no single date field that gets all of these right
--   automatically, so this needs manual per-booking correction.
--
--   completed_month_override lets an admin fix a specific booking's
--   reporting month directly, without touching pickup_date/delivery_date
--   (which stay accurate for scheduling/logistics purposes). When set, the
--   Dashboard (and the Revenue Report, which now uses this same dataset —
--   see app/api/admin/crm-stats/route.ts) uses this instead of pickup_date
--   for that one booking; when null (the default — nothing changes for any
--   other booking), the automatic pickup_date rule applies exactly as before.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the override column (idempotent)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completed_month_override DATE;

-- 2. Confirmed fixes: Mouly Mistry and Krupesh Patel should both report as
--    July completions, not June. Any date within July works — only the
--    calendar month is read.
UPDATE bookings
SET completed_month_override = '2026-07-01'
WHERE tracking_id IN ('BDA-0016', 'BDA-TWSAGJ');
