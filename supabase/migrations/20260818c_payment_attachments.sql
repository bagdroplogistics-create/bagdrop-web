-- BAGDROP — Attachments field for the Record Payment form
-- (app/(admin)/admin/payments/page.tsx / app/api/admin/payments/[id]/
-- attachments/route.ts).
--
-- Stores an array of uploaded-file metadata directly on the payments row:
--   [{ url, filename, size, type, uploaded_at }, ...]
-- Files themselves live in Supabase Storage (see manual step below) — this
-- column only ever holds public URLs + metadata, same division of labour
-- already used for proof_url/proof_type (20260813_payment_verification.sql)
-- and the "quotes" bucket (007_storage_quotes_bucket.sql).
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ================================================================
-- Manual step required: create the Supabase Storage bucket
-- ================================================================
-- This migration cannot create a Storage bucket via SQL. In the Supabase
-- dashboard: Storage → New bucket → name it exactly "payment-attachments" →
-- make it Public (same as the existing "quotes" and "payment-proofs"
-- buckets) so uploaded attachment URLs work the same way those already do.
