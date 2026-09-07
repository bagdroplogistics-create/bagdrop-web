-- ================================================================
-- Bagdrop — Payment Acknowledgement + Payment Receipt automation
-- Run in Supabase SQL Editor
-- ================================================================
--
-- Purely additive tracking columns on `payments`, for the new automation
-- that fires once Accounts approves a payment's verification (see
-- app/api/admin/payments/[id]/route.ts's existing
-- `verificationStatus === 'verified'` block, and the new
-- lib/payment-receipt-notification.ts it now also calls there). Does NOT
-- touch the existing Payment Verification / Accounts Approval workflow
-- itself — verified_by / verified_at / payment_verification_status etc.
-- are all untouched.
--
-- Each channel (email, WhatsApp) gets its own status/timestamp/error
-- columns, checked independently — NOT one combined "sent" flag — so that:
--   1. A payment whose customer has no email on file can still get a
--      WhatsApp receipt (and vice versa) without either channel blocking
--      the other.
--   2. An admin can retry ONLY the channel that actually failed (see the
--      new POST /api/admin/payments/[id]/send-receipt route) without
--      re-sending a channel that already succeeded — this is what
--      actually prevents the customer from ever receiving a duplicate
--      acknowledgement or receipt (spec requirement: "the customer does
--      not receive duplicate acknowledgements or receipts").
--
-- receipt_pdf_url is cached (generated once, reused on retry) rather than
-- regenerated on every send attempt — a payment's own data never changes
-- after Accounts approves it, so there's nothing to go stale, and this
-- avoids re-uploading a new Storage object on every retry click.
--
-- Receipt Number is NOT a new column — every payment already has a unique
-- payment_id (e.g. "BDP-2026-0008", see 20260618_payments_invoices_settings.sql)
-- which the existing admin-facing Payment Receipt panel already uses as
-- the receipt's own reference number (app/(admin)/admin/payments/page.tsx's
-- PaymentReceiptPanel: "Payment Receipt — {payment.payment_id}"). The new
-- customer-facing receipt PDF reuses that exact same value, so there is
-- only ever one receipt-numbering scheme in this codebase, not two.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS receipt_pdf_url          text,
  ADD COLUMN IF NOT EXISTS receipt_generated_at      timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_email_status      text,       -- 'sent' | 'failed' | 'skipped'
  ADD COLUMN IF NOT EXISTS receipt_email_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_email_error       text,
  ADD COLUMN IF NOT EXISTS receipt_whatsapp_status    text,       -- 'sent' | 'failed' | 'skipped'
  ADD COLUMN IF NOT EXISTS receipt_whatsapp_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_whatsapp_error     text;

-- ================================================================
-- Manual step required: create the Supabase Storage bucket for receipts
-- ================================================================
-- This migration cannot create a Storage bucket via SQL. In the Supabase
-- dashboard: Storage → New bucket → name it exactly "payment-receipts" →
-- make it Public (same pattern as the existing "quotes" and
-- "payment-proofs" buckets) so a generated receipt URL works the same way
-- quote PDF URLs already do, and so it can be used as a WhatsApp
-- Document-header media_url.
--
-- ================================================================
-- Manual step required: submit the new WhatsApp template for approval
-- ================================================================
-- lib/payment-receipt-notification.ts sends the customer's WhatsApp
-- acknowledgement via a NEW Fast2SMS/Meta template named
-- 'payment_verified_receipt' (3 body variables: Customer Name, Amount,
-- Tracking ID; one Document header for the receipt PDF) — same
-- "hardcoded template name, no-ops safely until approved" convention this
-- codebase already uses for every other template (see
-- lib/lifecycle-notifications.ts's TEMPLATE_BY_STATUS). Submit this
-- template to Fast2SMS/Meta for approval before it will actually deliver;
-- until then, sendWhatsAppTemplate() simply returns a clean "template not
-- found"-style failure, which is recorded in receipt_whatsapp_error/
-- receipt_whatsapp_status for the admin to see and retry once approved —
-- the Payment Received email + PDF attachment already works today via
-- Resend, independent of this.
