-- ================================================================
-- Bagdrop CRM Tables Migration
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================

-- ── LEADS TABLE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  text NOT NULL,
  phone                 text NOT NULL,
  email                 text,
  source                text DEFAULT 'manual',        -- manual | website | referral | b2b | walk-in
  service_interest      text,                          -- airport-to-door | door-to-airport | intercity
  from_city             text,
  to_city               text,
  travel_date           date,
  bags_count            integer DEFAULT 1,
  status                text DEFAULT 'new',            -- new | contacted | qualified | converted | lost
  notes                 text,
  assigned_to           text,
  converted_booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ── QUOTES TABLE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_number          text UNIQUE NOT NULL,          -- BDQ-2026-0001
  lead_id               uuid REFERENCES leads(id) ON DELETE SET NULL,
  customer_name         text NOT NULL,
  customer_phone        text NOT NULL,
  customer_email        text,
  service_type          text NOT NULL,                 -- airport-to-door | door-to-airport | intercity
  from_city             text NOT NULL,
  to_city               text NOT NULL,
  pickup_date           date,
  time_slot             text,
  total_bags            integer DEFAULT 1,
  base_price            numeric(10,2) DEFAULT 0,
  cgst                  numeric(10,2) DEFAULT 0,
  sgst                  numeric(10,2) DEFAULT 0,
  total_amount          numeric(10,2) DEFAULT 0,
  status                text DEFAULT 'draft',          -- draft | sent | accepted | rejected | expired
  valid_until           date,
  notes                 text,
  converted_booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ── INDEXES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS leads_status_idx       ON leads(status);
CREATE INDEX IF NOT EXISTS leads_phone_idx        ON leads(phone);
CREATE INDEX IF NOT EXISTS leads_created_at_idx   ON leads(created_at DESC);

CREATE INDEX IF NOT EXISTS quotes_status_idx      ON quotes(status);
CREATE INDEX IF NOT EXISTS quotes_lead_id_idx     ON quotes(lead_id);
CREATE INDEX IF NOT EXISTS quotes_created_at_idx  ON quotes(created_at DESC);

-- ── AUTO-UPDATE updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS quotes_updated_at ON quotes;
CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── QUOTE NUMBER SEQUENCE ─────────────────────────────────────────
-- Quote numbers: BDQ-YYYY-NNNN  (auto-generated in API)
-- No sequence needed — API generates via COUNT + 1

-- ── RLS: service_role bypasses all policies ───────────────────────
ALTER TABLE leads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Service role (used by the admin API) can do everything
CREATE POLICY "service_role_all_leads"  ON leads  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_quotes" ON quotes FOR ALL TO service_role USING (true) WITH CHECK (true);
