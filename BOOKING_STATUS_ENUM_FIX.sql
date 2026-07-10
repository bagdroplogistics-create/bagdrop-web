-- ============================================================
-- BAGDROP — Fix: Convert booking status from ENUM → TEXT
-- Run in Supabase Dashboard → SQL Editor
--
-- This resolves the error:
--   "invalid input value for enum booking_status: invoice_sent"
-- ============================================================

-- Convert the status column to TEXT so any status string is valid
ALTER TABLE bookings ALTER COLUMN status TYPE TEXT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name = 'status';
-- Expected: data_type = 'text'
