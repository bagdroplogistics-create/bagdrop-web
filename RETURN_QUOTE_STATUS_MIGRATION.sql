-- ============================================================
-- BAGDROP — Independent Return Quote status
-- Run in Supabase Dashboard → SQL Editor
--
-- Founder spec 2026-09-22 ("Separate Onward and Return Quotations"):
-- the commercial Onward and Return quotations must be independently
-- generated, sent, and accepted/rejected — accepting one must never
-- imply the other.
--
-- IMPORTANT — this deliberately does NOT touch bookings.status or the
-- existing MIRROR_TO_RETURN_FIELDS sync in app/(admin)/admin/quotes/
-- view/[lead_id]/page.tsx's patchBooking(). That mirroring exists
-- because of an earlier, separate founder decision: "Return Trip
-- round-trips are billed as ONE combined payment" — so once a booking
-- is actually confirmed and moves into the operational Booking
-- Workflow (payment, LR, driver, invoice…), the two legs' bookings
-- intentionally stay in lockstep. This migration only adds a new,
-- independent, lighter-weight layer for the COMMERCIAL QUOTE
-- decision itself (has the customer said yes/no to the return quote
-- as a document) — the step that happens BEFORE payment/confirmation.
-- If the combined-payment model should also change, that's a
-- separate, bigger decision for the Founder to make explicitly.
--
-- Purely additive — all new columns nullable, existing leads/
-- bookings completely unaffected.
-- ============================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS return_quote_status     TEXT,   -- 'sent' | 'accepted' | 'rejected' | null (not yet sent)
  ADD COLUMN IF NOT EXISTS return_quote_sent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_quote_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_quote_rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_rejection_reason  TEXT,
  ADD COLUMN IF NOT EXISTS return_rejection_comment TEXT;

COMMENT ON COLUMN leads.return_quote_status IS 'Independent commercial status of the RETURN quote document itself — separate from bookings.status (which still drives the combined-payment operational workflow). null | sent | accepted | rejected.';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name LIKE 'return_quote_%' OR column_name LIKE 'return_rejection_%'
ORDER BY column_name;
