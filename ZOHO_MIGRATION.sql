-- ================================================================
-- BAGDROP — Zoho Books Integration Migration
-- Run this in Supabase SQL Editor
-- ================================================================
-- Adds Zoho Books estimate tracking columns to the leads table

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS zoho_estimate_id     TEXT,
  ADD COLUMN IF NOT EXISTS zoho_estimate_number TEXT;

-- Optional: index for quick lookups by estimate number
CREATE INDEX IF NOT EXISTS idx_leads_zoho_estimate_number
  ON leads (zoho_estimate_number)
  WHERE zoho_estimate_number IS NOT NULL;

-- ================================================================
-- Required environment variables for .env.local:
-- ================================================================
-- ZOHO_CLIENT_ID=<from Zoho API Console Self Client>
-- ZOHO_CLIENT_SECRET=<from Zoho API Console Self Client>
-- ZOHO_REFRESH_TOKEN=<one-time OAuth exchange — see lib/zoho-books.ts>
-- ZOHO_ORG_ID=60041657788
-- ================================================================
