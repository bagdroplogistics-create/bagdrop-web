-- ================================================================
-- BAGDROP — Branch-Wise LR Management
-- ================================================================
-- Adds a real `branches` entity (there was none before this — every
-- "branch"-shaped thing in the codebase, from_branch_code/to_branch_code on
-- lr_routes and booking_office on lrs, was just a free-typed TEXT label,
-- not a table) and gives each branch its own independent, atomically-safe
-- LR numbering sequence instead of the single global BDLR-YYYY-NNNN series
-- lib/lr-auto-create.ts currently generates with an unsafe MAX+1 query.
--
-- Three pieces:
--   1. branches — the branch registry itself, including per-branch LR
--      numbering configuration (prefix / include-FY / start number /
--      padding) and a per-branch access_key for backend-enforced
--      branch-scoped permissions (see lib/branch-auth.ts).
--   2. lrs gets a branch_id FK plus a set of SNAPSHOT columns
--      (branch_code/branch_name/branch_address/branch_gst_number/
--      branch_contact_number/branch_email/financial_year) captured at LR
--      creation time. This mirrors the exact same philosophy the lrs table
--      already uses for the booking it's created from (LR_MIGRATION.sql:
--      "an LR is a legal shipping document; it must not silently change if
--      the underlying booking record is edited afterward") — applied here
--      to the branch too, so renaming a branch or editing its address next
--      year can never retroactively alter what an already-issued LR shows.
--      branch_id itself is kept alongside the snapshot purely for
--      filtering/reporting joins (Phase 7/9), never for reading live
--      letterhead data back out at PDF-render time.
--   3. next_branch_lr_seq() — a new atomic counter function reusing the
--      existing bagdrop_number_counters table (see
--      20260817_atomic_number_series.sql) but, unlike next_series_number(),
--      taking the year as an explicit parameter rather than deriving it
--      from CURRENT_DATE. This is required for Indian Financial Year
--      (1 Apr–31 Mar) numbering: next_series_number()'s hardcoded
--      EXTRACT(YEAR FROM CURRENT_DATE) would fragment a single FY's
--      sequence at the Jan 1 calendar boundary (e.g. calls in Apr–Dec 2026
--      landing on counter row year=2026, calls in Jan–Mar 2027 for the
--      SAME fiscal year 2026-27 landing on a different row year=2027) —
--      passing the FY-start-year explicitly from lib/financial-year.ts
--      keeps the whole fiscal year on one counter row regardless of which
--      calendar year each individual LR happens to be created in.
--
-- No fake branch data is seeded here — the table starts empty. Every
-- example in the founder's spec (Mumbai/Delhi/Ahmedabad/Bengaluru) is a
-- real business's real address/GST/contact info this migration has no
-- source of truth for; branches are added for real through the new
-- Branch Management admin UI (Phase 5) instead of invented here.
--
-- Run in Supabase Dashboard → SQL Editor.
-- ================================================================

-- ── Branch registry ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  branch_code       TEXT        UNIQUE NOT NULL,   -- e.g. 'MUM', 'DEL', 'AMD'
  branch_name       TEXT        NOT NULL,          -- e.g. 'Mumbai Branch'
  city              TEXT        NOT NULL,          -- matched against booking pickup city via lib/city-normalize.ts
  state             TEXT,
  address           TEXT,
  pincode           TEXT,
  gst_number        TEXT,
  contact_number    TEXT,
  email             TEXT,
  branch_manager    TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT true,

  -- Branch-scoped access — see lib/branch-auth.ts. A plain secret string
  -- compared against the incoming x-admin-key/?key= value, same posture as
  -- the existing ADMIN_SECRET_KEY/STAFF_SECRET_KEY env-var comparison in
  -- lib/admin-auth.ts (not hashed) — consistent with how the rest of this
  -- app already does auth, generated via crypto.randomBytes at branch
  -- creation, shown to the founder exactly once, regeneratable.
  access_key        TEXT        UNIQUE,

  -- Per-branch LR numbering configuration (spec section 5).
  lr_series_prefix  TEXT        NOT NULL,          -- usually = branch_code, kept separate since it's independently configurable
  lr_include_fy     BOOLEAN     NOT NULL DEFAULT true,
  lr_start_number   INT         NOT NULL DEFAULT 1,
  lr_padding        INT         NOT NULL DEFAULT 6,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);
