-- ============================================================
-- BAGDROP — Trip Sheet Module Migration
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Trip Sheets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_sheets (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_number         TEXT        UNIQUE NOT NULL,              -- BDT-2026-0001

  -- Linked records
  booking_id          UUID        REFERENCES bookings(id) ON DELETE SET NULL,
  quote_id            UUID        REFERENCES quotes(id)   ON DELETE SET NULL,

  -- Auto-filled from booking
  customer_name       TEXT,
  customer_phone      TEXT,
  customer_email      TEXT,
  service_type        TEXT,
  service_label       TEXT,
  from_city           TEXT,
  to_city             TEXT,
  pickup_address      TEXT,
  drop_address        TEXT,
  pickup_date         DATE,
  delivery_date       DATE,
  total_bags          INT         DEFAULT 1,
  quote_amount        NUMERIC(10,2) DEFAULT 0,
  payment_status      TEXT,

  -- Trip-specific operational fields
  status              TEXT        DEFAULT 'created',
    -- created | pickup_assigned | picked_up | in_transit
    -- at_airport | out_for_delivery | delivered | completed | cancelled
  vendor              TEXT,
  driver_name         TEXT,
  vehicle_number      TEXT,
  consignment_number  TEXT,
  luggage_code        TEXT,
  cloak_room_number   TEXT,
  pickup_person       TEXT,
  pickup_contact      TEXT,
  delivery_person     TEXT,
  delivery_contact    TEXT,
  notes               TEXT,
  remarks             TEXT,

  -- Income section
  additional_charges  NUMERIC(10,2) DEFAULT 0,
  discount            NUMERIC(10,2) DEFAULT 0,
  tax_amount          NUMERIC(10,2) DEFAULT 0,
  total_income        NUMERIC(10,2) DEFAULT 0,   -- computed: quote_amount + additional - discount + tax

  -- Expense & Profit (updated whenever expenses change)
  total_expense       NUMERIC(10,2) DEFAULT 0,
  net_profit          NUMERIC(10,2) DEFAULT 0,   -- total_income - total_expense

  -- Audit trail
  status_history      JSONB       DEFAULT '[]',
  created_by          TEXT        DEFAULT 'admin',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trip Expenses (dynamic rows) ──────────────────────────────
CREATE TABLE IF NOT EXISTS trip_expenses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_sheet_id   UUID        NOT NULL REFERENCES trip_sheets(id) ON DELETE CASCADE,

  expense_type    TEXT,   -- Fuel | Toll | Parking | Driver Charges | Airport Charges |
                          -- Porter Charges | Labour | Hotel | Food | Courier | Miscellaneous
  mode            TEXT,   -- Road | Air | Rail | Other
  from_location   TEXT,
  to_location     TEXT,
  vendor          TEXT,
  description     TEXT,
  estimated_cost  NUMERIC(10,2) DEFAULT 0,
  actual_cost     NUMERIC(10,2) DEFAULT 0,
  payment_status  TEXT DEFAULT 'pending',  -- pending | paid
  receipt_url     TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trip_sheets_booking_id   ON trip_sheets(booking_id);
CREATE INDEX IF NOT EXISTS idx_trip_sheets_status       ON trip_sheets(status);
CREATE INDEX IF NOT EXISTS idx_trip_sheets_created_at   ON trip_sheets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_sheets_trip_number  ON trip_sheets(trip_number);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_sheet_id   ON trip_expenses(trip_sheet_id);

-- ── Updated-at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_trip_sheets_updated_at ON trip_sheets;
CREATE TRIGGER set_trip_sheets_updated_at
  BEFORE UPDATE ON trip_sheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_trip_expenses_updated_at ON trip_expenses;
CREATE TRIGGER set_trip_expenses_updated_at
  BEFORE UPDATE ON trip_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS (mirrors existing bookings policy pattern) ────────────
ALTER TABLE trip_sheets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_expenses ENABLE ROW LEVEL SECURITY;

-- Service-role key bypasses RLS — anon key is blocked entirely
CREATE POLICY "service_role_all_trip_sheets"
  ON trip_sheets FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_trip_expenses"
  ON trip_expenses FOR ALL TO service_role USING (true) WITH CHECK (true);
