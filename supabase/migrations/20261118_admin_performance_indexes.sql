-- ─────────────────────────────────────────────────────────────────────────────
-- Admin dashboard performance — indexes for list, filter, sort and search.
--
-- WHY: every admin list sorts by created_at DESC, filters by status / is_test /
-- deleted_at, and searches with ILIKE '%text%' on name / phone / ids. Without
-- matching indexes Postgres reads and sorts the WHOLE table for every request,
-- so the dashboard is fast while tables are small and slows down as rows grow —
-- the "fast for a while, then slow again" pattern.
--
--   · B-tree indexes  → ORDER BY created_at DESC + status/is_test filters become
--                       an index scan that stops after one page of rows.
--   · pg_trgm GIN     → ILIKE '%partial%' search on name / phone / ids uses an
--                       index instead of scanning every row.
--
-- SAFE TO RE-RUN: every statement is IF NOT EXISTS. Each index is only created
-- if its table AND every column it needs actually exist, so one missing column
-- can never abort the script. Read-only for data; adds indexes only.
-- Run once in the Supabase SQL editor (takes seconds at current table sizes).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION pg_temp.bd_make_index(
  idx_name text, tbl text, needed_cols text[], ddl text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE missing int;
BEGIN
  IF to_regclass('public.' || tbl) IS NULL THEN
    RAISE NOTICE 'skip % (table % missing)', idx_name, tbl; RETURN;
  END IF;
  SELECT count(*) INTO missing
  FROM unnest(needed_cols) c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tbl AND column_name = c
  );
  IF missing > 0 THEN
    RAISE NOTICE 'skip % (% column(s) missing on %)', idx_name, missing, tbl; RETURN;
  END IF;
  EXECUTE ddl;
  RAISE NOTICE 'ok   %', idx_name;
END $$;

-- ── bookings ────────────────────────────────────────────────────────────────
SELECT pg_temp.bd_make_index('idx_bookings_list_created', 'bookings', ARRAY['is_test','created_at'],
  'CREATE INDEX IF NOT EXISTS idx_bookings_list_created ON bookings (is_test, created_at DESC)');
SELECT pg_temp.bd_make_index('idx_bookings_status_created', 'bookings', ARRAY['status','created_at'],
  'CREATE INDEX IF NOT EXISTS idx_bookings_status_created ON bookings (status, created_at DESC)');
SELECT pg_temp.bd_make_index('idx_bookings_trgm_tracking', 'bookings', ARRAY['tracking_id'],
  'CREATE INDEX IF NOT EXISTS idx_bookings_trgm_tracking ON bookings USING gin (tracking_id gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_bookings_trgm_name', 'bookings', ARRAY['customer_name'],
  'CREATE INDEX IF NOT EXISTS idx_bookings_trgm_name ON bookings USING gin (customer_name gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_bookings_trgm_phone', 'bookings', ARRAY['customer_phone'],
  'CREATE INDEX IF NOT EXISTS idx_bookings_trgm_phone ON bookings USING gin (customer_phone gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_bookings_trgm_email', 'bookings', ARRAY['customer_email'],
  'CREATE INDEX IF NOT EXISTS idx_bookings_trgm_email ON bookings USING gin (customer_email gin_trgm_ops)');

-- ── leads ───────────────────────────────────────────────────────────────────
SELECT pg_temp.bd_make_index('idx_leads_created', 'leads', ARRAY['created_at'],
  'CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC)');
SELECT pg_temp.bd_make_index('idx_leads_live_created', 'leads', ARRAY['is_test','created_at','id'],
  'CREATE INDEX IF NOT EXISTS idx_leads_live_created ON leads (is_test, created_at DESC, id DESC)');
SELECT pg_temp.bd_make_index('idx_leads_booking', 'leads', ARRAY['booking_id'],
  'CREATE INDEX IF NOT EXISTS idx_leads_booking ON leads (booking_id)');
SELECT pg_temp.bd_make_index('idx_leads_status_created', 'leads', ARRAY['status','created_at'],
  'CREATE INDEX IF NOT EXISTS idx_leads_status_created ON leads (status, created_at DESC)');
SELECT pg_temp.bd_make_index('idx_leads_trgm_name', 'leads', ARRAY['name'],
  'CREATE INDEX IF NOT EXISTS idx_leads_trgm_name ON leads USING gin (name gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_leads_trgm_phone', 'leads', ARRAY['phone'],
  'CREATE INDEX IF NOT EXISTS idx_leads_trgm_phone ON leads USING gin (phone gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_leads_trgm_number', 'leads', ARRAY['lead_number'],
  'CREATE INDEX IF NOT EXISTS idx_leads_trgm_number ON leads USING gin (lead_number gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_leads_trgm_quote', 'leads', ARRAY['quote_number'],
  'CREATE INDEX IF NOT EXISTS idx_leads_trgm_quote ON leads USING gin (quote_number gin_trgm_ops)');

-- ── payments ────────────────────────────────────────────────────────────────
SELECT pg_temp.bd_make_index('idx_payments_created', 'payments', ARRAY['created_at'],
  'CREATE INDEX IF NOT EXISTS idx_payments_created ON payments (created_at DESC)');
SELECT pg_temp.bd_make_index('idx_payments_status_created', 'payments', ARRAY['status','created_at'],
  'CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments (status, created_at DESC)');
SELECT pg_temp.bd_make_index('idx_payments_booking', 'payments', ARRAY['booking_id'],
  'CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments (booking_id)');
