-- ============================================================
-- BAGDROP — Driver Assignment fields (Airport Delivery only)
-- Run in Supabase Dashboard → SQL Editor
--
-- Extends the driver-details-shared feature (20260724_driver_details_shared.sql)
-- with a proper "Driver Assignment" step that's decoupled from the
-- "Driver Details Shared" send action: Operations can assign a driver as
-- soon as they know it (well before Out for Delivery), save it against the
-- booking, and the actual customer-facing send later just reads back
-- whatever was saved — instead of retyping driver info in the same
-- moment as sending.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_type text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS airport_location text;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('vehicle_type', 'airport_location')
ORDER BY column_name;
