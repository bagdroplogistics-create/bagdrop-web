-- ================================================================
-- BAGDROP — Branch GC number style
-- ================================================================
-- Adds a per-branch choice of GC/LR number format:
--   'legacy' (default, unchanged) : MUM/2026-27/LR/000001  or  MUM-LR-000001
--   'cm'                          : <PREFIX><YY>CM<SEQ>  e.g. MUM26CM046, AHMD25CM0027
--                                   YY  = last two digits of the Indian financial-year start year
--                                   SEQ = branch's own running sequence, zero-padded to lr_padding
-- Existing LR numbers are never touched. The running sequence is the same
-- atomic per-branch counter (bagdrop_number_counters, series '<prefix>-LR')
-- already used for the legacy format, so switching a branch to 'cm'
-- continues its sequence instead of restarting it.
-- Run in Supabase Dashboard → SQL Editor.
-- ================================================================
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS gc_number_style TEXT NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_gc_number_style_check') THEN
    ALTER TABLE branches
      ADD CONSTRAINT branches_gc_number_style_check CHECK (gc_number_style IN ('legacy', 'cm'));
  END IF;
END $$;
