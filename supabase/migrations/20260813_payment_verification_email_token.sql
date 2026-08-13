-- BAGDROP — Payment Verification via Email (Approve/Reject without dashboard login)
--
-- Lets the Account Department approve or reject an uploaded payment proof
-- directly from the notification email, without logging into the admin
-- dashboard. Same security model as the existing indemnity-bond signing
-- links (supabase/migrations for indemnity_bonds.secure_token): a single,
-- unguessable random token per payment, resolved by a public route, valid
-- for a limited window.
--
-- Run this in the Supabase SQL editor.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS verification_token             text,
  ADD COLUMN IF NOT EXISTS verification_token_expires_at  timestamptz;

-- Partial unique index — most payments will never get a token (only ones
-- created via the payment-proof upload flow do), so this only enforces
-- uniqueness where a token actually exists.
CREATE UNIQUE INDEX IF NOT EXISTS payments_verification_token_idx
  ON payments (verification_token)
  WHERE verification_token IS NOT NULL;
