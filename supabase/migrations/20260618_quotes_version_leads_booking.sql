-- ================================================================
-- Bagdrop Migration: quotes.version + leads.booking_id + leads fields
-- Run in Supabase SQL Editor after 20260618_crm_tables.sql
-- ================================================================

-- Add version tracking to quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Add service_type alias (leads uses service_type, migration used service_interest)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS service_type text;

-- Add lead_number for consistent numbering (BDL-YYYY-NNNN)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_number text;

-- Add booking_id to leads for auto-created leads from website bookings
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL;

-- Unique index on lead_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_lead_number ON leads(lead_number) WHERE lead_number IS NOT NULL;

-- Index on leads.phone for fast duplicate check in auto-lead creation
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);

-- Index on leads.booking_id
CREATE INDEX IF NOT EXISTS idx_leads_booking_id ON leads(booking_id);

-- Index on quotes.version (useful for ordering)
CREATE INDEX IF NOT EXISTS idx_quotes_version ON quotes(id, version);
