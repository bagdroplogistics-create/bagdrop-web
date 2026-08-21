-- ================================================================
-- Bagdrop — Diagnostic: find existing BDA/BDL number mismatches
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- READ-ONLY — this SELECTs only, it does not change any data.
-- ================================================================
--
-- WHY THIS EXISTS
-- Reported 2026-08-21: booking BDA-2026-0112 (Mr. Ravi Patel) is paired
-- with lead BDL-2026-0115 — a 3-number drift. Root cause: the "repair"
-- booking-creation path (app/api/admin/repair/create-booking-for-lead)
-- and the Zoho quote-generation path (app/api/admin/zoho/generate-quote)
-- both used to mint a brand-new, independently-sequenced BDA number for
-- a lead that already had its own BDL number, instead of deriving the
-- paired number — now fixed in both routes (2026-08-21) so this won't
-- happen again for any NEW repair/quote-generation going forward.
--
-- This query finds every ALREADY-EXISTING lead+booking pair where the
-- numbers don't match, so you can decide whether to correct them. It
-- does NOT auto-fix anything — renaming an already-issued tracking_id
-- could confuse a customer who was already sent that number (e.g. in a
-- WhatsApp booking confirmation), so that's a judgment call, not
-- something to change silently.
-- ================================================================

SELECT
  l.id            AS lead_id,
  l.lead_number,
  l.name          AS customer_name,
  l.phone,
  b.id            AS booking_id,
  b.tracking_id,
  b.status        AS booking_status,
  l.lead_number ~ '^BDL-' AND b.tracking_id ~ '^BDA-'
    AND right(l.lead_number, 9) <> right(b.tracking_id, 9) AS is_mismatched
FROM leads l
JOIN bookings b ON b.id = l.booking_id
WHERE l.lead_number ~ '^BDL-'
  AND b.tracking_id ~ '^BDA-'
  AND right(l.lead_number, 9) <> right(b.tracking_id, 9)
ORDER BY l.created_at DESC;
