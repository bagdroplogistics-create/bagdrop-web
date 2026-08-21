-- ================================================================
-- Bagdrop — Customer Follow-Up log
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- New manual "Follow Up" action on the Booking Workflow page (available
-- once a booking reaches Quote Created / Quote Sent) — lets an admin send
-- a one-off WhatsApp or email nudge to a customer who hasn't responded to
-- their quote yet, without touching the booking's status/workflow.
--
-- NOT the same thing as the existing `lead_followups` table (see
-- 20260805_sales_followup_reminders.sql) — that table is the automated
-- internal reminder system that pings OPS/sales when a quote/lead has
-- gone quiet for N hours. This table is the opposite direction: a manual,
-- admin-initiated, CUSTOMER-facing message, logged after the fact purely
-- so any admin can see "has someone already followed up with this
-- customer, and how, and when." Deliberately named differently
-- (customer_follow_ups, not follow_ups) to avoid any confusion with that
-- existing table.
--
-- WhatsApp follow-ups are sent by the admin from their own WhatsApp (a
-- wa.me deep link opens with the message pre-filled — nothing is sent
-- automatically from the server), so a WhatsApp row here means "opened
-- with this message", not a delivery-confirmed send. Email follow-ups
-- ARE sent server-side via the existing Resend integration
-- (lib/email.ts's sendEmail()), so an email row's status reflects a real
-- Resend API result.
-- ================================================================

CREATE TABLE IF NOT EXISTS customer_follow_ups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  lead_id      uuid REFERENCES leads(id) ON DELETE SET NULL,
  method       text NOT NULL CHECK (method IN ('whatsapp', 'email')),
  -- 'sent': WhatsApp = wa.me link opened with the message; Email = Resend
  -- accepted the send. 'failed': Email only — Resend returned an error.
  status       text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  subject      text,        -- email only
  message      text,        -- the actual message/body text used, after any admin edits
  initiated_by text,        -- free-text name the admin typed in (no per-user login system exists)
  error        text,        -- Resend error message, when status = 'failed'
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_follow_ups_booking_id  ON customer_follow_ups(booking_id);
CREATE INDEX IF NOT EXISTS idx_customer_follow_ups_created_at  ON customer_follow_ups(created_at DESC);
