-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Trip Sheets: duplicate cleanup + optional uniqueness constraint
-- Run in Supabase Dashboard → SQL Editor
--
-- WHY THIS EXISTS:
--   BDT-2026-0007 and BDT-2026-0010 are identical trip sheets — same
--   customer (Disha Patel), same phone, same route (Baroda -> Mumbai
--   Airport), same pickup/delivery dates (11/13 Sept 2026), same income
--   (Rs.12,810) and expense (Rs.0). This double-counts income in every
--   roll-up that sums trip_sheets (Dashboard Trip Operations, the Trip
--   Sheets page totals, and the Revenue Report).
--
--   A matching app-level guard has been added (see
--   app/api/admin/trip-sheets/route.ts) that blocks creating a new trip
--   sheet with the same customer_phone + from_city + to_city + pickup_date
--   as an existing one — so this shouldn't happen again going forward.
--   This file is for cleaning up the two duplicates that already exist,
--   and optionally adding a hard database-level constraint as well.
--
--   This file deliberately does NOT include a DELETE statement — picking
--   which of two duplicate rows is the "real" one (e.g. if one has a
--   linked LR/invoice and the other doesn't) needs a human decision, not
--   an automatic guess. Steps below walk through it safely.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Confirm which rows are actually duplicated (should show the
--    Disha Patel pair described above, plus any others you didn't know
--    about — same shape as the bug report, generalized to catch every
--    duplicate group rather than just the one that was found by hand).
SELECT trip_number, customer_name, customer_phone, from_city, to_city,
       pickup_date, delivery_date, total_income, total_expense, status,
       created_at
FROM trip_sheets
WHERE (customer_phone, from_city, to_city, pickup_date) IN (
  SELECT customer_phone, from_city, to_city, pickup_date
  FROM trip_sheets
  WHERE status <> 'cancelled'
  GROUP BY customer_phone, from_city, to_city, pickup_date
  HAVING COUNT(*) > 1
)
ORDER BY customer_phone, pickup_date, created_at;

-- 2. For each duplicate pair/group returned above: open both trip numbers
--    in the admin (/admin/trip-sheets), check which one has a linked LR,
--    invoice, or expenses logged against it, and keep that one. Delete
--    the other via its Delete action on the Trip Sheets page (or, once
--    you've confirmed the id to remove, run:
--
--      DELETE FROM trip_sheets WHERE id = '<the-duplicate-row-id>';
--
--    — substituting the real id from step 1's output. Not run
--    automatically here on purpose.

-- 3. OPTIONAL — once step 2 is done and step 1 returns zero rows, you can
--    add a hard database-level constraint so this can never happen again
--    even if the app-level guard is ever bypassed. Safe/idempotent to run
--    once duplicates are cleared; will fail with an error (not silently
--    do the wrong thing) if any duplicates still exist, so it's safe to
--    attempt even before you're 100% sure step 2 is complete.
--
-- CREATE UNIQUE INDEX IF NOT EXISTS trip_sheets_customer_route_pickup_uniq
--   ON trip_sheets (customer_phone, from_city, to_city, pickup_date)
--   WHERE status <> 'cancelled';
