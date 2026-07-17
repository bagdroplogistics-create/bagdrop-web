-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Soft-Delete for Leads
-- Run in Supabase Dashboard → SQL Editor (safe to re-run — fully idempotent)
--
-- WHAT THIS DOES:
--   Adds a `deleted_at` timestamp column to the leads table.
--   Leads are soft-deleted (deleted_at set) instead of hard-deleted, so they
--   remain in the DB and can be recovered by the admin (see restoreLead /
--   the "Deleted" filter in admin/leads).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add soft-delete column (idempotent)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Index for fast filtering of non-deleted leads
CREATE INDEX IF NOT EXISTS leads_deleted_at_idx ON leads (deleted_at)
  WHERE deleted_at IS NULL;

-- 3. (Optional) View for non-deleted leads — convenient for Supabase table editor
CREATE OR REPLACE VIEW active_leads AS
  SELECT * FROM leads WHERE deleted_at IS NULL;
