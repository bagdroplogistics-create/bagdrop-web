-- ================================================================
-- Bagdrop — Route Master / Trip Sheet Templates
-- (Founder spec, 2026-09-15: BAGDROP-TRIPSHEET-ROUTE-TEMPLATE-001)
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- Creating a Trip Sheet today means manually adding every expense row
-- (Pickup, Middle Mile, Delivery, Packing, Handling, Airport Delivery...)
-- by hand, every single time, even for a route Bagdrop runs constantly
-- (e.g. Vadodara -> Mumbai) with the same vendors and rates. This adds a
-- reusable Route Master: an admin configures a route's standard operations
-- ONCE, and creating a new Trip Sheet for that route becomes "pick the
-- route, enter the bag count" — the system generates the Trip Expenses
-- rows automatically (see app/api/admin/trip-sheets/[id]/apply-route-
-- template/route.ts).
--
-- CRITICAL DESIGN PRINCIPLE — historical snapshots, never live joins:
-- trip_expenses rows generated from a template are a plain INSERT of the
-- template's CURRENT values at that moment — there is no live foreign key
-- from a trip_expenses row back to route_template_operations that anything
-- ever re-reads for display or calculation. route_template_operation_id
-- below is traceability/audit ONLY ("which template operation, if any,
-- produced this row") — changing a route template's vendor/rate/from/to
-- later never changes any trip sheet already created from it, by
-- construction, because nothing reads the template again after creation.
-- This is the same guarantee vendor_notifications already provides for
-- vendor name/mobile (20260912_vendor_master.sql's snapshot fields).
-- ================================================================

-- ── Route Master ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS route_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_name   TEXT NOT NULL,           -- display label, e.g. "Vadodara -> Mumbai"
  from_city    TEXT NOT NULL,
  to_city      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_templates_status ON route_templates(status);
CREATE INDEX IF NOT EXISTS idx_route_templates_cities  ON route_templates(from_city, to_city);

DROP TRIGGER IF EXISTS set_route_templates_updated_at ON route_templates;
CREATE TRIGGER set_route_templates_updated_at
  BEFORE UPDATE ON route_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE route_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_route_templates" ON route_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Route Template Operations ─────────────────────────────────────────
-- One row per standard operation (Pickup, Middle Mile, Delivery, Packing,
-- Handling, Airport Delivery, ...) that a route's Trip Sheets should get
-- automatically. vendor_id is nullable (e.g. Packing is commonly
-- "In-house", no vendor at all) and, when set, must be a real Vendor
-- Master row — same FK Vendor Master already established for
-- trip_expenses.vendor_id.
CREATE TABLE IF NOT EXISTS route_template_operations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_template_id     UUID NOT NULL REFERENCES route_templates(id) ON DELETE CASCADE,
  sequence              INT NOT NULL DEFAULT 0,

  -- Display label — free text on purpose, same reasoning as
  -- trip_expenses.expense_type ("DELIVERY - DADAR STATION TO METRO ANDHERI
  -- EAST" is a real example there too).
  expense_type          TEXT NOT NULL,
  -- Road | Air | Rail | Other — matches trip_expenses.mode exactly; kept
  -- separate from operation_category for the same reason that split
  -- already exists on trip_expenses (see 20260912_vendor_master.sql).
  mode                  TEXT,
  -- Drives which of the 5 vendor-notification categories applies once a
  -- Trip Expense is generated from this row — same enum as
  -- trip_expenses.operation_category / lib/vendor-notifications.ts's
  -- OperationCategory, intentionally kept identical.
  operation_category    TEXT NOT NULL DEFAULT 'other'
    CHECK (operation_category IN ('pickup','middle_mile','delivery','handling','airport_delivery','other')),

  vendor_id             UUID REFERENCES vendors(id) ON DELETE SET NULL,
  from_location         TEXT,
  to_location           TEXT,

  -- Rate calculation logic (founder spec section 7-8) — 'fixed' means
  -- `rate` is the flat Rate/Cost regardless of bag count (e.g. Packing
  -- Charges = Rs.300 no matter how many bags); 'per_bag' means `rate` is a
  -- PER-BAG amount, multiplied by the Trip Sheet's bag count when a Trip
  -- Expense is generated (e.g. Handling = Rs.30/bag x 6 bags = Rs.180).
  rate_type             TEXT NOT NULL DEFAULT 'fixed' CHECK (rate_type IN ('fixed', 'per_bag')),
  rate                  NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Which of the Trip Sheet's own dates this operation's operational_date
  -- should default to when generated — mirrors the exact same
  -- pickup_date/delivery_date fallback the expenses POST route already
  -- applies per-category (see app/api/admin/trip-sheets/[id]/expenses/
  -- route.ts) — 'none' leaves it blank for the admin to fill in, same as
  -- that route already does for middle_mile/handling/other today.
  date_rule             TEXT NOT NULL DEFAULT 'none' CHECK (date_rule IN ('pickup_date', 'delivery_date', 'none')),

  notification_required BOOLEAN NOT NULL DEFAULT true,
  description           TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_template_operations_template ON route_template_operations(route_template_id, sequence);
CREATE INDEX IF NOT EXISTS idx_route_template_operations_vendor   ON route_template_operations(vendor_id);

DROP TRIGGER IF EXISTS set_route_template_operations_updated_at ON route_template_operations;
CREATE TRIGGER set_route_template_operations_updated_at
  BEFORE UPDATE ON route_template_operations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE route_template_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_route_template_operations" ON route_template_operations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Trip Sheets — which template (if any) it was generated from ──────
-- Purely informational/traceability — "this sheet was built from route
-- template X on date Y" for the admin's own reference. Nothing ever reads
-- these to recompute a trip sheet's expenses; they exist so the New Trip
-- Sheet flow can be idempotent (see apply-route-template/route.ts: it
-- refuses to re-apply a template to a sheet that already has one applied,
-- so a page refresh/retry can never double-insert the same expense rows).
ALTER TABLE trip_sheets
  ADD COLUMN IF NOT EXISTS route_template_id         UUID REFERENCES route_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_template_applied_at TIMESTAMPTZ;

-- ── Trip Expenses — per-row rate/bag tracking for auto-recalculation ──
-- Needed so changing a Trip Sheet's overall bag count can automatically
-- recompute every STILL-DEFAULT per-bag expense (founder spec section 25)
-- while leaving fixed-rate expenses and any row an admin has deliberately
-- overridden to a different bag count untouched (section 6). Nullable —
-- every existing/manually-added expense simply has no rate_type/unit_rate/
-- bags, and is completely unaffected by any of this (never auto-recalculated,
-- exactly like today).
ALTER TABLE trip_expenses
  ADD COLUMN IF NOT EXISTS rate_type                   TEXT CHECK (rate_type IN ('fixed', 'per_bag')),
  ADD COLUMN IF NOT EXISTS unit_rate                    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS bags                         INT,
  -- Traceability only (see module comment above) — never re-read to
  -- recompute this row; ON DELETE SET NULL so deleting/editing a route
  -- template later can never retroactively touch a historical expense.
  ADD COLUMN IF NOT EXISTS route_template_operation_id  UUID REFERENCES route_template_operations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trip_expenses_route_template_operation ON trip_expenses(route_template_operation_id);
