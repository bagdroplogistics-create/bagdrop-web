-- ─────────────────────────────────────────────────────────────────
-- Bagdrop | Automatic Estimate Quote — schema
-- Run in Supabase Dashboard → SQL Editor
--
-- Founder request (2026-10-02): "Whenever a new inquiry is received and
-- the requested route already exists in Route/Pricing Master, and the
-- inquiry has a bag count, auto-calculate and show an ESTIMATE quote in
-- the Dashboard — clearly separate from the real Final Quote workflow."
--
-- Deliberately a fully separate set of columns from the existing
-- quote_* fields (leads.quote_number, quote_total, etc. — see
-- supabase/migrations/20260704_leads_internal_quote.sql). The estimate
-- must NEVER be confused with, or silently become, the real/final quote:
--   - No quote_number is ever minted for an estimate (that series is
--     reserved for real quotes — see lib/number-series.ts).
--   - No booking is created or touched for an estimate.
--   - estimate_status only ever holds 'generated' or 'converted' — never
--     any of the real booking-workflow statuses (STATUS_ORDER_BASE).
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS estimate_subtotal     NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS estimate_tax          NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS estimate_total        NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS estimate_line_items   JSONB,
  -- 'generated' = auto-calculated, visible in Dashboard, not yet acted on.
  -- 'converted' = Admin has generated a real Final Quote from this lead —
  --   the estimate fields above are frozen as a historical record and are
  --   never recalculated again, even if the inquiry is edited afterward.
  -- NULL = no estimate could be calculated (no route match yet, or no bag
  --   count) — existing manual quote workflow applies, unchanged.
  ADD COLUMN IF NOT EXISTS estimate_status       TEXT,
  ADD COLUMN IF NOT EXISTS estimate_generated_at TIMESTAMPTZ,
  -- Snapshot of the route_pricing match + bag count the estimate was
  -- actually calculated from, independent of leads.from_city/to_city/
  -- bags_count which may be edited later — lets the UI show "this
  -- estimate was for 2 bags, the inquiry now says 3" if it ever drifts
  -- before a recalculation runs.
  ADD COLUMN IF NOT EXISTS estimate_route_from   TEXT,
  ADD COLUMN IF NOT EXISTS estimate_route_to     TEXT,
  ADD COLUMN IF NOT EXISTS estimate_bags_count   INT;

COMMENT ON COLUMN leads.estimate_subtotal     IS 'Auto-estimate: total before tax, from Route/Pricing Master — never invented.';
COMMENT ON COLUMN leads.estimate_tax          IS 'Auto-estimate: GST (5%) on the estimate subtotal.';
COMMENT ON COLUMN leads.estimate_total        IS 'Auto-estimate: subtotal + tax. Shown in Dashboard as ESTIMATE, never counted as confirmed revenue.';
COMMENT ON COLUMN leads.estimate_line_items   IS 'Auto-estimate line items, same shape as quote_line_items.';
COMMENT ON COLUMN leads.estimate_status       IS E'NULL = no estimate / no route match. ''generated'' = live auto-estimate. ''converted'' = frozen, a real Final Quote now exists on this lead.';
COMMENT ON COLUMN leads.estimate_generated_at IS 'Timestamp of the most recent auto-calculation (or recalculation) of this estimate.';
COMMENT ON COLUMN leads.estimate_route_from   IS 'from_city the estimate was actually calculated against (snapshot).';
COMMENT ON COLUMN leads.estimate_route_to     IS 'to_city the estimate was actually calculated against (snapshot).';
COMMENT ON COLUMN leads.estimate_bags_count   IS 'bags_count the estimate was actually calculated against (snapshot).';
