-- BAGDROP — Seed the BDP (payment_id) atomic counter
--
-- Founder-reported live bug (2026-09-05), BDA-2026-0143's Payment Proof
-- upload: "Uploaded, but failed to create payment record: duplicate key
-- value violates unique constraint 'payments_payment_id_key'".
--
-- Root cause: app/api/admin/payments/route.ts and app/api/admin/bookings/
-- [id]/payment-proof/route.ts each minted BDP-YYYY-NNNN via a local
-- "SELECT COUNT(*) WHERE payment_id LIKE 'BDP-YYYY-%', then +1" — the same
-- race-condition/gap-prone pattern the BDA/BDL/BDQ series moved off of
-- back on 20260817_atomic_number_series.sql. A COUNT-based "next number"
-- undercounts the moment there's ever a gap (a rejected/deleted payment,
-- or two inserts racing each other), so it can — and just did — compute an
-- id that already belongs to a real row.
--
-- Fix (this migration + the matching code change in lib/number-series.ts,
-- consolidating both call sites onto the same atomic next_series_number()
-- RPC every other series already uses): before that switch can be safe,
-- the counter needs to be seeded to the REAL highest BDP number already in
-- use — otherwise the first atomic mint would start back at BDP-YYYY-0001
-- and immediately collide with existing rows. Same idempotent, "never
-- move backward" pattern as app/api/admin/repair/resync-number-counter/
-- route.ts's existing BDA/BDL/BDQ resync.
INSERT INTO bagdrop_number_counters (series, year, last_seq)
SELECT
  'BDP',
  EXTRACT(YEAR FROM CURRENT_DATE)::int,
  COALESCE(MAX(SUBSTRING(payment_id FROM '(\d+)$')::int), 0)
FROM payments
WHERE payment_id ~ ('^BDP-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-\d+$')
ON CONFLICT (series, year) DO UPDATE
  SET last_seq = GREATEST(bagdrop_number_counters.last_seq, EXCLUDED.last_seq);

-- Verify
SELECT * FROM bagdrop_number_counters WHERE series = 'BDP';
