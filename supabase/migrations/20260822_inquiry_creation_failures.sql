-- ================================================================
-- Bagdrop — Durable audit trail for silent inquiry creation failures
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- 2026-08-22: three inquiry numbers (BDA-2026-0114, 0115, 0117) were
-- minted from the atomic counter but never resulted in any booking or
-- lead row anywhere — not even as a Lost lead. Investigation confirmed
-- every creation route (admin/leads, contact form, #Y2K form, website
-- booking, Skybird B2B) mints its number FIRST, then attempts to insert
-- the booking and lead rows. If either insert fails after the mint, the
-- number is permanently gone with nothing to show for it — and until now,
-- the only trace was a console.error() line in a server log the founder
-- has no routine access to. The founder confirmed no on-screen error
-- appeared and no repeated save attempts were made, ruling out the
-- "admin saw an error and retried" explanation — meaning some creation
-- attempt failed completely silently.
--
-- This table gives every such failure a permanent, queryable record, and
-- lib/creation-failure-alert.ts additionally emails info@/aditya@ the
-- moment one happens, so this is caught the same day instead of
-- discovered as a mysterious numbering gap days later.
-- ================================================================

CREATE TABLE IF NOT EXISTS inquiry_creation_failures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Which route/flow this happened in — 'admin-leads', 'contact-form',
  -- 'y2k-inquiry', 'website-booking', 'skybird-leads', 'skybird-bookings', etc.
  source          text NOT NULL,

  -- The number(s) that were minted and burned by this failed attempt.
  tracking_id     text,
  lead_number     text,

  -- Which side failed: 'booking_insert', 'lead_insert', or 'both'.
  failure_stage   text NOT NULL,

  -- Whatever customer info was available at the point of failure —
  -- for manual follow-up if this was a real inquiry, not a bot/test hit.
  customer_name   text,
  customer_phone  text,
  customer_email  text,

  -- The raw Postgres/Supabase error message, for diagnosis.
  error_message   text,

  -- Whether the real-time email alert to info@/aditya@ actually went out.
  alert_sent      boolean NOT NULL DEFAULT false,

  -- Set once a human has looked at this and either repaired it (via
  -- /api/admin/repair/create-lead-for-booking or manual recreation) or
  -- confirmed it's safe to ignore (e.g. a bot probe).
  resolved_at     timestamptz,
  resolved_note   text
);

CREATE INDEX IF NOT EXISTS idx_inquiry_creation_failures_created_at
  ON inquiry_creation_failures (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inquiry_creation_failures_unresolved
  ON inquiry_creation_failures (resolved_at) WHERE resolved_at IS NULL;
