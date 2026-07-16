-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Fix: Make Optional Booking Columns Nullable
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY:
--   The bookings table was created with several columns marked NOT NULL that
--   are frequently absent when creating bookings from admin leads:
--
--     customer_email  — phone-only inquiries have no email
--     service_type    — admin may not select service yet
--     service_label   — derived from service_type; also absent
--     from_city       — admin may fill later
--     to_city         — admin may fill later
--
--   Every booking insert that hit a NULL for any of these was SILENTLY FAILING,
--   which is why inquiries weren't appearing in Dashboard or Bookings tab.
--   This is the root cause of all the "inquiry not showing" issues.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Drop NOT NULL constraints from all optional fields
ALTER TABLE bookings
  ALTER COLUMN customer_email DROP NOT NULL,
  ALTER COLUMN service_type   DROP NOT NULL,
  ALTER COLUMN service_label  DROP NOT NULL,
  ALTER COLUMN from_city      DROP NOT NULL,
  ALTER COLUMN to_city        DROP NOT NULL;

-- Step 2: Clean up empty string placeholders → NULL
UPDATE bookings SET customer_email = NULL WHERE customer_email = '';
UPDATE bookings SET service_type   = NULL WHERE service_type   = '';
UPDATE bookings SET service_label  = NULL WHERE service_label  = '';
UPDATE bookings SET from_city      = NULL WHERE from_city      = '';
UPDATE bookings SET to_city        = NULL WHERE to_city        = '';

-- Step 3: Verify — confirm all five columns are now nullable
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('customer_email','service_type','service_label','from_city','to_city')
ORDER BY column_name;
-- Expected: is_nullable = YES for all five rows

-- Step 4: Re-run REPAIR_MISSING_BOOKINGS.sql after this to fix existing leads
-- that previously failed to create their booking due to these constraints.
