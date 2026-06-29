-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: Supabase Storage — quotes bucket
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the bucket (public = anyone with the URL can read the file)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quotes',
  'quotes',
  true,                                    -- public bucket → public URLs work without tokens
  10485760,                                -- 10 MB per file limit
  ARRAY['application/pdf']                 -- only PDFs allowed
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- 2. RLS policies
-- Allow service_role (server) to upload/update/delete — bypasses RLS by default.
-- The policies below cover the anon/authenticated roles used by the dashboard.

-- Public read: anyone with the URL can download
CREATE POLICY "quotes_public_read"
ON storage.objects FOR SELECT
USING ( bucket_id = 'quotes' );

-- Admin write: only requests with the service_role key can insert/update/delete.
-- Since our API routes use supabaseAdmin (service_role), they bypass RLS anyway.
-- These policies are a safety belt in case anon client ever touches this bucket.
CREATE POLICY "quotes_admin_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'quotes'
  AND auth.role() = 'service_role'
);

CREATE POLICY "quotes_admin_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'quotes'
  AND auth.role() = 'service_role'
);

CREATE POLICY "quotes_admin_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'quotes'
  AND auth.role() = 'service_role'
);
