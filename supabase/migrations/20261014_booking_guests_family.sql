-- Y2K family bookings: lead guest + add-on guests with per-guest bag counts.
-- Reuses group_guests (one row per guest, linked to the booking) so existing
-- guest->bag linkage (group_bags.guest_id) works. Booking stays booking_type
-- 'individual' => no change to the normal workflow.
ALTER TABLE group_guests ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;
ALTER TABLE group_guests ADD COLUMN IF NOT EXISTS bags_count integer NOT NULL DEFAULT 0;
ALTER TABLE group_guests ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hotel_room_number text;           -- internal, never shown publicly
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_submission_id text;        -- idempotency key for retries
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_client_submission_id
  ON bookings(client_submission_id) WHERE client_submission_id IS NOT NULL;
