-- ============================================================
-- BAGDROP — "Driver Details Shared" status (Airport Delivery only)
-- Run in Supabase Dashboard → SQL Editor
--
-- Context: the live, comprehensive booking-lifecycle UI is
-- app/(admin)/admin/quotes/view/[lead_id]/page.tsx (the numbered
-- "Booking Workflow" stepper with Next Action cards) — it drives
-- bookings.status directly via app/api/admin/bookings/[id]/route.ts.
-- Trip Sheets are a separate module created only *after* Delivered
-- for vendor/expense reconciliation, so this status and its fields
-- live on bookings, not trip_sheets.
-- ============================================================

-- Flight arrival datetime — collected on the customer booking form
-- (BookingState.flightDateTime in lib/booking-types.ts) but never
-- persisted until now (app/api/bookings/route.ts updated alongside
-- this migration). Needed to compute the "4 hours before arrival"
-- send window. Also editable by admin on the booking workflow page
-- as a fallback for bookings created without it.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS flight_datetime timestamptz;

-- Driver / vehicle assignment, captured on the booking directly at
-- the "Driver Details Shared" step (Airport Delivery only) — distinct
-- from trip_sheets.driver_name/vehicle_number, which get filled in
-- later and independently when a trip sheet is created post-delivery.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_phone text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_number text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_instructions text;

-- Set the instant the driver-details message actually goes out
-- (immediately, or later via cron). NULL = not sent yet. This is
-- the dedup guard: once set, it is never sent again for this booking.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_details_sent_at timestamptz;
-- Set when admin marks the status before the 4-hour window opens;
-- the cron job (app/api/cron/send-driver-details) picks it up once
-- this timestamp has passed. NULL once sent or if sent immediately.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_details_scheduled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_driver_details_scheduled
  ON bookings(driver_details_scheduled_at)
  WHERE driver_details_scheduled_at IS NOT NULL AND driver_details_sent_at IS NULL;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN (
    'flight_datetime', 'driver_name', 'driver_phone', 'vehicle_number',
    'pickup_instructions', 'driver_details_sent_at', 'driver_details_scheduled_at'
  )
ORDER BY column_name;
