-- BAGDROP — Invoice numbering sourced from Zoho Books + Zoho-style PDF fields
--
-- Previously invoice_number was purely local (BDI-{year}-{count+1}). From
-- now on, a NEW invoice is only ever created by actually calling Zoho
-- Books' POST /invoices (see lib/zoho-books.ts's createZohoInvoice() and
-- app/api/admin/invoices/route.ts) — Zoho assigns the real invoice_number
-- from the org's configured series atomically at creation time, which is
-- stored directly in invoices.invoice_number (no separate local counter
-- column needed — every place that already reads invoice.invoice_number
-- keeps working unchanged).
--
-- Run this in the Supabase SQL editor.

ALTER TABLE invoices
  -- Zoho Books' own IDs for this invoice + the customer contact it was
  -- billed to — needed to look the invoice back up in Zoho later (e.g. to
  -- void/update it) without a second contact search.
  ADD COLUMN IF NOT EXISTS zoho_invoice_id  text,
  ADD COLUMN IF NOT EXISTS zoho_contact_id  text,

  -- IGST support alongside the existing cgst/sgst columns — only ever
  -- populated for interstate business-customer invoices (see
  -- resolveGstTreatment() in app/api/admin/invoices/route.ts); intrastate
  -- invoices (the default — matches 100% of pre-existing behavior) keep
  -- igst = 0 and use cgst/sgst exactly as before.
  ADD COLUMN IF NOT EXISTS igst  numeric(10,2) DEFAULT 0,

  -- New Zoho-style PDF metadata fields — snapshotted from the booking at
  -- generation time (not live-joined at render time) so a later booking
  -- edit can never retroactively change an already-issued invoice's PDF.
  ADD COLUMN IF NOT EXISTS place_of_supply  text,
  ADD COLUMN IF NOT EXISTS pickup_date      date,
  ADD COLUMN IF NOT EXISTS delivery_date    date,
  ADD COLUMN IF NOT EXISTS consignment_no   text,

  -- Snapshot of the exact per-item breakdown (name, HSN, qty, rate, tax %
  -- and amount per row) billed on this invoice — the PDF renders this
  -- directly instead of re-deriving it from the booking/lead at render
  -- time, so the numbers on a downloaded/emailed PDF can never drift from
  -- what was actually invoiced.
  ADD COLUMN IF NOT EXISTS line_items       jsonb;

CREATE INDEX IF NOT EXISTS invoices_zoho_invoice_id_idx ON invoices (zoho_invoice_id);
