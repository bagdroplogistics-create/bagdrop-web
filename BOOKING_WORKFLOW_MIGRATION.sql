-- ============================================================
-- BAGDROP — Booking Workflow Redesign Migration
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. New columns on bookings table ─────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT,
  ADD COLUMN IF NOT EXISTS rejection_comment TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at       TIMESTAMPTZ;

-- ── 2. Also run the Trip Sheet fields (if not already done) ──
ALTER TABLE trip_sheets
  ADD COLUMN IF NOT EXISTS mode              TEXT,
  ADD COLUMN IF NOT EXISTS undertaking_status TEXT DEFAULT 'RECEIVED';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pickup_address    TEXT,
  ADD COLUMN IF NOT EXISTS drop_address      TEXT;

-- ── 3. New booking status values are handled as TEXT in the
--    bookings.status column — no enum change needed.
--    New valid values now include:
--
--    INQUIRY PHASE:
--      inquiry
--
--    QUOTE PHASE:
--      quote_created | quote_sent | accepted | rejected | closed
--
--    PAYMENT PHASE:
--      payment_pending | payment_received | payment_approved
--
--    BOOKING PHASE:
--      confirmed | invoice_generated | invoice_sent | trip_created
--
--    OPERATIONS PHASE:
--      pickup_scheduled | picked_up | in_transit
--      out_for_delivery | delivered
--
--    FINAL:
--      completed (locked) | cancelled
--
-- ── 4. Optional: add index on rejection_reason for reporting ─
CREATE INDEX IF NOT EXISTS idx_bookings_rejection_reason
  ON bookings(rejection_reason)
  WHERE rejection_reason IS NOT NULL;

-- ── 5. Verify ────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('rejection_reason', 'rejection_comment', 'rejected_at')
ORDER BY column_name;
