-- ================================================================
-- Bagdrop — Realign the BDA counter past whatever BDL already reached
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- REQUIRED before the nextInquiryNumberPair() code fix (2026-08-21) is
-- safe in production — run this once, after deploying that code change.
-- ================================================================
--
-- WHY THIS EXISTS
-- lib/number-series.ts's nextInquiryNumberPair() now mints ONLY from the
-- 'BDA' counter and derives the paired lead_number by swapping the prefix
-- (BDA-YYYY-NNNN → BDL-YYYY-NNNN) — the only way to guarantee a lead and
-- its booking always carry the same NNNN (see that function's comment for
-- the full history of why two independent counters kept drifting apart).
--
-- But the OLD 'BDL' counter had, over time, raced ahead of 'BDA' — e.g.
-- by the time this was fixed, 'BDL' had already reached the low 120s
-- while 'BDA' was only around 113 (this is exactly why Ropafadzo Muzava's
-- brand-new, correctly-created-in-one-request lead+booking still came
-- out as BDA-2026-0113 / BDL-2026-0117 — both counters were queried in
-- the same request, but they were never equal to begin with).
--
-- If 'BDA' just kept counting up from 113 on its own now (114, 115, 116,
-- 117...), the very next new inquiry would derive BDL-2026-0114 — which
-- may ALREADY belong to a real, existing lead that got it from the old,
-- independent BDL counter before this fix. That would immediately
-- reproduce the exact "duplicate key value violates unique constraint
-- idx_leads_lead_number" error seen earlier today, but for a live new
-- inquiry instead of a historical backfill.
--
-- This bumps 'BDA' (for the current year) up to whichever of the two
-- series' last_seq is higher, so the very next mint is guaranteed to be
-- past every already-issued BDA tracking_id AND every already-issued BDL
-- lead_number. Safe to run again later if needed — it only ever moves
-- 'BDA' forward (GREATEST), never backward.
-- ================================================================

UPDATE bagdrop_number_counters bda
SET last_seq = GREATEST(bda.last_seq, COALESCE(bdl.last_seq, 0))
FROM bagdrop_number_counters bdl
WHERE bda.series = 'BDA'
  AND bdl.series = 'BDL'
  AND bda.year = bdl.year;

-- Verify — 'BDA' should now be >= 'BDL' for every year both exist.
SELECT bda.year, bda.last_seq AS bda_last_seq, bdl.last_seq AS bdl_last_seq
FROM bagdrop_number_counters bda
JOIN bagdrop_number_counters bdl ON bdl.series = 'BDL' AND bdl.year = bda.year
WHERE bda.series = 'BDA'
ORDER BY bda.year;
