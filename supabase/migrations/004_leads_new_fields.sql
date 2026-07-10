-- ================================================================
-- Migration 004: Add new fields to leads table
-- Run in: Supabase Dashboard → SQL Editor
-- ================================================================

-- New date fields
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pickup_date    date,
  ADD COLUMN IF NOT EXISTS delivery_date  date;

-- Pickup time slot (stored as text, e.g. "08:00 – 10:00")
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pickup_time    text;

-- Flight-related fields (conditional on service type)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pnr               text,
  ADD COLUMN IF NOT EXISTS flight_number     text,
  ADD COLUMN IF NOT EXISTS flight_time       timestamptz,
  ADD COLUMN IF NOT EXISTS flight_ticket_url text;

-- Note: travel_date and bags_count already exist from migration 001.
-- If they don't exist in your DB yet, uncomment:
-- ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS travel_date date;
-- ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bags_count  integer NOT NULL DEFAULT 1;

-- ================================================================
-- Verification: run this to confirm columns exist
-- ================================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'leads'
-- ORDER BY ordinal_position;
