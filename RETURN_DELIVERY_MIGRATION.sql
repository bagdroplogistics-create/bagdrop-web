-- ============================================================
-- BAGDROP — Return Journey: delivery date/time fields
-- Run in Supabase Dashboard → SQL Editor
--
-- Founder-reported 2026-09-21: the "Add Return Quote" form (New Quote
-- page, Return Journey Details section) captures a Return Pickup Date
-- and Return Pickup Time, but has no field at all for when the return
-- journey is actually DELIVERED — only the onward/primary leg has a
-- delivery_date field. This adds the missing pair for the return leg,
-- purely additive (all new columns nullable), so existing leads and
-- bookings are completely unaffected.
-- ============================================================

-- ── leads: return-leg delivery date + time (mirrors the existing
--    return_pickup_date / return_pickup_time pair added by
--    RETURN_QUOTE_MIGRATION.sql / RETURN_TRIP_BOOKING_MIGRATION.sql) ──
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS return_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS return_delivery_time TEXT;

COMMENT ON COLUMN leads.return_delivery_date IS 'Return journey delivery date — when the return-leg baggage is delivered.';
COMMENT ON COLUMN leads.return_delivery_time IS 'Return journey delivery time (free text / HH:mm), paired with return_delivery_date.';

-- ── bookings: delivery time-of-day, for whichever leg (onward or
--    return) this booking row represents. bookings.delivery_date
--    already exists (see 004_leads_new_fields.sql /
--    20260618_payments_invoices_settings.sql) but there was previously
--    no time-of-day column at all for delivery, on either leg — only
--    pickup has one (bookings.time_slot). ────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS delivery_time_slot TEXT;

COMMENT ON COLUMN bookings.delivery_time_slot IS 'Delivery time-of-day (free text / HH:mm), paired with delivery_date. Mirrors time_slot, which is pickup-only.';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name IN ('return_delivery_date', 'return_delivery_time')
UNION ALL
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bookings' AND column_name = 'delivery_time_slot'
ORDER BY column_name;
