-- BAGDROP — FOC (Free of Charge) Billing Type
--
-- Founder spec (2026-09-08): admins need to mark a quotation as FOC
-- (complimentary/no-charge) instead of Paid. FOC is a BILLING TYPE, fully
-- orthogonal to booking status and quote status — it must never require
-- payment, never trigger payment follow-ups or verification, and must
-- never show as an outstanding payment, while every operational workflow
-- (pickup, delivery, driver assignment, tracking) continues to work exactly
-- as it does for a Paid booking.
--
-- Column added to BOTH `leads` (source of truth for the quote itself,
-- built in app/(admin)/admin/quotes/new/page.tsx) and `bookings` (so
-- payment-status derivation in lib/payment-status.ts and every
-- payments/admin list can filter on billing_type without a join back to
-- leads). Both default to 'paid' so every existing row — and every quote
-- created before this migration ships — is completely unaffected.
--
-- NOT a boolean: named to match the Client Type / Billing Type field in
-- the spec directly, and to leave room for a future billing type without
-- another migration (e.g. a subsidized/partner rate) — but only 'paid' and
-- 'foc' are used today.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'paid';

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_billing_type_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_billing_type_check
  CHECK (billing_type IN ('paid', 'foc'));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'paid';

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_billing_type_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_billing_type_check
  CHECK (billing_type IN ('paid', 'foc'));

-- payment_status already exists on `bookings` as a free-form text column
-- (no CHECK constraint in the original migrations — see
-- supabase/migrations/20260618_payments_invoices_settings.sql) so adding
-- the new 'not_applicable' value used by lib/payment-status.ts for FOC
-- bookings needs no constraint change here.

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('leads', 'bookings') AND column_name = 'billing_type';
