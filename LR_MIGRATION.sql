-- ============================================================
-- BAGDROP — Lorry Receipt / GC (Goods Consignment) Module Migration
-- Run in Supabase Dashboard → SQL Editor
--
-- Two tables:
--   lr_routes — "Route Master": admin-configured Origin↔Destination pairs
--               used to pre-fill Booking Office, default vehicle type, and
--               (crucially) whether a route is intrastate or interstate —
--               which decides whether an LR's GST splits as CGST+SGST or
--               IGST. Mirrors the existing route_pricing table's shape
--               (see ROUTE_PRICING_MIGRATION.sql) but is deliberately
--               separate: route_pricing governs customer-facing quote
--               pricing, lr_routes governs LR/GC document generation and
--               tax treatment — different concerns, different lifecycle.
--   lrs        — the LR/GC itself. Field layout follows the real IV Cargo
--               -style GC format supplied as a reference (GC No./Booking
--               Office/PAN/GSTIN/Vehicle/From-To header block, Consignor/
--               Consignee block, Billed To/Delivery Address block, a
--               PKGS/CONTENT/WEIGHT table, a running Freight/Surcharge/…
--               charges ledger, Insurance/LR Type/signature footer).
--               Snapshotted (not live-joined) from the source booking at
--               creation time, same convention as trip_sheets — an LR is a
--               legal shipping document; it must not silently change if the
--               underlying booking record is edited afterward.
-- ============================================================

