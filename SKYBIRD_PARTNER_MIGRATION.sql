-- ============================================================================
-- SKYBIRD PARTNER DASHBOARD — DB MIGRATION
-- ============================================================================
-- Adds a hidden/internal "partner_name" column so leads created through the
-- Skybird Partner Dashboard can be tagged and filtered by BagDrop admins,
-- without exposing anything new to Skybird users (they never see this
-- column — it's only rendered in the BagDrop Admin Dashboard).
--
-- The `leads` table ALREADY has a `source` column (used today for values
-- like 'manual', 'website', 'contact-form', 'referral', 'b2b', 'walk-in').
-- This migration adds:
--   1. leads.partner_name        — e.g. 'Skybird USA' (nullable, null = direct/no partner)
--   2. bookings.partner_name     — mirrored onto the auto-created booking row
--      so admin booking views can also show/filter by partner without a join.
--
-- Safe to run multiple times (IF NOT EXISTS guards).
-- Run this in Supabase Dashboard → SQL Editor BEFORE deploying the Skybird
-- Partner Dashboard code (same rule as the international-phone migration —
-- the code writes to these columns, so they must exist first).
-- ============================================================================

ALTER TABLE leads    ADD COLUMN IF NOT EXISTS partner_name TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_name TEXT;

-- Optional: index for the admin "filter by partner" dropdown
CREATE INDEX IF NOT EXISTS idx_leads_partner_name    ON leads(partner_name)    WHERE partner_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_partner_name ON bookings(partner_name) WHERE partner_name IS NOT NULL;

-- ── Verification ─────────────────────────────────────────────────────────
-- Run after migration to confirm columns exist:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'leads' AND column_name = 'partner_name';
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'bookings' AND column_name = 'partner_name';
