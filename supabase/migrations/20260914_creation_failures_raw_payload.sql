-- ================================================================
-- Bagdrop — Capture the full request payload on a creation failure
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- 2026-09-12: a real customer inquiry (BDA-2026-0175, Pankaj Yadav) was
-- minted, then lost outright — the booking insert failed (a bare "HH:MM"
-- reaching the flight_datetime timestamptz column, see
-- app/api/bookings/route.ts's sanitizeFlightDateTime comment) and, because
-- the route continued past that failure instead of returning an error, the
-- customer was told their inquiry was received while nothing was ever
-- saved. inquiry_creation_failures (20260822_inquiry_creation_failures.sql)
-- already caught this and alerted info@/aditya@ the same day — but it only
-- ever stored a handful of summary fields (name/phone/email), so recovering
-- the ACTUAL lost inquiry meant transcribing every other field (addresses,
-- dates, bags, service type, flight details...) by hand from a screenshot
-- of the customer-facing confirmation email.
--
-- This column stores the full, as-received request body for the failed
-- creation attempt, so a lost inquiry can be recreated exactly — via
-- app/api/admin/repair/recreate-lost-inquiry — straight from this table,
-- with nothing retyped from memory or a screenshot.
-- ================================================================

ALTER TABLE inquiry_creation_failures
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

COMMENT ON COLUMN inquiry_creation_failures.raw_payload IS
  'Full as-received request body for the failed creation attempt, when the call site captured it. Feed straight into /api/admin/repair/recreate-lost-inquiry to recreate a fully lost inquiry exactly.';
