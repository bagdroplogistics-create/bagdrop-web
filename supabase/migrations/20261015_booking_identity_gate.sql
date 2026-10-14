-- Booking upgrade: identity gate + server-bound booking sessions + use cases.
-- ADDITIVE ONLY. No existing table/column is altered or dropped.
-- Rollback (manual, in this order):
--   DROP TABLE IF EXISTS identity_verifications; DROP TABLE IF EXISTS booking_sessions;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS use_case, DROP COLUMN IF EXISTS travel_reference,
--     DROP COLUMN IF EXISTS booking_session_id, DROP COLUMN IF EXISTS identity_verification_id;
--   DELETE FROM settings WHERE key IN ('identity_gate_enabled','use_case_picker_enabled','quote_validity_hours') OR key LIKE 'use_case_enabled:%';

-- A booking session binds the OTP-verified customer (Supabase auth user) to one
-- booking attempt. All identity / eligibility calls are checked against user_id.
CREATE TABLE IF NOT EXISTS booking_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,                 -- supabase auth user that completed the OTP
  verified_contact    text NOT NULL,                 -- E.164 phone or email the OTP was verified for
  otp_verified_at     timestamptz NOT NULL DEFAULT now(),
  booking_name        text,                          -- name entered on the form (matched against provider name)
  traveller_name      text,                          -- optional different traveller (payer != traveller)
  use_case            text,
  booking_snapshot    jsonb,                         -- booking state the quote was computed from
  quote               jsonb,                         -- server-computed PricingBreakdown + version
  quote_hash          text,                          -- hash of snapshot+quote to detect tampering
  quote_expires_at    timestamptz,
  consumed_booking_id uuid,                          -- set once a booking was created from this session
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_sessions_user ON booking_sessions(user_id);

-- One row per identity-verification attempt (Setu DigiLocker request).
-- Stores ONLY: provider ref, status, verified name, masked number (last 4), score, outcome, timestamps.
-- Never stores the Aadhaar number, DOB, address, photo or XML.
CREATE TABLE IF NOT EXISTS identity_verifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES booking_sessions(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL,
  provider            text NOT NULL DEFAULT 'setu_digilocker',
  provider_request_id text UNIQUE,                   -- Setu DigiLocker request id (replay/dup protection)
  status              text NOT NULL DEFAULT 'created', -- created | verified | failed | expired
  document_type       text,                          -- 'aadhaar'
  verified_name       text,
  masked_number       text,                          -- e.g. xxxx-xxxx-1234
  booking_name        text,
  name_match_score    numeric(4,3),
  match_outcome       text,                          -- pass | confirm | blocked
  spelling_confirmed_at timestamptz,
  review_status       text,                          -- NULL | pending | approved | rejected
  review_note         text,
  reviewed_by         text,
  reviewed_at         timestamptz,
  consent_at          timestamptz NOT NULL,
  consent_text_version text NOT NULL,
  verified_at         timestamptz,
  expires_at          timestamptz NOT NULL,          -- request validity
  retention_until     timestamptz,                   -- set by policy once approved by legal/compliance
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_session ON identity_verifications(session_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_review ON identity_verifications(review_status) WHERE review_status = 'pending';

-- Use-case + identity links on the single bookings record (nullable, optional).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS use_case text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS travel_reference text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_session_id uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS identity_verification_id uuid;

-- Feature flags / config. Everything new is OFF until an admin turns it on.
INSERT INTO settings (key, value) VALUES
  ('identity_gate_enabled', 'false'),
  ('use_case_picker_enabled', 'false'),
  ('quote_validity_hours',  '24')
ON CONFLICT (key) DO NOTHING;
