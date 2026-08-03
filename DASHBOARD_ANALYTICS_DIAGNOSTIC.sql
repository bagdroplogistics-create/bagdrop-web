-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Dashboard Analytics Diagnostic
-- Run each block in Supabase Dashboard → SQL Editor and share the results.
-- Read-only — nothing here modifies any data.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Raw counts — what the tables actually contain right now.
SELECT
  (SELECT count(*) FROM leads)                                   AS leads_total,
  (SELECT count(*) FROM leads WHERE deleted_at IS NULL)           AS leads_not_deleted,
  (SELECT count(*) FROM leads WHERE deleted_at IS NOT NULL)       AS leads_soft_deleted,
  (SELECT count(*) FROM bookings WHERE tracking_id IS NOT NULL)   AS bookings_total;

-- 2. Is Moni Patel's row still there, and in what state?
SELECT id, lead_number, name, phone, booking_id, created_at, deleted_at
FROM leads
WHERE name ILIKE '%moni%patel%' OR phone ILIKE '%patel%';

SELECT id, tracking_id, customer_name, status, created_at
FROM bookings
WHERE tracking_id = 'BD-35MXTT' OR customer_name ILIKE '%moni%patel%';

-- 3. Full list of every lead currently NOT soft-deleted, oldest first — the
--    exact same rows the Dashboard Analytics "Total Inquiries" count is
--    built from. Use this to manually count/verify against what you expect,
--    or to point out specific rows (by lead_number) that shouldn't count.
SELECT
  l.lead_number, l.name, l.phone, l.created_at,
  l.booking_id, b.tracking_id, b.status AS booking_status
FROM leads l
LEFT JOIN bookings b ON b.id = l.booking_id
WHERE l.deleted_at IS NULL
ORDER BY l.created_at ASC;

-- 4. "Last Month Completed Bookings" investigation — every completed
--    booking with every date field that could plausibly represent "when
--    this was actually completed." The Dashboard currently uses updated_at
--    (bookings_updated_at below), but that column gets stamped with
--    whatever moment the row was last written — including a "Mark as
--    Completed — Historical Booking" backfill, which always writes "now"
--    (the day the admin did the data entry), NOT the real historical
--    completion date. If any of these rows were backfilled that way, their
--    updated_at will show today/recently, not July/June.
--    Look at pickup_date and delivery_date too — one of those may actually
--    reflect the real month, and if so, tell me which column to use.
SELECT
  b.tracking_id,
  b.customer_name,
  b.status,
  b.created_at   AS booking_created_at,
  b.updated_at   AS booking_updated_at,
  b.pickup_date,
  b.delivery_date,
  -- The single 'completed' entry from status_history, if present — its
  -- own timestamp is a second read on when 'completed' was actually set,
  -- but note this ALSO gets stamped "now" for historical backfills, so it
  -- can match updated_at exactly and be just as wrong for those rows.
  (SELECT h->>'timestamp' FROM jsonb_array_elements(b.status_history) h WHERE h->>'to' = 'completed' ORDER BY (h->>'timestamp') DESC LIMIT 1) AS completed_status_history_timestamp,
  -- Any status_history note mentioning "historical" flags a backfilled row.
  (SELECT h->>'note' FROM jsonb_array_elements(b.status_history) h WHERE h->>'to' = 'completed' ORDER BY (h->>'timestamp') DESC LIMIT 1) AS completed_note
FROM bookings b
WHERE b.status = 'completed'
ORDER BY b.updated_at DESC;
