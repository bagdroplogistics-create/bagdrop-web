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
