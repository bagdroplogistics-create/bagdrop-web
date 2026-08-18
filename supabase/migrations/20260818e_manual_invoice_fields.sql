-- BAGDROP — Manual "New Invoice" creation (Zoho Books parity)
-- (app/(admin)/admin/invoices/new/page.tsx, extended POST handler in
-- app/api/admin/invoices/route.ts). Previously every invoice was only
-- ever created by deriving one from an existing completed booking — this
-- adds support for a fully manual invoice (any customer, freeform item
-- table, discount, TDS/TCS, adjustment, attachments) with no booking_id
-- at all, matching Zoho's own "New Invoice" form. booking_id was already
-- nullable (ON DELETE SET NULL), so no change needed there.
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS order_number       text,
  ADD COLUMN IF NOT EXISTS pickup_time        text,
  ADD COLUMN IF NOT EXISTS delivery_time      text,
  ADD COLUMN IF NOT EXISTS pickup_address     text,
  ADD COLUMN IF NOT EXISTS delivery_address   text,
  ADD COLUMN IF NOT EXISTS subject            text,
  ADD COLUMN IF NOT EXISTS terms_conditions   text,
  ADD COLUMN IF NOT EXISTS discount_percent   numeric(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount    numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_tcs_type       text,          -- 'tds' | 'tcs' | null
  ADD COLUMN IF NOT EXISTS tds_tcs_percent    numeric(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_tcs_amount     numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_label   text,
  ADD COLUMN IF NOT EXISTS adjustment_amount  numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_manual          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachments        jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ================================================================
-- Manual step required: create the Supabase Storage bucket
-- ================================================================
-- Storage → New bucket → name it exactly "invoice-attachments" → Public
-- (same as "quotes", "payment-proofs", "payment-attachments").
