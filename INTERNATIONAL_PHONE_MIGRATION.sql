-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — International phone support: split country code + national number
-- Run in Supabase Dashboard → SQL Editor
--
-- Every *_phone / phone column below already stores a single dial-code-
-- prefixed string today (e.g. "+919876543210") — this migration does NOT
-- change what that column holds. It ADDS two new columns alongside each one:
--
--   <col>_country_code   text  — ISO 3166-1 alpha-2, e.g. 'IN', 'US', 'GB'
--   <col>_national       text  — digits only, no dial code, e.g. '9876543210'
--
-- The app keeps writing the existing full E.164 column (so nothing that
-- reads it today breaks) AND now also writes these two alongside it, so the
-- selected country can be redisplayed instantly when a record is reopened
-- for editing, without re-parsing the combined string client-side every
-- time. Free-text "person + phone" fields (trip_sheets.pickup_contact /
-- delivery_contact) are deliberately NOT split here — they mix a name and a
-- phone number in one field, not a structured phone value.
--
-- Backfill below is a best-effort SQL-only parse of the 8 priority country
-- dial codes (India, USA, Canada, UK, Australia, New Zealand, UAE,
-- Singapore) — anything else (older rows, or any other country entered
-- before this feature existed) is left with country_code = NULL and
-- national = the digits after "+", flagged by the verification query at the
-- bottom for manual review. Legacy bare-digit rows with no "+" at all are
-- assumed to be India numbers (Bagdrop only served India before this).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── bookings ──────────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_phone_country_code TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone_national     TEXT,
  ADD COLUMN IF NOT EXISTS driver_phone_country_code   TEXT,
  ADD COLUMN IF NOT EXISTS driver_phone_national       TEXT;

-- ── leads ─────────────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS phone_country_code TEXT,
  ADD COLUMN IF NOT EXISTS phone_national     TEXT;

-- ── quotes ────────────────────────────────────────────────────────────────
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS customer_phone_country_code TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone_national     TEXT;

-- ── payments ──────────────────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS customer_phone_country_code TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone_national     TEXT;

-- ── invoices ──────────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS customer_phone_country_code TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone_national     TEXT;

-- ── trip_sheets (structured customer_phone only — NOT pickup/delivery_contact) ──
ALTER TABLE trip_sheets
  ADD COLUMN IF NOT EXISTS customer_phone_country_code TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone_national     TEXT;

-- ── Backfill helper: run the same CASE logic against any (table, phone_col,
--    cc_col, nat_col) triple. Postgres has no easy way to loop this
--    generically inline in the dashboard SQL editor without PL/pgSQL, so
--    it's spelled out once per table below — copy/adjust if you add another
--    phone column later. ──────────────────────────────────────────────────

UPDATE bookings SET
  customer_phone_country_code = CASE
    WHEN customer_phone LIKE '+971%' THEN 'AE'
    WHEN customer_phone LIKE '+91%'  THEN 'IN'
    WHEN customer_phone LIKE '+44%'  THEN 'GB'
    WHEN customer_phone LIKE '+61%'  THEN 'AU'
    WHEN customer_phone LIKE '+64%'  THEN 'NZ'
    WHEN customer_phone LIKE '+65%'  THEN 'SG'
    WHEN customer_phone LIKE '+1%'   THEN 'US'   -- US/CA share +1; defaults to US, admin can correct on next edit
    WHEN customer_phone ~ '^[0-9]{10}$' THEN 'IN' -- legacy bare 10-digit, no "+" — assumed India
    ELSE NULL
  END,
  customer_phone_national = CASE
    WHEN customer_phone LIKE '+971%' THEN substring(customer_phone from 5)
    WHEN customer_phone LIKE '+91%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+44%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+61%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+64%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+65%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+1%'   THEN substring(customer_phone from 3)
    WHEN customer_phone ~ '^[0-9]{10}$' THEN customer_phone
    ELSE regexp_replace(customer_phone, '\D', '', 'g')
  END
WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL;

