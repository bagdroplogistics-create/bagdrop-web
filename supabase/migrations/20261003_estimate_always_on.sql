-- ─────────────────────────────────────────────────────────────────
-- Bagdrop | Automatic Estimate Quote — always-on + unknown-route fallback
-- Run in Supabase Dashboard → SQL Editor
--
-- Founder spec (2026-10-03): every inquiry must get an auto-estimate, not
-- just ones matching a known Route/Pricing Master route. Unknown routes
-- get a ₹10,000 / 2-bag starting estimate (Founder-specified figure, not
-- invented here) so Admin always has something to open and edit instead
-- of starting from a blank quote.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE leads
  -- EST-YYYY-NNNN — minted once per lead, the first time an estimate is
  -- generated, and never re-minted on recalculation. Separate series from
  -- quote_number's QT- numbers (see lib/number-series.ts's
  -- nextEstimateNumber) — an estimate must never collide with, or be
  -- mistaken for, a real Final Quote number.
  ADD COLUMN IF NOT EXISTS estimate_number          TEXT,
  -- true when the estimate used the ₹10,000/2-bag fallback because no
  -- route_pricing match was found — drives the "UNKNOWN ROUTE" badge.
  ADD COLUMN IF NOT EXISTS estimate_is_unknown_route BOOLEAN,
  -- true whenever this estimate should NOT be sent/finalized as-is without
  -- Admin looking at it first — always true for an unknown-route estimate.
  ADD COLUMN IF NOT EXISTS estimate_needs_review      BOOLEAN;

CREATE UNIQUE INDEX IF NOT EXISTS leads_estimate_number_idx
  ON leads (estimate_number) WHERE estimate_number IS NOT NULL;

COMMENT ON COLUMN leads.estimate_number           IS 'EST-YYYY-NNNN, minted once per lead on first estimate generation (lib/number-series.ts nextEstimateNumber). Separate from quote_number (QT-).';
COMMENT ON COLUMN leads.estimate_is_unknown_route  IS 'true = no route_pricing match, estimate used the ₹10,000/2-bag fallback.';
COMMENT ON COLUMN leads.estimate_needs_review      IS 'true = Admin should review/adjust before sending as a Final Quote (always true for an unknown-route estimate).';