CREATE INDEX IF NOT EXISTS idx_branches_city   ON branches(city);

DROP TRIGGER IF EXISTS set_branches_updated_at ON branches;
CREATE TRIGGER set_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_branches"
  ON branches FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── lrs: branch linkage + immutable snapshot ────────────────────
ALTER TABLE lrs
  ADD COLUMN IF NOT EXISTS branch_id             UUID REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_code           TEXT,   -- snapshot at creation, never re-read from branches afterward
  ADD COLUMN IF NOT EXISTS branch_name           TEXT,
  ADD COLUMN IF NOT EXISTS branch_address        TEXT,
  ADD COLUMN IF NOT EXISTS branch_gst_number     TEXT,
  ADD COLUMN IF NOT EXISTS branch_contact_number TEXT,
  ADD COLUMN IF NOT EXISTS branch_email          TEXT,
  ADD COLUMN IF NOT EXISTS financial_year        TEXT;   -- e.g. '2026-27', computed at creation from lib/financial-year.ts

CREATE INDEX IF NOT EXISTS idx_lrs_branch_id      ON lrs(branch_id);
CREATE INDEX IF NOT EXISTS idx_lrs_branch_code    ON lrs(branch_code);
CREATE INDEX IF NOT EXISTS idx_lrs_financial_year ON lrs(financial_year);

-- ── Real DB-level 1-booking-to-1-LR guarantee ───────────────────
-- Previously enforced only by application code (SELECT-then-INSERT in
-- lib/lr-auto-create.ts) — safe against normal use but not a genuine
-- concurrent race (two near-simultaneous calls can both pass the SELECT
-- check before either INSERTs). Postgres UNIQUE constraints treat NULL as
-- distinct from every other NULL, so this only enforces uniqueness among
-- LRs that ARE linked to a booking — manual/unlinked LRs (booking_id NULL)
-- are completely unaffected and can still be created freely.
-- Wrapped in a guarded DO block rather than a plain ALTER TABLE, for two
-- reasons: (1) "ADD CONSTRAINT IF NOT EXISTS" isn't reliably supported
-- across Postgres versions, so re-running this migration must not error on
-- the constraint already existing; (2) if any pre-existing duplicate
-- booking_id somehow already slipped through the application-level guard,
-- this constraint add would fail outright — caught here and logged as a
-- NOTICE instead of aborting the rest of this migration (branches table,
-- lrs columns, and the numbering function above are unaffected either way).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_lrs_booking_id'
  ) THEN
    BEGIN
      ALTER TABLE lrs ADD CONSTRAINT uq_lrs_booking_id UNIQUE (booking_id);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'uq_lrs_booking_id NOT added — existing duplicate booking_id rows found in lrs. Find and fix them (SELECT booking_id, count(*) FROM lrs WHERE booking_id IS NOT NULL GROUP BY booking_id HAVING count(*) > 1), then re-run this migration.';
    END;
  END IF;
END $$;

-- ── Branch-wise, FY-aware atomic LR sequence ────────────────────
-- Reuses bagdrop_number_counters(series, year, last_seq) — same table,
-- same atomic UPSERT technique as next_series_number() — but takes the
-- year explicitly instead of deriving it from CURRENT_DATE, so callers can
-- pass an Indian-Financial-Year start year (see module comment above for
-- why this matters). series is namespaced as '<branch_code>-LR' so a
-- branch's LR counter can never collide with BDA/BDL/BDQ or another
-- branch's counter. Returns just the zero-padded sequence number (e.g.
-- '000001') — callers build the final formatted LR number string
-- themselves (lib/lr-auto-create.ts), since the format itself varies
-- per-branch (with/without FY, configurable padding).
CREATE OR REPLACE FUNCTION next_branch_lr_seq(p_branch_code text, p_year int, p_width int DEFAULT 6)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  series text := p_branch_code || '-LR';
  seq    int;
BEGIN
  INSERT INTO bagdrop_number_counters (series, year, last_seq)
  VALUES (series, p_year, 1)
  ON CONFLICT (series, year)
  DO UPDATE SET last_seq = bagdrop_number_counters.last_seq + 1
  RETURNING last_seq INTO seq;

  RETURN lpad(seq::text, p_width, '0');
END;
$$;