UPDATE bookings SET
  driver_phone_country_code = CASE
    WHEN driver_phone LIKE '+971%' THEN 'AE'
    WHEN driver_phone LIKE '+91%'  THEN 'IN'
    WHEN driver_phone LIKE '+44%'  THEN 'GB'
    WHEN driver_phone LIKE '+61%'  THEN 'AU'
    WHEN driver_phone LIKE '+64%'  THEN 'NZ'
    WHEN driver_phone LIKE '+65%'  THEN 'SG'
    WHEN driver_phone LIKE '+1%'   THEN 'US'
    WHEN driver_phone ~ '^[0-9]{10}$' THEN 'IN'
    ELSE NULL
  END,
  driver_phone_national = CASE
    WHEN driver_phone LIKE '+971%' THEN substring(driver_phone from 5)
    WHEN driver_phone LIKE '+91%'  THEN substring(driver_phone from 4)
    WHEN driver_phone LIKE '+44%'  THEN substring(driver_phone from 4)
    WHEN driver_phone LIKE '+61%'  THEN substring(driver_phone from 4)
    WHEN driver_phone LIKE '+64%'  THEN substring(driver_phone from 4)
    WHEN driver_phone LIKE '+65%'  THEN substring(driver_phone from 4)
    WHEN driver_phone LIKE '+1%'   THEN substring(driver_phone from 3)
    WHEN driver_phone ~ '^[0-9]{10}$' THEN driver_phone
    ELSE regexp_replace(driver_phone, '\D', '', 'g')
  END
WHERE driver_phone IS NOT NULL AND driver_phone_country_code IS NULL;

UPDATE leads SET
  phone_country_code = CASE
    WHEN phone LIKE '+971%' THEN 'AE'
    WHEN phone LIKE '+91%'  THEN 'IN'
    WHEN phone LIKE '+44%'  THEN 'GB'
    WHEN phone LIKE '+61%'  THEN 'AU'
    WHEN phone LIKE '+64%'  THEN 'NZ'
    WHEN phone LIKE '+65%'  THEN 'SG'
    WHEN phone LIKE '+1%'   THEN 'US'
    WHEN phone ~ '^[0-9]{10}$' THEN 'IN'
    ELSE NULL
  END,
  phone_national = CASE
    WHEN phone LIKE '+971%' THEN substring(phone from 5)
    WHEN phone LIKE '+91%'  THEN substring(phone from 4)
    WHEN phone LIKE '+44%'  THEN substring(phone from 4)
    WHEN phone LIKE '+61%'  THEN substring(phone from 4)
    WHEN phone LIKE '+64%'  THEN substring(phone from 4)
    WHEN phone LIKE '+65%'  THEN substring(phone from 4)
    WHEN phone LIKE '+1%'   THEN substring(phone from 3)
    WHEN phone ~ '^[0-9]{10}$' THEN phone
    ELSE regexp_replace(phone, '\D', '', 'g')
  END
WHERE phone IS NOT NULL AND phone_country_code IS NULL;

UPDATE quotes SET
  customer_phone_country_code = CASE
    WHEN customer_phone LIKE '+971%' THEN 'AE'
    WHEN customer_phone LIKE '+91%'  THEN 'IN'
    WHEN customer_phone LIKE '+44%'  THEN 'GB'
    WHEN customer_phone LIKE '+61%'  THEN 'AU'
    WHEN customer_phone LIKE '+64%'  THEN 'NZ'
    WHEN customer_phone LIKE '+65%'  THEN 'SG'
    WHEN customer_phone LIKE '+1%'   THEN 'US'
    WHEN customer_phone ~ '^[0-9]{10}$' THEN 'IN'
    ELSE NULL
  END,
  customer_phone_national = CASE
    WHEN customer_phone LIKE '+971%' THEN substring(customer_phone from 5)
    WHEN customer_phone LIKE '+91%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+44%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+61%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+64%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+65%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+1%'   THEN substring(customer_phone from 3)
    WHEN customer_phone ~ '^[0-9]{10}$' THEN customer_phone
    ELSE regexp_replace(customer_phone, '\D', '', 'g')
  END
WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL;

