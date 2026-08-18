-- BAGDROP — additive columns on `payments` for the new Zoho Books-style
-- "Record Payment" form (app/(admin)/admin/payments/page.tsx):
--   - payment_date: the admin-entered payment date, distinct from
--     created_at (when the row was actually inserted) — defaults to
--     created_at's date for any existing row so nothing already recorded
--     looks blank.
--   - bank_charges: optional bank/gateway deduction on the received amount.
--   - tds_deducted / tds_amount: "Tax deducted?" toggle on the new form.
-- Safe to re-run (IF NOT EXISTS / idempotent backfill).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_date  date,
  ADD COLUMN IF NOT EXISTS bank_charges  numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_deducted  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tds_amount    numeric(10,2);

UPDATE payments SET payment_date = created_at::date WHERE payment_date IS NULL;
