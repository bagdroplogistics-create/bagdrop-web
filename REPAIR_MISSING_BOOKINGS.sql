-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Repair Missing BDA- Bookings for Existing Leads
-- Run in Supabase Dashboard → SQL Editor
--
-- WHY THIS IS NEEDED:
--   All booking inserts were failing silently because the 'lead_id' column
--   does not exist on the bookings table (migration not run). This means
--   every lead that had a quote generated shows "Sync Booking" instead of
--   "View Booking" because leads.booking_id was never written.
--
-- WHAT THIS DOES:
--   1. Creates a BDA-XXXX booking for every lead that has a quote_number
--      but no booking_id. Safe to re-run (ON CONFLICT DO NOTHING).
--   2. Back-links leads.booking_id to the new booking UUID.
--   3. Shows a verification summary.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Preview what will be created ────────────────────────────────────
SELECT
  l.lead_number,
  REPLACE(l.lead_number, 'BDL-', 'BDA-') AS new_tracking_id,
  l.name,
  l.phone,
  l.from_city,
  l.to_city,
  l.bags_count,
  l.quote_number,
  l.quote_total
FROM leads l
WHERE l.booking_id IS NULL
  AND l.quote_number IS NOT NULL
ORDER BY l.lead_number;

-- ── Step 2: Create missing BDA- bookings ────────────────────────────────────
INSERT INTO bookings (
  tracking_id,
  customer_name,
  customer_phone,
  customer_email,
  service_type,
  service_label,
  from_city,
  to_city,
  pickup_date,
  time_slot,
  pickup_address,
  drop_address,
  total_bags,
  total_amount,
  status,
  status_history
)
SELECT
  REPLACE(l.lead_number, 'BDL-', 'BDA-')    AS tracking_id,
  l.name,
  l.phone,
  COALESCE(l.email, ''),
  COALESCE(l.service_type, l.service_interest, '')  AS service_type,
  CASE COALESCE(l.service_type, l.service_interest)
    WHEN 'airport-to-doorstep'  THEN 'Airport → Doorstep'
    WHEN 'airport-to-door'      THEN 'Airport → Doorstep'
    WHEN 'doorstep-to-airport'  THEN 'Doorstep → Airport'
    WHEN 'door-to-airport'      THEN 'Doorstep → Airport'
    WHEN 'doorstep-to-doorstep' THEN 'Doorstep → Doorstep'
    WHEN 'airport-to-airport'   THEN 'Airport → Airport'
    ELSE COALESCE(l.service_type, l.service_interest, '')
  END                                         AS service_label,
  COALESCE(l.from_city, ''),
  COALESCE(l.to_city, ''),
  l.pickup_date,
  l.pickup_time                               AS time_slot,
  l.pickup_address,
  l.drop_address,
  l.bags_count                                AS total_bags,
  COALESCE(l.quote_total, 0)                  AS total_amount,
  'quote_created'                             AS status,
  jsonb_build_array(
    jsonb_build_object(
      'from',       NULL,
      'to',         'quote_created',
      'timestamp',  NOW(),
      'changed_by', 'system',
      'note',       'Auto-created by REPAIR_MISSING_BOOKINGS.sql for lead ' || l.lead_number
    )
  )                                           AS status_history
FROM leads l
WHERE l.booking_id IS NULL
  AND l.quote_number IS NOT NULL
ON CONFLICT (tracking_id) DO NOTHING;

-- ── Step 3: Back-link leads.booking_id ──────────────────────────────────────
UPDATE leads l
SET booking_id = b.id
FROM bookings b
WHERE b.tracking_id = REPLACE(l.lead_number, 'BDL-', 'BDA-')
  AND l.booking_id IS NULL
  AND l.quote_number IS NOT NULL;

-- ── Step 4: Also fix leads that have a booking but it's cancelled ─────────────
-- (Re-activates any BDA- booking that was accidentally set to cancelled)
UPDATE bookings b
SET status = 'quote_created',
    notes  = NULL
FROM leads l
WHERE l.booking_id = b.id
  AND b.tracking_id LIKE 'BDA-%'
  AND b.status = 'cancelled'
  AND l.quote_number IS NOT NULL;

-- ── Step 5: Verification ────────────────────────────────────────────────────
SELECT
  l.lead_number,
  l.name,
  l.quote_number,
  l.booking_id,
  b.tracking_id   AS booking_tracking,
  b.status        AS booking_status,
  CASE
    WHEN l.booking_id IS NOT NULL THEN '✓ LINKED'
    ELSE '✗ STILL MISSING'
  END AS link_status
FROM leads l
LEFT JOIN bookings b ON b.id = l.booking_id
WHERE l.quote_number IS NOT NULL
ORDER BY l.lead_number;
