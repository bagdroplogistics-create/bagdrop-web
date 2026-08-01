-- ================================================================
-- Bagdrop — Customer Title Field (Mr. / Mrs. / Ms.)
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
--
-- Adds a `title` column to every table that stores a customer's name
-- (bookings, leads, and the legacy quotes table — there is no single
-- normalized `customers` table in this schema, so the field is added
-- to all three independently). Existing rows are back-filled to
-- 'Mr.' automatically by the NOT NULL DEFAULT clause (metadata-only
-- operation in Postgres 11+, no separate UPDATE needed). Admins can
-- edit the title on any existing record at any time — this migration
-- only sets the initial default for records that predate the field.
--
-- Purely additive: no existing column, workflow, or relationship is
-- changed or removed.
-- ================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

-- invoices and payments (supabase/migrations/20260618_payments_invoices_settings.sql)
-- also carry their own denormalized customer_name — the Invoice PDF is one
-- of the explicitly required display surfaces, so title needs to live here
-- too, not just on bookings/leads/quotes.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so guard each CHECK
-- constraint manually to keep this migration safely re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_title_check'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_title_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_title_check'
  ) THEN
    ALTER TABLE quotes
      ADD CONSTRAINT quotes_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_title_check'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_title_check'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;
END $$;
