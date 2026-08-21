-- ================================================================
-- Bagdrop — One-time backfill: sync stale invoice payment_status
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- invoices.payment_status was only ever set ONCE, at the moment an
-- invoice was generated (a snapshot copy of bookings.payment_status at
-- that instant — see app/api/admin/invoices/route.ts). If a payment was
-- approved AFTER the invoice already existed, nothing updated the
-- invoice row afterward, so the Invoices tab kept showing "Pending" /
-- the full Balance Due forever even though the booking and Payments tab
-- both correctly showed Paid. (Reported 2026-08-21 for invoice
-- BLS2600068 — Mr. Rahul Dedhia.)
--
-- lib/payment-status.ts's recomputeBookingPaymentStatus() now also syncs
-- invoices.payment_status going forward, every time a payment is
-- created/approved/rejected/refunded — see that file's comment. This
-- migration is the one-time fix for invoices that already went stale
-- before that code change existed.
--
-- The Invoices tab's own status model is deliberately binary (paid vs.
-- everything else = full balance still due — see balanceDue() in
-- app/(admin)/admin/invoices/page.tsx), so this collapses the richer
-- booking-level status the same way: only a booking at exactly 'paid'
-- flips its invoice to 'paid'; every other booking payment_status
-- (partially_paid / pending_verification / approved_pending / pending)
-- maps to invoice 'pending'. Safe to re-run — fully idempotent.
-- ================================================================

UPDATE invoices i
SET payment_status = 'paid'
FROM bookings b
WHERE i.booking_id = b.id
  AND b.payment_status = 'paid'
  AND i.payment_status IS DISTINCT FROM 'paid';

UPDATE invoices i
SET payment_status = 'pending'
FROM bookings b
WHERE i.booking_id = b.id
  AND b.payment_status IS DISTINCT FROM 'paid'
  AND i.payment_status IS DISTINCT FROM 'pending';
