-- ─────────────────────────────────────────────────────────────────────────────
-- BAGDROP — Soft-Delete Migration for Leads
-- Run in Supabase Dashboard → SQL Editor
--
-- WHAT THIS DOES:
--   Adds a `deleted_at` timestamp column to the leads table.
--   Leads are now SOFT-DELETED (deleted_at set) instead of hard-deleted.
--   They remain in the DB and can be recovered by the admin.
--
-- HOW TO RUN:
--   1. Go to https://supabase.com/dashboard → your project → SQL Editor
--   2. Paste this entire script and click Run
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add soft-delete column (idempotent)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Index for fast filtering of non-deleted leads
CREATE INDEX IF NOT EXISTS leads_deleted_at_idx ON leads (deleted_at)
  WHERE deleted_at IS NULL;

-- 3. (Optional) View for non-deleted leads — convenient for Supabase table editor
CREATE OR REPLACE VIEW active_leads AS
  SELECT * FROM leads WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- RESTORE: Kamin Patel — BDL-2026-0044 (QT-2026-0044)
-- This lead was accidentally deleted. Run AFTER the ALTER TABLE above.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Check if the booking BDA-2026-0044 still exists (it should — it was
--         only CANCELLED, not hard-deleted).
SELECT id, tracking_id, customer_name, customer_phone, status, lead_id,
       from_city, to_city, pickup_date, delivery_date, total_bags, total_amount,
       created_at
FROM bookings
WHERE tracking_id = 'BDA-2026-0044';

-- Step 2: Re-insert the lead, linking to the existing booking.
--         Replace 'BOOKING_UUID_HERE' with the actual UUID from Step 1 result.
--         If Step 1 returns no rows, remove the booking_id line and leave it NULL.
--
--         *** Run Step 1 first, copy the booking id, then run Step 2 ***

INSERT INTO leads (
  lead_number,
  name,
  phone,
  email,
  source,
  service_interest,
  service_type,
  from_city,
  to_city,
  pickup_date,
  pickup_time,
  delivery_date,
  pickup_address,
  drop_address,
  bags_count,
  status,
  salesperson_name,
  quote_number,
  zoho_estimate_number,
  quote_total,
  quote_subtotal,
  quote_tax,
  quote_date,
  quote_line_items,
  notes,
  booking_id,
  deleted_at
)
VALUES (
  'BDL-2026-0044',
  'Kamin Patel',
  '+918511177388',
  NULL,                          -- email unknown from PDF
  'admin',
  'doorstep-to-airport',
  'doorstep-to-airport',
  'Ahmedabad',
  'Mumbai Airport',
  '2026-07-23',
  '13:00',
  '2026-07-25',
  'Navrangpura, Ahmedabad',
  'Mumbai International Airport, Terminal 2, Mumbai - 400099',
  6,
  'new',
  'Vijay Thacker',
  'QT-2026-0044',
  'QT-2026-0044',
  13860.00,
  13200.00,
  660.00,
  '2026-07-15',
  '[
    {"name":"Transportation of Goods (Upto 2 Bags) — Ahmedabad → Mumbai Airport","description":"Airport-to-Doorstep / Doorstep-to-Airport baggage delivery · SAC 996511","quantity":1,"rate":6000,"tax_pct":5,"hsn_or_sac":"996511","amount":6000},
    {"name":"Additional Bag(s) — Ahmedabad → Mumbai Airport","description":"Per extra bag beyond 2 · SAC 996511","quantity":4,"rate":1800,"tax_pct":5,"hsn_or_sac":"996511","amount":7200}
  ]'::jsonb,
  'Looking forward for your business.',
  -- ↓ Replace with actual booking UUID from Step 1, or NULL if not found
  (SELECT id FROM bookings WHERE tracking_id = 'BDA-2026-0044' LIMIT 1),
  NULL   -- deleted_at = NULL means ACTIVE (not deleted)
)
ON CONFLICT (lead_number) DO UPDATE
  SET
    deleted_at    = NULL,                   -- un-delete if somehow it's there
    status        = EXCLUDED.status,
    quote_number  = EXCLUDED.quote_number,
    quote_total   = EXCLUDED.quote_total,
    booking_id    = COALESCE(EXCLUDED.booking_id, leads.booking_id);

-- Step 3: Re-link the booking back to the new lead
UPDATE bookings
SET
  lead_id = (SELECT id FROM leads WHERE lead_number = 'BDL-2026-0044'),
  status  = CASE WHEN status = 'cancelled' THEN 'quote_created' ELSE status END,
  notes   = NULL
WHERE tracking_id = 'BDA-2026-0044';

-- Step 4: Verify restoration
SELECT
  l.lead_number, l.name, l.phone, l.status, l.quote_number, l.quote_total,
  l.booking_id, l.deleted_at,
  b.tracking_id AS booking_tracking, b.status AS booking_status
FROM leads l
LEFT JOIN bookings b ON b.id = l.booking_id
WHERE l.lead_number = 'BDL-2026-0044';
