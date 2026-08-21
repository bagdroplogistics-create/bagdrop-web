-- ================================================================
-- Bagdrop — Diagnostic: find the lead_number collision blocking the
-- BDA/BDL realignment fix
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- READ-ONLY — this SELECTs only, it does not change any data.
-- ================================================================
--
-- WHY THIS EXISTS
-- Running 20260821_fix_bda_bdl_mismatch.sql failed with:
--   duplicate key value violates unique constraint "idx_leads_lead_number"
--   Key (lead_number)=(BDL-2026-0105) already exists.
-- That means TWO different leads currently hold (or would end up with)
-- lead_number 'BDL-2026-0105' — Rahul Dedhia's lead (being corrected to
-- match his booking BDA-2026-0105) and some OTHER, already-existing lead
-- that already legitimately has that exact lead_number. Since
-- bookings.tracking_id is unique, that other lead can't also be paired
-- with a booking literally named BDA-2026-0105 — so it's either a stray
-- duplicate lead_number from before the atomic sequence system existed,
-- or a genuinely separate lead that happens to collide.
--
-- This query surfaces every lead currently sharing a lead_number with
-- another lead (not just the one that broke the script), so the full
-- scope is visible before deciding how to resolve each case (e.g.
-- renumber the stray duplicate, merge/delete a genuine duplicate lead,
-- or leave it and skip that one pairing).
-- ================================================================

SELECT
  l.lead_number,
  l.id            AS lead_id,
  l.name,
  l.phone,
  l.status,
  l.booking_id,
  b.tracking_id,
  b.status        AS booking_status,
  l.created_at
FROM leads l
LEFT JOIN bookings b ON b.id = l.booking_id
WHERE l.lead_number IN (
  SELECT lead_number FROM leads
  GROUP BY lead_number
  HAVING count(*) > 1
)
ORDER BY l.lead_number, l.created_at;
