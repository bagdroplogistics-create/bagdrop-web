-- ================================================================
-- Bagdrop — Group / Wedding Booking module (Phase 1: foundation)
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- Large bookings (weddings, events, corporate/family/student groups —
-- 50/100/150+ bags) must NOT become 150 separate inquiries/quotations.
-- This migration adds a thin "group" layer on TOP of the existing
-- `bookings` row rather than a parallel system:
--
--   bookings (booking_type = 'group')   ← same row every existing
--     │                                    module (leads, payments,
--     │                                    lrs, trip_sheets, invoices)
--     │                                    already keys off booking_id
--     ├── group_booking_details (1:1)      → so ALL of those keep
--     ├── group_guests (many)                working completely
--     └── group_bags (many, via guest)       unchanged for Individual
--                                             bookings, and for free
--                                             for Group bookings too.
--
-- An Individual booking is completely unaffected: booking_type simply
-- defaults to 'individual' and no group_* row is ever created for it.
--
-- Bag/Guest records are intentionally NOT hard-deleted anywhere in the
-- app layer built on this schema — every table below has a
-- `deleted_at` column instead, so a removed bag's number is never
-- reissued (see spec: "Removed Bag IDs must never be reused").
-- ================================================================

-- ── 1. Booking Type ──────────────────────────────────────────────
-- Existing rows are all Individual bookings by definition (Group
-- Booking support didn't exist before this migration).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'individual';

UPDATE bookings SET booking_type = 'individual' WHERE booking_type IS NULL;

COMMENT ON COLUMN bookings.booking_type IS
  'individual | group — see lib/group-booking.ts. Group bookings additionally have a group_booking_details row (1:1, same id).';

-- Leads tagged the same way purely for search/reporting consistency
-- with `bookings` — the leads.booking_id FK to the SAME bookings row
-- is what actually carries the link; this column adds nothing
-- structural, just lets the Leads/CRM layer filter by type later
-- without a join.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'individual';

UPDATE leads SET booking_type = 'individual' WHERE booking_type IS NULL;

COMMENT ON COLUMN leads.booking_type IS 'individual | group — mirrors the linked bookings.booking_type.';

-- ── 2. Group / Event Details (1:1 with bookings) ─────────────────
-- One row per Group Booking, keyed by the SAME id as its bookings
-- row (not a separate uuid) — this makes the 1:1 relationship
-- enforced at the schema level (a booking can have at most one
-- group_booking_details row) and means every other module that
-- already joins on booking_id needs zero changes to also reach this.
CREATE TABLE IF NOT EXISTS group_booking_details (
  booking_id              uuid PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  group_booking_number    text UNIQUE NOT NULL,        -- GBL-YYYY-NNNN, see lib/number-series.ts
  event_name              text NOT NULL,
  event_type              text,                        -- Wedding / Corporate / Family / Student / Other
  primary_contact_name    text NOT NULL,
  primary_contact_number  text NOT NULL,
  primary_contact_email   text,
  event_date              date,
  pickup_city             text,
  pickup_address          text,
  delivery_city           text,
  delivery_address        text,
  hotel_name               text,
  estimated_total_bags    int,
  final_total_bags        int,
  pickup_window_start     date,
  pickup_window_end       date,
  special_instructions    text,
  remarks                 text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE group_booking_details IS
  'One row per Group/Wedding Booking — event-level fields on top of the shared bookings row (same id). Phase 1 of the Group Booking module.';

-- ── 3. Guests ─────────────────────────────────────────────────────
-- One Group Booking has many guests; one guest owns many bags
-- (group_bags below). Guest and Bag records are deliberately
-- separate tables (spec: "Guest records and Bag records must be
-- separate. One guest can own multiple bags.").
CREATE TABLE IF NOT EXISTS group_guests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  guest_name         text NOT NULL,
  mobile_number      text,
  email              text,
  hotel_name         text,
  room_number        text,
  delivery_location  text,
  remarks            text,
  deleted_at         timestamptz,   -- soft delete only; a removed guest's bags are also soft-deleted, never re-linked elsewhere
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_guests_booking_id ON group_guests(booking_id);
CREATE INDEX IF NOT EXISTS idx_group_guests_mobile      ON group_guests(mobile_number);

COMMENT ON TABLE group_guests IS 'Guests within a Group/Wedding Booking. One guest can own multiple group_bags.';

-- ── 4. Bags ───────────────────────────────────────────────────────
-- Every PHYSICAL bag gets its own row and its own permanent, never-
-- reused Bag ID (bag_number). guest_id is nullable + ON DELETE SET
-- NULL purely as a schema-level safety net — the application layer
-- always soft-deletes guests (never hard-deletes), so this should
-- never actually fire in practice.
CREATE TABLE IF NOT EXISTS group_bags (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  guest_id           uuid REFERENCES group_guests(id) ON DELETE SET NULL,
  bag_number         text UNIQUE NOT NULL,   -- GBAG-YYYY-NNNN, see lib/number-series.ts — never duplicated, never reused
  status             text NOT NULL DEFAULT 'pending',
  -- pending → picked_up → received → tagged → in_transit →
  -- out_for_delivery → delivered, plus exception statuses
  -- (missing/damaged/delivery_issue/returned). Enforced at the
  -- application layer, not a DB CHECK, matching every other status
  -- column in this codebase (bookings.status, lrs.status, etc.).
  status_history     jsonb NOT NULL DEFAULT '[]'::jsonb,
  pickup_location    text,
  delivery_location  text,
  hotel_name         text,
  room_number        text,
  remarks            text,
  -- Proof of Delivery — column added now (Phase 1) so Phase 2's
  -- delivery-scan feature needs no further migration; unused/NULL
  -- until then.
  pod                jsonb,
  deleted_at         timestamptz,   -- "Add/remove bags before operations begin" — soft delete, bag_number is never reissued
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_bags_booking_id ON group_bags(booking_id);
CREATE INDEX IF NOT EXISTS idx_group_bags_guest_id   ON group_bags(guest_id);
CREATE INDEX IF NOT EXISTS idx_group_bags_status     ON group_bags(status);

COMMENT ON TABLE group_bags IS
  'One row per PHYSICAL bag in a Group/Wedding Booking. bag_number + QR code are the primary identifiers — never guest name alone (multiple guests can share a name).';

-- ── 5. Seed the GBL/GBAG number-series counters ──────────────────
-- Same atomic mechanism as BDA/BDL/BDQ (see 20260817_atomic_number_
-- series.sql's next_series_number()) — no new function needed, just
-- new series keys. Seeds from 0 since these are brand-new series with
-- no pre-existing rows to derive a starting point from.
INSERT INTO bagdrop_number_counters (series, year, last_seq)
VALUES ('GBL',  EXTRACT(YEAR FROM CURRENT_DATE)::int, 0),
       ('GBAG', EXTRACT(YEAR FROM CURRENT_DATE)::int, 0)
ON CONFLICT (series, year) DO NOTHING;
