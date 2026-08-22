-- ================================================================
-- Bagdrop — Review request support on customer_follow_ups
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- (Follow-up migration — run 20260820_customer_follow_ups.sql and
-- 20260821_customer_follow_ups_payment_type.sql first if not already run.)
-- ================================================================
--
-- WHY THIS EXISTS
-- New "⭐ Review" action on Completed bookings (founder spec, 2026-08-22) —
-- lets Admin send a Google review request to the customer via WhatsApp or
-- Email, or just open the Google review page directly. Reuses the same
-- customer_follow_ups table/history as the general and payment follow-ups
-- (one combined history per booking) via a third follow_up_type value.
--
-- Deliberately does NOT touch bookings.status, payment_status, or trigger
-- any other workflow — purely an additional, manually-triggered, optional
-- customer communication, same as the other two follow-up types.
-- ================================================================

ALTER TABLE customer_follow_ups
  DROP CONSTRAINT IF EXISTS customer_follow_ups_follow_up_type_check;

ALTER TABLE customer_follow_ups
  ADD CONSTRAINT customer_follow_ups_follow_up_type_check
    CHECK (follow_up_type IN ('general', 'payment', 'review'));

COMMENT ON COLUMN customer_follow_ups.follow_up_type IS
  'general = quote-not-responded nudge (Booking Workflow / Leads). payment = outstanding-payment reminder, available whenever a booking has outstanding_amount > 0 regardless of booking/service status. review = Google review request, available only once a booking reaches Completed status.';
