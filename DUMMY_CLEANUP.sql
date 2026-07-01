-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Dummy Entry Cleanup SQL
-- Run in Supabase Dashboard → SQL Editor
-- STEP 1: Run the SELECT queries to preview what will be deleted
-- STEP 2: When satisfied, run the DELETE queries
-- ─────────────────────────────────────────────────────────────────────────────

-- Matches any entry where:
--   name contains: test / demo / dummy / abc / sample / fake / xyz / asdf
--   OR phone is a placeholder: 9999999999 / 0000000000 / 1234567890
--                               9876543210 / 9000000000 / 1111111111 / 7777777777
-- Phone stored as +91XXXXXXXXXX or just digits — both covered below.

-- ─── PREVIEW — what will be deleted ─────────────────────────────────────────

-- Dummy LEADS
SELECT id, lead_number, name, phone, status, created_at
FROM leads
WHERE
  lower(name) LIKE ANY(ARRAY['%test%','%demo%','%dummy%','%abc %','% abc%','abc','%sample%','%fake%','%xyz%','%asdf%'])
  OR regexp_replace(phone, '[^0-9]', '', 'g') LIKE ANY(
    ARRAY['919999999999','9999999999',
          '910000000000','0000000000',
          '911234567890','1234567890',
          '919876543210','9876543210',
          '919000000000','9000000000',
          '911111111111','1111111111',
          '917777777777','7777777777']
  )
ORDER BY created_at;

-- Dummy BOOKINGS
SELECT id, tracking_id, customer_name, customer_phone, status, created_at
FROM bookings
WHERE
  lower(customer_name) LIKE ANY(ARRAY['%test%','%demo%','%dummy%','%abc %','% abc%','abc','%sample%','%fake%','%xyz%','%asdf%'])
  OR regexp_replace(customer_phone, '[^0-9]', '', 'g') LIKE ANY(
    ARRAY['919999999999','9999999999',
          '910000000000','0000000000',
          '911234567890','1234567890',
          '919876543210','9876543210',
          '919000000000','9000000000',
          '911111111111','1111111111',
          '917777777777','7777777777']
  )
ORDER BY created_at;

-- Dummy QUOTES
SELECT id, quote_number, customer_name, customer_phone, status, created_at
FROM quotes
WHERE
  lower(customer_name) LIKE ANY(ARRAY['%test%','%demo%','%dummy%','%abc %','% abc%','abc','%sample%','%fake%','%xyz%','%asdf%'])
  OR regexp_replace(customer_phone, '[^0-9]', '', 'g') LIKE ANY(
    ARRAY['919999999999','9999999999',
          '910000000000','0000000000',
          '911234567890','1234567890',
          '919876543210','9876543210',
          '919000000000','9000000000',
          '911111111111','1111111111',
          '917777777777','7777777777']
  )
ORDER BY created_at;

-- Dummy INVOICES
SELECT id, invoice_number, customer_name, customer_phone, created_at
FROM invoices
WHERE
  lower(customer_name) LIKE ANY(ARRAY['%test%','%demo%','%dummy%','%abc %','% abc%','abc','%sample%','%fake%','%xyz%','%asdf%'])
  OR regexp_replace(customer_phone, '[^0-9]', '', 'g') LIKE ANY(
    ARRAY['919999999999','9999999999',
          '910000000000','0000000000',
          '911234567890','1234567890',
          '919876543210','9876543210',
          '919000000000','9000000000',
          '911111111111','1111111111',
          '917777777777','7777777777']
  )
ORDER BY created_at;


-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE — run only after previewing the SELECTs above
-- Order matters: delete child records first (invoices, quotes) before bookings
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Delete dummy INVOICES first (they reference bookings)
DELETE FROM invoices
WHERE
  lower(customer_name) LIKE ANY(ARRAY['%test%','%demo%','%dummy%','%abc %','% abc%','abc','%sample%','%fake%','%xyz%','%asdf%'])
  OR regexp_replace(customer_phone, '[^0-9]', '', 'g') LIKE ANY(
    ARRAY['919999999999','9999999999',
          '910000000000','0000000000',
          '911234567890','1234567890',
          '919876543210','9876543210',
          '919000000000','9000000000',
          '911111111111','1111111111',
          '917777777777','7777777777']
  );

-- 2. Delete dummy QUOTES
DELETE FROM quotes
WHERE
  lower(customer_name) LIKE ANY(ARRAY['%test%','%demo%','%dummy%','%abc %','% abc%','abc','%sample%','%fake%','%xyz%','%asdf%'])
  OR regexp_replace(customer_phone, '[^0-9]', '', 'g') LIKE ANY(
    ARRAY['919999999999','9999999999',
          '910000000000','0000000000',
          '911234567890','1234567890',
          '919876543210','9876543210',
          '919000000000','9000000000',
          '911111111111','1111111111',
          '917777777777','7777777777']
  );

-- 3. Delete dummy BOOKINGS
DELETE FROM bookings
WHERE
  lower(customer_name) LIKE ANY(ARRAY['%test%','%demo%','%dummy%','%abc %','% abc%','abc','%sample%','%fake%','%xyz%','%asdf%'])
  OR regexp_replace(customer_phone, '[^0-9]', '', 'g') LIKE ANY(
    ARRAY['919999999999','9999999999',
          '910000000000','0000000000',
          '911234567890','1234567890',
          '919876543210','9876543210',
          '919000000000','9000000000',
          '911111111111','1111111111',
          '917777777777','7777777777']
  );

-- 4. Delete dummy LEADS (last — they may have linked bookings already deleted above)
DELETE FROM leads
WHERE
  lower(name) LIKE ANY(ARRAY['%test%','%demo%','%dummy%','%abc %','% abc%','abc','%sample%','%fake%','%xyz%','%asdf%'])
  OR regexp_replace(phone, '[^0-9]', '', 'g') LIKE ANY(
    ARRAY['919999999999','9999999999',
          '910000000000','0000000000',
          '911234567890','1234567890',
          '919876543210','9876543210',
          '919000000000','9000000000',
          '911111111111','1111111111',
          '917777777777','7777777777']
  );

-- Done. Run SELECT queries again to confirm 0 rows returned.


-- ─────────────────────────────────────────────────────────────────────────────
-- LEADS TABLE — Add pickup_address and drop_address columns
-- Run once in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS drop_address   TEXT;
