-- ================================================================
-- Bagdrop — One-time fix: realign lead_number to its booking's tracking_id
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- See 20260821_diagnose_bda_bdl_mismatch.sql — every existing lead+booking
-- pair with a 'BDL-' lead_number and a 'BDA-' tracking_id was mismatched
-- (e.g. Ravi Patel: lead BDL-2026-0115 paired with booking BDA-2026-0112).
-- Founder instruction: tracking_id is the anchor (customer-facing Booking
-- ID, likely already shared with the customer), so lead_number is
-- corrected to match it.
--
-- REVISION 2 (2026-08-21): this data has a CHAIN of dependencies, not
-- just isolated pairs — e.g. Rahul Dedhia currently holds BDL-2026-0108,
-- which is exactly what Chirayu Patel's row needs to move INTO, but
-- Rahul's own corrected value (BDL-2026-0105) is permanently blocked by
-- an unrelated pre-existing lead that already legitimately holds
-- BDL-2026-0105 (see 20260821_diagnose_duplicate_lead_numbers.sql) — so
-- Rahul can never actually move, which means Chirayu can't move into
-- 0108 either. Revision 1 only checked ONE hop of this and still hit a
-- collision (this is why it failed a second time, on a different key).
-- This revision uses a small PL/pgSQL block that repeatedly removes any
-- row from the "safe to move" batch whose target is held by a lead that
-- has ALSO been removed from that batch (i.e. won't actually vacate it),
-- looping until stable — correctly resolves chains of any length. Only
-- the final, fully-stable, collision-free set is ever written.
-- ================================================================

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

  -- Phase 1: placeholder — collision-safe by construction at this point.
  UPDATE leads l
  SET lead_number = 'TMP-' || l.id::text
  FROM _bda_bdl_batch bt
  WHERE l.id = bt.lead_id;

  -- Phase 2: restore to the real, paired value.
  UPDATE leads l
  SET lead_number = bt.new_number
  FROM _bda_bdl_batch bt
  WHERE l.id = bt.lead_id
    AND l.lead_number = 'TMP-' || l.id::text;

  DROP TABLE _bda_bdl_batch;
END $$;

-- Report: anything still mismatched after the above was skipped on
-- purpose because it's part of an unresolvable chain/collision with a
-- pre-existing duplicate lead_number. Resolve those manually (see
-- 20260821_diagnose_duplicate_lead_numbers.sql — typically renumbering
-- whichever colliding lead is the stray/legacy one), then re-run this
-- script once — it's safe to run again and will pick up anything newly
-- unblocked.
SELECT
  l.id AS lead_id, l.lead_number, l.name, l.phone,
  b.tracking_id,
  regexp_replace(b.tracking_id, '^BDA-', 'BDL-') AS wanted_lead_number
FROM leads l
JOIN bookings b ON b.id = l.booking_id
WHERE l.lead_number ~ '^BDL-'
  AND b.tracking_id  ~ '^BDA-'
  AND l.lead_number <> regexp_replace(b.tracking_id, '^BDA-', 'BDL-');
