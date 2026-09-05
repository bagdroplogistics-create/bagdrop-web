-- ================================================================
-- Bagdrop — Operational Baggage Tag System (Phase 1: tags, printing,
-- airline fields)
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- Founder spec 2026-09-05: every physical bag on a CONFIRMED booking —
-- individual or group — needs its own operational BagDrop Bag ID + QR
-- code, printable as an airline-style logistics sticker, with an 8-stage
-- tracking status and (later, Phase 2) a driver scan workflow.
--
-- Reuses `group_bags` (added in 20260904_group_bookings.sql) as the
-- universal per-bag table for BOTH booking types, rather than building a
-- second, parallel bag table — group_bags.booking_id already works for
-- any bookings row regardless of booking_type, and guest_id is already
-- nullable (an Individual booking's bags simply have guest_id = NULL,
-- since Individual bookings have no guest/manifest concept). Despite the
-- historical "group_bags" name, this table is now Bagdrop's one bag-tag
-- table for every confirmed booking.
--
-- IMPORTANT (explicit founder requirement): BagDrop's own Bag ID/QR are
-- purely an OPERATIONAL tracking tag. They are never presented as an
-- airline-issued baggage tag, and this system never generates airline
-- baggage identifiers (LPN/barcode) — those are separate, staff-entered-
-- only fields (see Section 3 below), always kept visually and
-- structurally distinct from bag_label/bag_number.
-- ================================================================

-- ── 1. Bag Label — the new human/QR-facing Bag ID ────────────────
-- Format: {booking identifier}-{seq}, e.g. BDL-2026-0152-01 (Individual,
-- 2-digit) or GBL-2026-0001-001 (Group, 3-digit) — see lib/bag-tags.ts's
-- generateBagLabel(). This REPLACES bag_number (the old GBAG-YYYY-NNNN
-- atomic series) as the tag/QR-facing identifier; bag_number is kept
-- as-is (still UNIQUE NOT NULL) purely as an internal, never-reused
-- database key — no existing code path is broken by adding this
-- alongside it.
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS bag_label text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_bags_bag_label ON group_bags(bag_label) WHERE bag_label IS NOT NULL;

COMMENT ON COLUMN group_bags.bag_label IS
  'BagDrop operational Bag ID shown on the printed tag + encoded in the QR — {booking tracking/group number}-{seq}. NOT an airline baggage identifier.';

-- ── 2. Tag lifecycle timestamps ───────────────────────────────────
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS tag_generated_at timestamptz;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS tag_printed_at   timestamptz;

COMMENT ON COLUMN group_bags.tag_generated_at IS 'When this bag''s BagDrop tag/QR was first generated. Tags are only ever generated for a CONFIRMED (or later-stage) booking.';
COMMENT ON COLUMN group_bags.tag_printed_at   IS 'When this bag''s tag was last (re)printed — updated on every Print/Reprint, not just the first.';

-- ── 3. Operational tracking status — new 8-stage vocabulary ───────
-- Supersedes the placeholder status values group_bags.status shipped
-- with in the Group Booking Phase 1 migration ('pending', 'received',
-- 'tagged', etc.) — those were never surfaced in any dashboard/status UI
-- yet, so repurposing this single column to the real 8-stage tracking
-- model (rather than adding a second, competing status column) is safe.
-- Enforced at the application layer (lib/bag-tags.ts's BAG_STATUSES),
-- matching every other status column in this codebase (bookings.status,
-- lrs.status, etc. are not DB CHECK-constrained either).
--   tag_generated → tag_printed → pickup_pending → picked_up →
--   airport_handover → in_transit → delivered
--   (+ delivery_exception, a side-branch, not part of the forward chain)
ALTER TABLE group_bags ALTER COLUMN status SET DEFAULT 'tag_generated';
UPDATE group_bags SET status = 'tag_generated' WHERE status = 'pending';

COMMENT ON COLUMN group_bags.status IS
  'tag_generated | tag_printed | pickup_pending | picked_up | airport_handover | in_transit | delivered | delivery_exception — see lib/bag-tags.ts BAG_STATUSES. Phase 1: set manually by staff. Phase 2: also set by the driver QR-scan workflow.';

-- ── 4. Airline information — explicitly SEPARATE from BagDrop's own
--       Bag ID/QR. Staff-entered only; this system never generates or
--       infers any of these values. ─────────────────────────────────
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS airline_name        text;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS flight_number       text;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS pnr                 text;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS passenger_name      text;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS airline_tag_number  text; -- Airline Bag Tag / LPN — staff transcribes from the physical airline tag, never generated here
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS airline_barcode     text; -- Airline barcode value — same rule: transcribed, never generated

COMMENT ON COLUMN group_bags.airline_tag_number IS 'Airline-issued Bag Tag / LPN, staff-entered only. Bagdrop NEVER generates airline baggage identifiers.';
COMMENT ON COLUMN group_bags.airline_barcode    IS 'Airline-issued barcode value, staff-entered only. Kept separate from bag_label/bag_number.';

-- ── 5. Tracking events — one row per status change / scan ─────────
-- "Every scan must create a timestamped tracking event." Phase 1 (manual
-- status changes by staff) already logs through this table so Phase 2's
-- QR-scan workflow needs no further migration — it just inserts the same
-- shape of row, optionally with GPS lat/lng populated.
CREATE TABLE IF NOT EXISTS bag_tracking_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bag_id      uuid NOT NULL REFERENCES group_bags(id) ON DELETE CASCADE,
  status      text NOT NULL,
  note        text,
  changed_by  text,            -- admin name/role for Phase 1; driver identity for Phase 2 scans
  latitude    double precision, -- Phase 2 (GPS capture on scan) — NULL until then
  longitude   double precision,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bag_tracking_events_bag_id ON bag_tracking_events(bag_id);

COMMENT ON TABLE bag_tracking_events IS
  'One row per bag status change/scan — the full operational history of a physical bag, independent of group_bags.status (which only holds the CURRENT state).';