UPDATE payments SET
  customer_phone_country_code = CASE
    WHEN customer_phone LIKE '+971%' THEN 'AE'
    WHEN customer_phone LIKE '+91%'  THEN 'IN'
    WHEN customer_phone LIKE '+44%'  THEN 'GB'
    WHEN customer_phone LIKE '+61%'  THEN 'AU'
    WHEN customer_phone LIKE '+64%'  THEN 'NZ'
    WHEN customer_phone LIKE '+65%'  THEN 'SG'
    WHEN customer_phone LIKE '+1%'   THEN 'US'
    WHEN customer_phone ~ '^[0-9]{10}$' THEN 'IN'
    ELSE NULL
  END,
  customer_phone_national = CASE
    WHEN customer_phone LIKE '+971%' THEN substring(customer_phone from 5)
    WHEN customer_phone LIKE '+91%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+44%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+61%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+64%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+65%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+1%'   THEN substring(customer_phone from 3)
    WHEN customer_phone ~ '^[0-9]{10}$' THEN customer_phone
    ELSE regexp_replace(customer_phone, '\D', '', 'g')
  END
WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL;

UPDATE invoices SET
  customer_phone_country_code = CASE
    WHEN customer_phone LIKE '+971%' THEN 'AE'
    WHEN customer_phone LIKE '+91%'  THEN 'IN'
    WHEN customer_phone LIKE '+44%'  THEN 'GB'
    WHEN customer_phone LIKE '+61%'  THEN 'AU'
    WHEN customer_phone LIKE '+64%'  THEN 'NZ'
    WHEN customer_phone LIKE '+65%'  THEN 'SG'
    WHEN customer_phone LIKE '+1%'   THEN 'US'
    WHEN customer_phone ~ '^[0-9]{10}$' THEN 'IN'
    ELSE NULL
  END,
  customer_phone_national = CASE
    WHEN customer_phone LIKE '+971%' THEN substring(customer_phone from 5)
    WHEN customer_phone LIKE '+91%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+44%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+61%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+64%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+65%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+1%'   THEN substring(customer_phone from 3)
    WHEN customer_phone ~ '^[0-9]{10}$' THEN customer_phone
    ELSE regexp_replace(customer_phone, '\D', '', 'g')
  END
WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL;

UPDATE trip_sheets SET
  customer_phone_country_code = CASE
    WHEN customer_phone LIKE '+971%' THEN 'AE'
    WHEN customer_phone LIKE '+91%'  THEN 'IN'
    WHEN customer_phone LIKE '+44%'  THEN 'GB'
    WHEN customer_phone LIKE '+61%'  THEN 'AU'
    WHEN customer_phone LIKE '+64%'  THEN 'NZ'
    WHEN customer_phone LIKE '+65%'  THEN 'SG'
    WHEN customer_phone LIKE '+1%'   THEN 'US'
    WHEN customer_phone ~ '^[0-9]{10}$' THEN 'IN'
    ELSE NULL
  END,
  customer_phone_national = CASE
    WHEN customer_phone LIKE '+971%' THEN substring(customer_phone from 5)
    WHEN customer_phone LIKE '+91%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+44%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+61%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+64%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+65%'  THEN substring(customer_phone from 4)
    WHEN customer_phone LIKE '+1%'   THEN substring(customer_phone from 3)
    WHEN customer_phone ~ '^[0-9]{10}$' THEN customer_phone
    ELSE regexp_replace(customer_phone, '\D', '', 'g')
  END
WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL;

-- ── Verify: new columns exist ────────────────────────────────────────────
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name LIKE '%_country_code' OR column_name LIKE '%_national'
ORDER BY table_name, column_name;

-- ── Verify: any row the backfill couldn't confidently classify ──────────
-- (country_code left NULL, phone was non-empty and not one of the 7 priority
-- dial codes / legacy bare-10-digit pattern) — review these manually; the
-- app will show them as India by default until corrected on next edit.
SELECT 'bookings' AS table_name, id, customer_phone FROM bookings WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL
UNION ALL
SELECT 'bookings_driver', id, driver_phone FROM bookings WHERE driver_phone IS NOT NULL AND driver_phone_country_code IS NULL
UNION ALL
SELECT 'leads', id, phone FROM leads WHERE phone IS NOT NULL AND phone_country_code IS NULL
UNION ALL
SELECT 'quotes', id, customer_phone FROM quotes WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL
UNION ALL
SELECT 'payments', id, customer_phone FROM payments WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL
UNION ALL
SELECT 'invoices', id, customer_phone FROM invoices WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL
UNION ALL
SELECT 'trip_sheets', id, customer_phone FROM trip_sheets WHERE customer_phone IS NOT NULL AND customer_phone_country_code IS NULL;
