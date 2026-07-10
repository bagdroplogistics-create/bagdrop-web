-- ─────────────────────────────────────────────────────────────────
-- Bagdrop | Route Pricing Migration
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS route_pricing (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  from_city    TEXT        NOT NULL,
  to_city      TEXT        NOT NULL,
  base_price   NUMERIC(10,2) NOT NULL,   -- price for 1–2 bags
  per_bag_rate NUMERIC(10,2) NOT NULL,   -- extra cost per bag beyond 2
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_route UNIQUE (from_city, to_city)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_route_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_route_pricing_updated_at ON route_pricing;
CREATE TRIGGER trg_route_pricing_updated_at
  BEFORE UPDATE ON route_pricing
  FOR EACH ROW EXECUTE FUNCTION update_route_pricing_updated_at();

-- Seed data (city names stored lowercase for consistent matching)
INSERT INTO route_pricing (from_city, to_city, base_price, per_bag_rate) VALUES
  ('anand',      'mumbai',     6000, 1800),
  ('nadiad',     'mumbai',     6000, 1800),
  ('mumbai',     'baroda',     5000, 1800),
  ('ahmedabad',  'mumbai',     6000, 1800),
  ('delhi',      'udaipur',    5000, 1800),
  ('ahmedabad',  'bangalore', 10000, 5000),
  ('baroda',     'delhi',     10000, 5000)
ON CONFLICT (from_city, to_city) DO UPDATE SET
  base_price   = EXCLUDED.base_price,
  per_bag_rate = EXCLUDED.per_bag_rate,
  updated_at   = NOW();

-- Enable RLS (admin-only via service_role key, so not strictly needed,
-- but good practice)
ALTER TABLE route_pricing ENABLE ROW LEVEL SECURITY;

-- Allow service_role (used by supabaseAdmin) to do everything
CREATE POLICY "service_role_all" ON route_pricing
  FOR ALL USING (true) WITH CHECK (true);
