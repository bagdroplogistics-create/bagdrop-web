-- Migration: Internal quote storage on leads table
-- Removes dependency on Zoho Books for quote generation.
-- Quotes are now created and stored entirely in Supabase.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS quote_number       TEXT,
  ADD COLUMN IF NOT EXISTS quote_line_items   JSONB,
  ADD COLUMN IF NOT EXISTS quote_total        NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS quote_subtotal     NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS quote_tax          NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS quote_date         DATE,
  ADD COLUMN IF NOT EXISTS quote_expiry_date  DATE,
  ADD COLUMN IF NOT EXISTS quote_notes        TEXT,
  ADD COLUMN IF NOT EXISTS quote_terms        TEXT,
  ADD COLUMN IF NOT EXISTS salesperson_name   TEXT,
  ADD COLUMN IF NOT EXISTS agent_name         TEXT,
  ADD COLUMN IF NOT EXISTS quote_subject      TEXT;

-- Index for looking up by quote number
CREATE UNIQUE INDEX IF NOT EXISTS leads_quote_number_idx
  ON leads (quote_number) WHERE quote_number IS NOT NULL;

-- Also allow zoho fields to be nullable (they were before, just being explicit)
COMMENT ON COLUMN leads.quote_number     IS 'Internal quote number, e.g. QT-2026-0022';
COMMENT ON COLUMN leads.quote_line_items IS 'JSON array of line items: [{name, description, quantity, rate, tax_pct, amount}]';
COMMENT ON COLUMN leads.quote_total      IS 'Grand total incl. GST';
COMMENT ON COLUMN leads.quote_subtotal   IS 'Total before tax';
COMMENT ON COLUMN leads.quote_tax        IS 'Total GST amount';
