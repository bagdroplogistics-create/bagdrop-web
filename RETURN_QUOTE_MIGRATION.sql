-- ============================================================
-- BAGDROP — Return Quote Support Migration
-- Run in Supabase Dashboard → SQL Editor
--
-- Adds return journey quote fields to the leads table so that
-- a second quote (return trip) can be stored without overwriting
-- the primary (outward journey) quote data.
-- ============================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS return_quote_number     TEXT,
  ADD COLUMN IF NOT EXISTS return_quote_line_items JSONB,
  ADD COLUMN IF NOT EXISTS return_quote_total      NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS return_quote_subtotal   NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS return_quote_tax        NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS return_quote_date       DATE,
  ADD COLUMN IF NOT EXISTS return_from_city        TEXT,
  ADD COLUMN IF NOT EXISTS return_to_city          TEXT,
  ADD COLUMN IF NOT EXISTS return_bags_count       INTEGER,
  ADD COLUMN IF NOT EXISTS return_pickup_date      DATE,
  ADD COLUMN IF NOT EXISTS return_pickup_address   TEXT,
  ADD COLUMN IF NOT EXISTS return_discount_pct     NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS return_discount_amt     NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS return_quote_notes      TEXT;

-- Unique index for return quote numbers
CREATE UNIQUE INDEX IF NOT EXISTS leads_return_quote_number_idx
  ON leads (return_quote_number) WHERE return_quote_number IS NOT NULL;

COMMENT ON COLUMN leads.return_quote_number     IS 'Quote number for return journey, e.g. QT-2026-0023-R';
COMMENT ON COLUMN leads.return_quote_line_items IS 'JSON line items for return journey quote';
COMMENT ON COLUMN leads.return_quote_total      IS 'Return journey grand total incl. GST';
COMMENT ON COLUMN leads.return_from_city        IS 'Return journey departure city';
COMMENT ON COLUMN leads.return_to_city          IS 'Return journey destination city';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name LIKE 'return_%'
ORDER BY column_name;