-- ── Route Master ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lr_routes (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  from_city              TEXT        NOT NULL,
  to_city                TEXT        NOT NULL,
  from_branch_code       TEXT,                          -- e.g. "VADODARA STATION"
  to_branch_code         TEXT,

  gst_type               TEXT        NOT NULL DEFAULT 'intrastate',
    -- intrastate → CGST 2.5% + SGST 2.5% (both parties in same state)
    -- interstate → IGST 5%              (different states)
  default_vehicle_type   TEXT,
  standard_transit_days  INT,
  distance_km            NUMERIC(8,2),
  notes                  TEXT,

  is_active              BOOLEAN     NOT NULL DEFAULT true,
  created_by             TEXT        DEFAULT 'admin',
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lr_routes_from_to ON lr_routes(from_city, to_city);
CREATE INDEX IF NOT EXISTS idx_lr_routes_active  ON lr_routes(is_active);

-- ── LR / GC (Goods Consignment) ────────────────────────────
CREATE TABLE IF NOT EXISTS lrs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lr_number             TEXT        UNIQUE NOT NULL,          -- GC No., e.g. BDLR-2026-0001

  -- Linked records
  booking_id            UUID        REFERENCES bookings(id) ON DELETE SET NULL,
  route_id              UUID        REFERENCES lr_routes(id) ON DELETE SET NULL,

  -- Header block
  lr_date               DATE        NOT NULL DEFAULT CURRENT_DATE,
  booking_office         TEXT,                                -- e.g. "VADODARA STATION"
  vehicle_number         TEXT,
  from_city              TEXT,
  to_city                TEXT,
  mode                   TEXT        DEFAULT 'Air',            -- Air | Road | Rail | Other

  -- Consignor (sender)
  consignor_name          TEXT,
  consignor_address        TEXT,
  consignor_mobile         TEXT,
  consignor_email          TEXT,
  consignor_gstin          TEXT,

  -- Consignee (receiver)
  consignee_name           TEXT,
  consignee_address        TEXT,
  consignee_mobile         TEXT,
  consignee_gstin          TEXT,

  -- Billed To / Delivery Address
  billed_to_name           TEXT,
  billed_to_gstin          TEXT,
  delivery_address         TEXT,

  -- Invoice / E-way reference (as printed on a real GC)
  invoice_number           TEXT,
  invoice_value             NUMERIC(10,2),
  eway_bill_number          TEXT,

  -- Packages (Phase 1: one aggregate line auto-filled from the booking;
  -- a proper multi-row bag breakdown is a Phase 2 addition)
  total_bags                INT         DEFAULT 1,
  content_description       TEXT        DEFAULT 'HOUSEHOLD BAGGAGE',
  actual_weight             NUMERIC(8,2),                      -- A WEIGHT (kg)
  chargeable_weight         NUMERIC(8,2),                      -- C WEIGHT (kg)
  size_l                    NUMERIC(6,2),
  size_w                    NUMERIC(6,2),
  size_h                    NUMERIC(6,2),
  private_mark               TEXT,

  -- Charges ledger (right-side column on the reference GC) — every field
  -- defaults to 0 so an LR can be generated instantly with zero manual
  -- entry, then adjusted later if needed.
  freight                    NUMERIC(10,2) DEFAULT 0,
  surcharge                  NUMERIC(10,2) DEFAULT 0,
  local_cartage               NUMERIC(10,2) DEFAULT 0,
  last_mile_frt                NUMERIC(10,2) DEFAULT 0,
  fov                          NUMERIC(10,2) DEFAULT 0,        -- Freight on Value
  loading_chg                  NUMERIC(10,2) DEFAULT 0,
  unloading_chg                 NUMERIC(10,2) DEFAULT 0,
  handling_chg                  NUMERIC(10,2) DEFAULT 0,
  gc_charge                     NUMERIC(10,2) DEFAULT 0,
  other_charge                  NUMERIC(10,2) DEFAULT 0,
  eway_bill_chg                  NUMERIC(10,2) DEFAULT 0,
  aoc                             NUMERIC(10,2) DEFAULT 0,      -- Advance Octroi Charge
  sub_total                       NUMERIC(10,2) DEFAULT 0,
  igst_amount                     NUMERIC(10,2) DEFAULT 0,
  cgst_amount                     NUMERIC(10,2) DEFAULT 0,
  sgst_amount                     NUMERIC(10,2) DEFAULT 0,
  total_amount                    NUMERIC(10,2) DEFAULT 0,

  -- Footer
  insurance_by_customer            BOOLEAN     DEFAULT false,   -- "Material Insured By Customer"
  gst_payable_by                   TEXT        DEFAULT 'Consignor',
  payment_terms                    TEXT        DEFAULT 'To Pay',
  lr_type                          TEXT        DEFAULT 'At Branch',   -- At Branch | TBB (MANUAL) | Door Delivery
  delivery_at                      TEXT        DEFAULT 'Door Dly',
  remarks                          TEXT,
  prepared_by                      TEXT        DEFAULT 'admin',

  -- Travel context (airport bookings)
  flight_number                    TEXT,
  airline                          TEXT,
  arrival_date                     DATE,
  arrival_time                     TEXT,

  -- Driver / vehicle assignment
  driver_name                      TEXT,
  driver_mobile                    TEXT,
  vehicle_type                     TEXT,

  -- Lifecycle
  status                            TEXT        DEFAULT 'generated',
    -- generated | dispatched | in_transit | delivered | cancelled
  status_history                    JSONB       DEFAULT '[]',

  created_by                        TEXT        DEFAULT 'admin',
  created_at                        TIMESTAMPTZ DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lrs_booking_id   ON lrs(booking_id);
CREATE INDEX IF NOT EXISTS idx_lrs_route_id     ON lrs(route_id);
CREATE INDEX IF NOT EXISTS idx_lrs_status       ON lrs(status);
CREATE INDEX IF NOT EXISTS idx_lrs_created_at   ON lrs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lrs_lr_number    ON lrs(lr_number);

-- ── Updated-at trigger (reuses the shared function created by
--    TRIP_SHEET_MIGRATION.sql — CREATE OR REPLACE is idempotent, so this
--    migration is safe to run standalone even if that one hasn't run) ──
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_lrs_updated_at ON lrs;
CREATE TRIGGER set_lrs_updated_at
  BEFORE UPDATE ON lrs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_lr_routes_updated_at ON lr_routes;
CREATE TRIGGER set_lr_routes_updated_at
  BEFORE UPDATE ON lr_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS (mirrors existing trip_sheets / bookings policy pattern) ──
ALTER TABLE lrs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lr_routes   ENABLE ROW LEVEL SECURITY;

-- Service-role key bypasses RLS — anon key is blocked entirely
CREATE POLICY "service_role_all_lrs"
  ON lrs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_lr_routes"
  ON lr_routes FOR ALL TO service_role USING (true) WITH CHECK (true);
