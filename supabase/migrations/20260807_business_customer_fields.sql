-- ================================================================
-- Bagdrop — "Payment By: Business / Company" support (simplified)
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- Adds a simple "who is actually paying" flag to the New Quote form —
-- Individual (default, unchanged) or Business / Company. When Business
-- is selected, just 4 fields are captured: Business/Company Name,
-- Business/Company Address, GST Number (optional), Payment Terms.
--
-- This replaces an earlier, much larger Zoho-Books-style version of this
-- migration (GST Treatment, Place of Supply, Currency, Accounts
-- Receivable, Department, social profiles, etc.) that was cut down to
-- only what BagDrop's operations actually need — see lib/constants.ts.
-- If you already ran the earlier version of this file, this one is safe
-- to re-run: every ADD COLUMN uses IF NOT EXISTS, and the extra unused
-- columns from that earlier version are dropped at the bottom (only if
-- they exist and are still empty everywhere, so this never silently
-- discards real typed-in data).
--
-- Added to `leads`, `bookings`, AND `invoices` (unlike the single-table
-- earlier version) so the business name/address/GST also carry through to
-- documents generated from a booking — Invoice, LR — not just the
-- Quotation, which reads from `leads` directly. LR reads consignee name
-- from `bookings.customer_name` at print time (see lrs/[id]/page.tsx), so
-- no separate LR-table columns are needed beyond what `bookings` already
-- has here.
-- ================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS customer_type     text DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS business_name     text,
  ADD COLUMN IF NOT EXISTS business_address  text,
  ADD COLUMN IF NOT EXISTS gst_number        text,
  ADD COLUMN IF NOT EXISTS payment_terms     text DEFAULT 'Due on Receipt';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_type     text DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS business_name     text,
  ADD COLUMN IF NOT EXISTS business_address  text,
  ADD COLUMN IF NOT EXISTS gst_number        text,
  ADD COLUMN IF NOT EXISTS payment_terms     text DEFAULT 'Due on Receipt';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS customer_type     text DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS business_name     text,
  ADD COLUMN IF NOT EXISTS business_address  text,
  ADD COLUMN IF NOT EXISTS gst_number        text;

-- Backfill: every existing row is an Individual customer by definition
-- (Business support didn't exist before this migration).
UPDATE leads    SET customer_type = 'individual' WHERE customer_type IS NULL;
UPDATE bookings SET customer_type = 'individual' WHERE customer_type IS NULL;
UPDATE invoices SET customer_type = 'individual' WHERE customer_type IS NULL;

COMMENT ON COLUMN leads.customer_type    IS 'individual | business — see lib/constants.ts CUSTOMER_TYPES';
COMMENT ON COLUMN bookings.customer_type IS 'individual | business — see lib/constants.ts CUSTOMER_TYPES';
COMMENT ON COLUMN invoices.customer_type  IS 'individual | business — see lib/constants.ts CUSTOMER_TYPES';

-- ── Cleanup: drop the wider field set from the earlier version of this
-- migration, if it was already run. Only drops a column if every row's
-- value is still empty — i.e. nobody actually used it yet — so this can
-- never silently delete real data an admin typed in.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'gst_treatment')
     AND NOT EXISTS (SELECT 1 FROM leads WHERE gst_treatment IS NOT NULL) THEN
    ALTER TABLE leads
      DROP COLUMN IF EXISTS gst_treatment,
      DROP COLUMN IF EXISTS place_of_supply,
      DROP COLUMN IF EXISTS currency,
      DROP COLUMN IF EXISTS accounts_receivable,
      DROP COLUMN IF EXISTS website_url,
      DROP COLUMN IF EXISTS department,
      DROP COLUMN IF EXISTS designation,
      DROP COLUMN IF EXISTS contact_person,
      DROP COLUMN IF EXISTS alternate_contact_number,
      DROP COLUMN IF EXISTS twitter_profile,
      DROP COLUMN IF EXISTS facebook_profile,
      DROP COLUMN IF EXISTS linkedin_profile,
      DROP COLUMN IF EXISTS instagram_profile,
      DROP COLUMN IF EXISTS skype_id,
      DROP COLUMN IF EXISTS business_registration_number,
      DROP COLUMN IF EXISTS pan_number;
  END IF;
END $$;
