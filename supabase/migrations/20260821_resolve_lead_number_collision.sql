-- ================================================================
-- Bagdrop — Resolve the BDL-2026-0105 collision, then finish the
-- Rahul Dedhia / Chirayu Patel chain
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- 20260821_fix_bda_bdl_mismatch.sql correctly skipped Rahul Dedhia
-- (BDL-2026-0108 → wants BDL-2026-0105) and, transitively, Chirayu Patel
-- (BDL-2026-0111 → wants BDL-2026-0108, which Rahul is still squatting
-- on) because BDL-2026-0105 was already held by lead 91773d85-fa2d-4f99-
-- 915d-de0fcb33ac19 (Anisha Duggal, status 'lost', booking_id
-- c0850a6c-471f-4b80-b2a4-8cd04848383b).
--
-- Anisha's booking cannot possibly be BDA-2026-0105 — that tracking_id
-- already, uniquely belongs to Rahul Dedhia's real, COMPLETED booking
-- (bookings.tracking_id has a UNIQUE constraint). So Anisha's
-- lead_number was itself already stale/wrong before this — she's a dead
-- ('lost') lead squatting on a number that a genuine, completed booking
-- needs. Safe to give her a fresh, correctly-sequenced number using the
-- exact same atomic counter the app itself uses for every new lead
-- (next_series_number — see supabase/migrations/20260817_atomic_number_
-- series.sql) — guaranteed not to collide with anything past or future.
--
-- Then re-runs the same chain-safe fix logic from
-- 20260821_fix_bda_bdl_mismatch.sql, which will now succeed for both
-- Rahul and Chirayu since 0105 (and therefore 0108) are free.
-- ================================================================

-- Step 1: give Anisha Duggal's lead a fresh, real lead_number.
UPDATE leads
SET lead_number = next_series_number('BDL')
WHERE id = '91773d85-fa2d-4f99-915d-de0fcb33ac19';

-- Step 2: finish the chain (Rahul → BDL-2026-0105, Chirayu → BDL-2026-0108).
DO $$
DECLARE
  removed_count integer;
BEGIN
  DROP TABLE IF EXISTS _bda_bdl_batch;
  CREATE TEMP TABLE _bda_bdl_batch AS
  SELECT l.id AS lead_id,
         regexp_replace(b.tracking_id, '^BDA-', 'BDL-') AS new_number
  FROM leads l
  JOIN bookings b ON b.id = l.booking_id
  WHERE l.lead_number ~ '^BDL-'
    AND b.tracking_id  ~ '^BDA-'
    AND l.lead_number <> regexp_replace(b.tracking_id, '^BDA-', 'BDL-');

  LOOP
    DELETE FROM _bda_bdl_batch bt
    WHERE EXISTS (
      SELECT 1 FROM leads other
      WHERE other.lead_number = bt.new_number
        AND other.id <> bt.lead_id
        AND NOT EXISTS (SELECT 1 FROM _bda_bdl_batch b2 WHERE b2.lead_id = other.id)
    );
    GET DIAGNOSTICS removed_count = ROW_COUNT;
    EXIT WHEN removed_count = 0;
  END LOOP;

  UPDATE leads l
  SET lead_number = 'TMP-' || l.id::text
  FROM _bda_bdl_batch bt
  WHERE l.id = bt.lead_id;

  UPDATE leads l
  SET lead_number = bt.new_number
  FROM _bda_bdl_batch bt
  WHERE l.id = bt.lead_id
    AND l.lead_number = 'TMP-' || l.id::text;

  DROP TABLE _bda_bdl_batch;
END $$;

-- Step 3: verify — should return zero rows.
SELECT
  l.id AS lead_id, l.lead_number, l.name, l.phone,
  b.tracking_id,
  regexp_replace(b.tracking_id, '^BDA-', 'BDL-') AS wanted_lead_number
FROM leads l
JOIN bookings b ON b.id = l.booking_id
WHERE l.lead_number ~ '^BDL-'
  AND b.tracking_id  ~ '^BDA-'
  AND l.lead_number <> regexp_replace(b.tracking_id, '^BDA-', 'BDL-');
