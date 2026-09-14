-- ================================================================
-- Bagdrop — Multiple payment proof files per payment submission
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- The Booking Workflow's payment-proof upload only ever stored ONE
-- proof (payments.proof_url / proof_type, added 20260813_payment_
-- verification.sql) — when a customer sent multiple screenshots for the
-- same payment, only the first one survived (single <input>, no
-- `multiple` attribute, API read only FormData.get('file'), single-value
-- column). Founder-reported 2026-09-14.
--
-- proof_urls holds the FULL list of files uploaded in one submission —
-- [{ "url": "...", "type": "image"|"pdf" }, ...] — while proof_url/
-- proof_type keep storing the FIRST file exactly as before, so every
-- existing single-proof record and every existing reader of those two
-- columns keeps working unchanged with zero migration needed on old rows
-- (default '[]' backfills fine; readers fall back to
-- [{url: proof_url, type: proof_type}] when proof_urls is empty).
-- ================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS proof_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN payments.proof_urls IS
  'Every proof file uploaded for this payment submission — [{url, type}, ...]. proof_url/proof_type remain set to the first entry for backward compatibility with older readers.';
