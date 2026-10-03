-- ─────────────────────────────────────────────────────────────────
-- Bagdrop | Automatic Quote Generation — review flags
-- Run in Supabase Dashboard → SQL Editor
--
-- Founder spec (2026-10-03, follow-up): "so when new inquiry came
-- automatic generate quote with this series like QT-2026-0240... just
-- like chandani travels." Superseding the earlier EST-/orange-"Estimate
-- badge" design (supabase/migrations/20261002_lead_auto_estimate.sql,
-- 20261003_estimate_always_on.sql, still present/harmless but no longer
-- written to by new inquiries) — the auto-generated quote is now a REAL
-- quote_number (QT-YYYY-NNNN) and a real linked booking, created
-- automatically via the SAME app/api/admin/zoho/generate-quote logic
-- Admin's manual "Generate Quote" button already uses — not a separate
-- shadow record.
--
-- These two flags are purely informational / for Admin's own awareness —
-- they never gate or change any pricing, revenue, or workflow logic:
--   - quote_auto_generated: this lead's quote was created by the system,
--     not by an Admin manually filling the New Quote form.
--   - quote_needs_review: the route wasn't found in Route/Pricing Master,
--     so the quote used the ₹10,000/2-bag starting figure — Admin should
--     check/correct the price before sending.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS quote_auto_generated BOOLEAN,
  ADD COLUMN IF NOT EXISTS quote_needs_review   BOOLEAN;

COMMENT ON COLUMN leads.quote_auto_generated IS 'true = this quote was created automatically on inquiry creation, not manually by Admin.';
COMMENT ON COLUMN leads.quote_needs_review   IS 'true = auto-generated from the ₹10,000/2-bag unknown-route fallback — Admin should review/correct the price before sending.';
