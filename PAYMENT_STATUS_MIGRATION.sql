-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Add payment_status to leads table
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'received'));

-- Backfill: any lead with a quote already created stays 'pending' (default)
-- No data changes needed — the default handles it.

-- Verify
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'payment_status';
