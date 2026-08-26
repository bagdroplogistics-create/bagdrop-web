-- ================================================================
-- Bagdrop — LR/GC: add optional Ti-Tag field
-- ================================================================
-- Ti-Tag is an optional alphanumeric tag/code (e.g. a baggage tie-tag
-- number) attached to an LR/Consignment. It's purely informational —
-- never required to generate or save an LR, and has no effect on
-- charges, GST, or the LR numbering sequence. Format is enforced at the
-- application layer (letters/digits only); the column itself stays a
-- plain nullable TEXT so it never blocks a save on its own.
--
-- Run in Supabase Dashboard → SQL Editor.
-- ================================================================

ALTER TABLE lrs
  ADD COLUMN IF NOT EXISTS ti_tag TEXT;
