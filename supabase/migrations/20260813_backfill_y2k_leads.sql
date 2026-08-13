-- ================================================================
-- Backfill: create missing `leads` rows for #Y2K wedding-page inquiries
-- Run in Supabase SQL Editor
-- ================================================================
--
-- app/api/y2k/inquiry/route.ts previously only wrote to `bookings`, never
-- to `leads`. That meant every #Y2K inquiry (tracking_id LIKE 'Y2K-%')
-- showed up on the Dashboard (which reads `bookings`) but was invisible in
-- the Leads tab (which reads `leads`) — no matching lead row ever existed.
-- The route now auto-creates a lead for every new #Y2K inquiry, same as
-- the regular booking form already does. This backfills that missing lead
-- for any #Y2K booking submitted *before* that fix went live.
--
-- Safe to re-run: only inserts a lead for a booking that doesn't already
-- have one (NOT EXISTS guard), so running this twice is a no-op the
-- second time.

-- Defensive: make sure the columns this backfill writes to actually exist,
-- in case this environment's leads table predates one of the earlier
-- ALTER TABLE migrations. No-ops if they're already there.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pickup_address text,
  ADD COLUMN IF NOT EXISTS drop_address   text,
  ADD COLUMN IF NOT EXISTS booking_id     uuid REFERENCES bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_number    text,
  ADD COLUMN IF NOT EXISTS service_type   text;

DO $$
DECLARE
  yr        int := extract(year from now());
  next_seq  int;
BEGIN
  -- Continue the same BDL-<year>-NNNN sequence the app uses.
  SELECT COALESCE(MAX(substring(lead_number from '\d+$')::int), 0) + 1
    INTO next_seq
    FROM leads
   WHERE lead_number LIKE 'BDL-' || yr || '-%';

  WITH missing AS (
    SELECT
      b.*,
      row_number() OVER (ORDER BY b.created_at) - 1 AS rn
    FROM bookings b
    WHERE b.tracking_id LIKE 'Y2K-%'
      AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.booking_id = b.id)
  )
  INSERT INTO leads (
    lead_number, name, phone, email, source, status,
    service_type, service_interest, from_city, to_city,
    travel_date, pickup_date, pickup_address, drop_address,
    bags_count, notes, booking_id
  )
  SELECT
    'BDL-' || yr || '-' || lpad((next_seq + rn)::text, 4, '0'),
    customer_name,
    customer_phone,
    customer_email,
    'website',
    'new',
    'destination-weddings',
    'destination-weddings',
    'Udaipur',
    'Udaipur',
    pickup_date,
    pickup_date,
    pickup_address,
    drop_address,
    COALESCE(total_bags, 1),
    'Backfilled — #Y2K wedding page inquiry ' || tracking_id,
    id
  FROM missing;
END $$;

-- Verify: should return 0 rows once this has run successfully.
-- SELECT id, tracking_id, customer_name FROM bookings b
--  WHERE b.tracking_id LIKE 'Y2K-%'
--    AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.booking_id = b.id);
