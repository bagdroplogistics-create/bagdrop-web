-- ================================================================
-- Bagdrop — Automatic Inquiry Acknowledgment
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
--
-- Adds the columns needed to (a) guarantee an acknowledgment is only
-- ever sent once per lead, and (b) keep an auditable log of every
-- communication attempt (channel, status, timestamp) for that lead.
-- ================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS acknowledgment_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS communication_log      jsonb DEFAULT '[]'::jsonb;

-- Speeds up the atomic "claim" update used to prevent duplicate sends
-- (UPDATE ... WHERE id = $1 AND acknowledgment_sent_at IS NULL).
CREATE INDEX IF NOT EXISTS leads_acknowledgment_sent_at_idx ON leads(acknowledgment_sent_at);
