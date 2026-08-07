-- ================================================================
-- Bagdrop — Business Customer support for the New Quote form
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- Adds support for "Business" customers (as opposed to the existing
-- "Individual" flow) on the New Quote form, modeled functionally on
-- Zoho Books' New Customer dialog. Purely additive — every column
-- below is nullable with a safe default, so existing Individual
-- customers and every existing quotation/booking/pricing code path are
-- completely unaffected. No existing column is touched or renamed.
--
-- All new fields live on `leads` (the same table quote_terms,
-- quote_notes, etc. already live on) since that's this schema's
-- customer/quote record — see lib/constants.ts's "no single normalized
-- customers table" note. The "Select Existing Customer" search
-- endpoint (app/api/admin/customers/search/route.ts) reads these from
-- `leads` so a saved Business customer's details can be reused on a
-- future quote without re-entering them.
-- ================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS customer_type text DEFAULT 'individual',

  -- Business Information
  ADD COLUMN IF NOT EXISTS business_name          text,
  ADD COLUMN IF NOT EXISTS gst_number             text,
  ADD COLUMN IF NOT EXISTS gst_treatment          text,
  ADD COLUMN IF NOT EXISTS place_of_supply        text,
  ADD COLUMN IF NOT EXISTS currency               text DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS accounts_receivable     text,
  ADD COLUMN IF NOT EXISTS payment_terms          text DEFAULT 'Due on Receipt',

  -- "Add More Details" — Business Details
  ADD COLUMN IF NOT EXISTS website_url            text,
  ADD COLUMN IF NOT EXISTS department             text,
  ADD COLUMN IF NOT EXISTS designation            text,
  ADD COLUMN IF NOT EXISTS contact_person         text,
  ADD COLUMN IF NOT EXISTS alternate_contact_number text,

  -- "Add More Details" — Social Media / Communication
  ADD COLUMN IF NOT EXISTS twitter_profile        text,
  ADD COLUMN IF NOT EXISTS facebook_profile       text,
  ADD COLUMN IF NOT EXISTS linkedin_profile       text,
  ADD COLUMN IF NOT EXISTS instagram_profile      text,
  ADD COLUMN IF NOT EXISTS skype_id               text,

  -- "Add More Details" — Additional Information
  ADD COLUMN IF NOT EXISTS business_registration_number text,
  ADD COLUMN IF NOT EXISTS pan_number             text;

-- Backfill: every existing row is an Individual customer by definition
-- (Business support didn't exist before this migration).
UPDATE leads SET customer_type = 'individual' WHERE customer_type IS NULL;

COMMENT ON COLUMN leads.customer_type IS 'individual | business — see lib/constants.ts CUSTOMER_TYPES';
COMMENT ON COLUMN leads.gst_treatment IS 'One of lib/constants.ts GST_TREATMENT_OPTIONS (free text, not a DB enum, to match Zoho Books labels exactly)';
COMMENT ON COLUMN leads.place_of_supply IS 'Indian state/UT — see lib/constants.ts INDIAN_STATES_UTS';
