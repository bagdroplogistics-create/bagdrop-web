-- BAGDROP — atomic, race-safe number series for tracking IDs (BDA-),
-- lead numbers (BDL-), and (available for later use) quote numbers (BDQ-).
--
-- WHY: lead_number and the BDA- tracking ID (which was literally just
-- lead_number with its "BDL-" prefix swapped for "BDA-" — see
-- app/api/admin/zoho/generate-quote/route.ts) were both generated with a
-- "SELECT ... ORDER BY ... DESC LIMIT 1, then +1, then INSERT" pattern.
-- That's not safe against two admins creating a lead/quote at the same
-- moment (both read the same "last" value, both compute the same "next"
-- value, one insert wins, the other fails or — worse — a near-simultaneous
-- request could still slip a duplicate through). This migration replaces
-- that pattern with a single atomic UPSERT per series+year, which Postgres
-- serializes via ordinary row-level locking — no application-level retry
-- logic needed, no possibility of two callers getting the same number.
--
-- Each series resets to 0001 at the start of each calendar year, matching
-- the existing BDL-YYYY-NNNN / BDA-YYYY-NNNN convention already in use.
--
-- Self-seeding: the INSERT below seeds each series' counter for the
-- CURRENT year from whatever the real MAX already is in the leads/bookings
-- tables, so the first call to next_series_number() continues the actual
-- existing series — it never re-issues a number that's already in use.
CREATE TABLE IF NOT EXISTS bagdrop_number_counters (
  series    text NOT NULL,
  year      int  NOT NULL,
  last_seq  int  NOT NULL DEFAULT 0,
  PRIMARY KEY (series, year)
);

-- Seed BDA (tracking IDs, from bookings.tracking_id) for the current year.
INSERT INTO bagdrop_number_counters (series, year, last_seq)
SELECT 'BDA', EXTRACT(YEAR FROM CURRENT_DATE)::int, COALESCE(MAX(
  (regexp_match(tracking_id, '^BDA-\d{4}-(\d{4})$'))[1]::int
), 0)
FROM bookings
WHERE tracking_id ~ ('^BDA-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-\d{4}$')
ON CONFLICT (series, year) DO NOTHING;

-- Seed BDL (lead numbers, from leads.lead_number) for the current year.
INSERT INTO bagdrop_number_counters (series, year, last_seq)
SELECT 'BDL', EXTRACT(YEAR FROM CURRENT_DATE)::int, COALESCE(MAX(
  (regexp_match(lead_number, '^BDL-\d{4}-(\d{4})$'))[1]::int
), 0)
FROM leads
WHERE lead_number ~ ('^BDL-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-\d{4}$')
ON CONFLICT (series, year) DO NOTHING;

-- Seed BDQ (quote numbers, from quotes.quote_number) for the current year,
-- in case it's wired up to this same mechanism later.
INSERT INTO bagdrop_number_counters (series, year, last_seq)
SELECT 'BDQ', EXTRACT(YEAR FROM CURRENT_DATE)::int, COALESCE(MAX(
  (regexp_match(quote_number, '^BDQ-\d{4}-(\d{4})$'))[1]::int
), 0)
FROM quotes
WHERE quote_number ~ ('^BDQ-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-\d{4}$')
ON CONFLICT (series, year) DO NOTHING;

CREATE OR REPLACE FUNCTION next_series_number(p_series text, p_width int DEFAULT 4)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  yr  int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  seq int;
BEGIN
  INSERT INTO bagdrop_number_counters (series, year, last_seq)
  VALUES (p_series, yr, 1)
  ON CONFLICT (series, year)
  DO UPDATE SET last_seq = bagdrop_number_counters.last_seq + 1
  RETURNING last_seq INTO seq;

  RETURN p_series || '-' || yr || '-' || lpad(seq::text, p_width, '0');
END;
$$;
