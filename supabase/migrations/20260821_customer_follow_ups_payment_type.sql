-- ================================================================
-- Bagdrop — Payment Follow-Up support on customer_follow_ups
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- (Follow-up migration to 20260820_customer_follow_ups.sql — run that
-- one first if it hasn't been run yet.)
-- ================================================================
--
-- WHY THIS EXISTS
-- New "Payment Follow Up" action (separate button from the existing
-- general "Follow Up") for outstanding/partially-paid bookings — including
-- ones where the service is already Completed. Reuses the same
-- customer_follow_ups table/history UI as the general follow-up feature,
-- distinguished by a new `follow_up_type` column, so Admin has ONE
-- follow-up history per booking instead of two separate logs.
--
-- `outstanding_amount` records what the customer still owed AT THE TIME
-- this specific reminder was sent (not a live/recomputed value) — lets
-- Admin see "last reminded when ₹4,140 was outstanding" even if the
-- balance has since changed.
-- ================================================================

ALTER TABLE customer_follow_ups
  ADD COLUMN IF NOT EXISTS follow_up_type text NOT NULL DEFAULT 'general'
    CHECK (follow_up_type IN ('general', 'payment')),
  ADD COLUMN IF NOT EXISTS outstanding_amount numeric(10, 2);

CREATE INDEX IF NOT EXISTS idx_customer_follow_ups_type ON customer_follow_ups(follow_up_type);

COMMENT ON COLUMN customer_follow_ups.follow_up_type IS
  'general = quote-not-responded nudge (Booking Workflow / Leads). payment = outstanding-payment reminder, available whenever a booking has outstanding_amount > 0 regardless of booking/service status.';
COMMENT ON COLUMN customer_follow_ups.outstanding_amount IS
  'Outstanding amount at the moment this payment follow-up was sent (payment type only) — a snapshot, not a live value.';