SELECT pg_temp.bd_make_index('idx_payments_trgm_name', 'payments', ARRAY['customer_name'],
  'CREATE INDEX IF NOT EXISTS idx_payments_trgm_name ON payments USING gin (customer_name gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_payments_trgm_phone', 'payments', ARRAY['customer_phone'],
  'CREATE INDEX IF NOT EXISTS idx_payments_trgm_phone ON payments USING gin (customer_phone gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_payments_trgm_payment_id', 'payments', ARRAY['payment_id'],
  'CREATE INDEX IF NOT EXISTS idx_payments_trgm_payment_id ON payments USING gin (payment_id gin_trgm_ops)');

-- ── lrs ─────────────────────────────────────────────────────────────────────
SELECT pg_temp.bd_make_index('idx_lrs_created', 'lrs', ARRAY['created_at'],
  'CREATE INDEX IF NOT EXISTS idx_lrs_created ON lrs (created_at DESC)');
SELECT pg_temp.bd_make_index('idx_lrs_booking', 'lrs', ARRAY['booking_id'],
  'CREATE INDEX IF NOT EXISTS idx_lrs_booking ON lrs (booking_id)');
SELECT pg_temp.bd_make_index('idx_lrs_branch_fy_created', 'lrs', ARRAY['branch_id','financial_year','created_at'],
  'CREATE INDEX IF NOT EXISTS idx_lrs_branch_fy_created ON lrs (branch_id, financial_year, created_at DESC)');
SELECT pg_temp.bd_make_index('idx_lrs_trgm_number', 'lrs', ARRAY['lr_number'],
  'CREATE INDEX IF NOT EXISTS idx_lrs_trgm_number ON lrs USING gin (lr_number gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_lrs_trgm_consignor', 'lrs', ARRAY['consignor_name'],
  'CREATE INDEX IF NOT EXISTS idx_lrs_trgm_consignor ON lrs USING gin (consignor_name gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_lrs_trgm_consignee', 'lrs', ARRAY['consignee_name'],
  'CREATE INDEX IF NOT EXISTS idx_lrs_trgm_consignee ON lrs USING gin (consignee_name gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_lrs_trgm_mobile', 'lrs', ARRAY['consignor_mobile'],
  'CREATE INDEX IF NOT EXISTS idx_lrs_trgm_mobile ON lrs USING gin (consignor_mobile gin_trgm_ops)');

-- ── trip_sheets ─────────────────────────────────────────────────────────────
SELECT pg_temp.bd_make_index('idx_trip_sheets_created', 'trip_sheets', ARRAY['created_at'],
  'CREATE INDEX IF NOT EXISTS idx_trip_sheets_created ON trip_sheets (created_at DESC)');
SELECT pg_temp.bd_make_index('idx_trip_sheets_booking', 'trip_sheets', ARRAY['booking_id'],
  'CREATE INDEX IF NOT EXISTS idx_trip_sheets_booking ON trip_sheets (booking_id)');
SELECT pg_temp.bd_make_index('idx_trip_sheets_status_created', 'trip_sheets', ARRAY['status','created_at'],
  'CREATE INDEX IF NOT EXISTS idx_trip_sheets_status_created ON trip_sheets (status, created_at DESC)');
SELECT pg_temp.bd_make_index('idx_trip_sheets_trgm_number', 'trip_sheets', ARRAY['trip_number'],
  'CREATE INDEX IF NOT EXISTS idx_trip_sheets_trgm_number ON trip_sheets USING gin (trip_number gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_trip_sheets_trgm_name', 'trip_sheets', ARRAY['customer_name'],
  'CREATE INDEX IF NOT EXISTS idx_trip_sheets_trgm_name ON trip_sheets USING gin (customer_name gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_trip_sheets_trgm_driver', 'trip_sheets', ARRAY['driver_name'],
  'CREATE INDEX IF NOT EXISTS idx_trip_sheets_trgm_driver ON trip_sheets USING gin (driver_name gin_trgm_ops)');
SELECT pg_temp.bd_make_index('idx_trip_expenses_trip_sheet', 'trip_expenses', ARRAY['trip_sheet_id'],
  'CREATE INDEX IF NOT EXISTS idx_trip_expenses_trip_sheet ON trip_expenses (trip_sheet_id)');

-- ── invoices ────────────────────────────────────────────────────────────────
SELECT pg_temp.bd_make_index('idx_invoices_created', 'invoices', ARRAY['created_at'],
  'CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices (created_at DESC)');
SELECT pg_temp.bd_make_index('idx_invoices_status_created', 'invoices', ARRAY['status','created_at'],
  'CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices (status, created_at DESC)');
SELECT pg_temp.bd_make_index('idx_invoices_booking', 'invoices', ARRAY['booking_id'],
  'CREATE INDEX IF NOT EXISTS idx_invoices_booking ON invoices (booking_id)');
SELECT pg_temp.bd_make_index('idx_invoices_trgm_number', 'invoices', ARRAY['invoice_number'],
  'CREATE INDEX IF NOT EXISTS idx_invoices_trgm_number ON invoices USING gin (invoice_number gin_trgm_ops)');

-- Refresh planner statistics so the new indexes are used straight away.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings','leads','payments','lrs','trip_sheets','trip_expenses','invoices'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN EXECUTE format('ANALYZE public.%I', t); END IF;
  END LOOP;
END $$;
