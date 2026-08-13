-- ================================================================
-- Payment proof upload + verification workflow
-- Run in Supabase SQL Editor
-- ================================================================
--
-- Adds a payment-proof-upload + accounts-verification sub-flow that is
-- deliberately kept SEPARATE from the existing `bookings.status` workflow
-- state machine and the existing 'payment_approved' status (which already
-- means "admin approved without payment / Pay Later" — see
-- app/(admin)/admin/page.tsx's adminApprovePayLater()). Reusing that status
-- for accounts-verified-payment would collide with the existing Pay Later
-- flow, so this is a new, independent field instead.
--
-- payment_verification_status values:
--   null                   — no proof uploaded yet (default / not applicable)
--   'pending_verification' — proof uploaded, awaiting Accounts sign-off
--   'verified'             — Accounts approved the payment
--   'rejected'             — Accounts rejected the payment proof
--
-- This does NOT change bookings.status or bookings.payment_status directly
-- — see app/api/admin/payments/[id]/route.ts, which already syncs
-- bookings.payment_status when a payments row's payment_status changes to
-- 'paid'/'refunded'. This migration extends that same payments table with
-- proof_url and lets its payment_status also take 'pending_verification'
-- and 'rejected' values (both are plain text columns already, so no CHECK
-- constraint needs altering).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_verification_status text,
  ADD COLUMN IF NOT EXISTS payment_verification_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS proof_url  text,
  ADD COLUMN IF NOT EXISTS proof_type text; -- 'image' | 'pdf' — set from the uploaded file's mime type

CREATE INDEX IF NOT EXISTS bookings_payment_verification_status_idx
  ON bookings(payment_verification_status);

-- ================================================================
-- Manual step required: create the Supabase Storage bucket for proofs
-- ================================================================
-- This migration cannot create a Storage bucket via SQL. In the Supabase
-- dashboard: Storage → New bucket → name it exactly "payment-proofs" →
-- make it Public (same as the existing "quotes" bucket used for quote
-- PDFs) so uploaded proof URLs work the same way quote PDF URLs already do.
