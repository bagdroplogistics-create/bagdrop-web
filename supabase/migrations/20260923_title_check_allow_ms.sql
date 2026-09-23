-- ================================================================
-- Bagdrop — Fix Title CHECK constraints to allow 'M/S' (Business title)
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
--
-- ROOT CAUSE (2026-09-23, "Inquiry creation failed" emails for
-- BDA-2026-0214 and BDA-2026-0215, customer Sanya Chandwani):
--
--   lib/constants.ts's TITLE_OPTIONS was widened to
--   ['Mr.', 'Mrs.', 'Ms.', 'M/S'] back in commit 21123c5a
--   ("quotation update and title add") to support Business Customers
--   (company/firm names like "M/S ABC Traders"). The PUBLIC booking
--   form's own Title dropdown (components/booking/step-review.tsx)
--   renders every value in TITLE_OPTIONS directly — so "M/S" has been
--   a selectable option for every website customer, not just internal
--   Business Customer quotes.
--
--   But supabase/migrations/20260801_customer_title.sql's CHECK
--   constraints were never updated to match — they still only allow
--   ('Mr.', 'Mrs.', 'Ms.'). Any customer who picks "M/S" on the public
--   booking form hits `new row for relation "bookings" violates check
--   constraint "bookings_title_check"` at insert time. The booking
--   fails AFTER the tracking ID/inquiry number was already generated,
--   so the customer's inquiry number is burned and nothing is saved —
--   exactly the "Inquiry creation failed" alert emails being received.
--
-- FIX: widen every *_title_check constraint (same 5 tables the
-- original migration touched) to also allow 'M/S', matching the
-- frontend's actual TITLE_OPTIONS list. This does not relax the
-- constraint to "anything" — it still rejects any other invalid value,
-- it just stops rejecting the one value the UI has been legitimately
-- offering since August.
--
-- Purely additive: no column, data, or unrelated constraint changed.
-- Safely re-runnable (drops + recreates each constraint by name).
-- ================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_title_check') THEN
    ALTER TABLE bookings DROP CONSTRAINT bookings_title_check;
  END IF;
  ALTER TABLE bookings
    ADD CONSTRAINT bookings_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.', 'M/S'));

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_title_check') THEN
    ALTER TABLE leads DROP CONSTRAINT leads_title_check;
  END IF;
  ALTER TABLE leads
    ADD CONSTRAINT leads_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.', 'M/S'));

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_title_check') THEN
    ALTER TABLE quotes DROP CONSTRAINT quotes_title_check;
  END IF;
  ALTER TABLE quotes
    ADD CONSTRAINT quotes_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.', 'M/S'));

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_title_check') THEN
    ALTER TABLE invoices DROP CONSTRAINT invoices_title_check;
  END IF;
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.', 'M/S'));

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_title_check') THEN
    ALTER TABLE payments DROP CONSTRAINT payments_title_check;
  END IF;
  ALTER TABLE payments
    ADD CONSTRAINT payments_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.', 'M/S'));
END $$;

-- Verify — should show all 5 constraints now including 'M/S':
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname LIKE '%_title_check' ORDER BY conname;
