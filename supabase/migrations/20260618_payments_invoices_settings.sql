-- ================================================================
-- Bagdrop Phase 2 Migration: Payments, Invoices, Settings
-- Run in Supabase SQL Editor AFTER 20260618_crm_tables.sql
-- ================================================================

-- ── EXTEND BOOKINGS TABLE ────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status      text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_method      text,
  ADD COLUMN IF NOT EXISTS payment_reference   text,
  ADD COLUMN IF NOT EXISTS approved_without_payment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by         text,
  ADD COLUMN IF NOT EXISTS delivery_date       date;

-- ── PAYMENTS TABLE ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id        text UNIQUE NOT NULL,
  booking_id        uuid REFERENCES bookings(id) ON DELETE SET NULL,
  customer_name     text NOT NULL,
  customer_phone    text NOT NULL,
  amount            numeric(10,2) NOT NULL DEFAULT 0,
  payment_method    text NOT NULL DEFAULT 'upi',
  payment_status    text NOT NULL DEFAULT 'pending',
  payment_reference text,
  notes             text,
  verified_by       text,
  verified_at       timestamptz,
  refund_amount     numeric(10,2),
  refund_reason     text,
  refunded_at       timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ── INVOICES TABLE ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number   text UNIQUE NOT NULL,
  booking_id       uuid REFERENCES bookings(id) ON DELETE SET NULL,
  payment_id       uuid REFERENCES payments(id) ON DELETE SET NULL,
  customer_name    text NOT NULL,
  customer_phone   text NOT NULL,
  customer_email   text,
  customer_address text,
  service_type     text,
  from_city        text,
  to_city          text,
  total_bags       integer DEFAULT 1,
  base_amount      numeric(10,2) DEFAULT 0,
  cgst             numeric(10,2) DEFAULT 0,
  sgst             numeric(10,2) DEFAULT 0,
  total_amount     numeric(10,2) DEFAULT 0,
  payment_status   text DEFAULT 'paid',
  payment_method   text,
  payment_reference text,
  notes            text,
  invoice_date     date DEFAULT CURRENT_DATE,
  due_date         date,
  sent_email       boolean DEFAULT false,
  sent_whatsapp    boolean DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ── SETTINGS TABLE ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

-- Seed default settings
INSERT INTO settings (key, value) VALUES
  ('company_name',       'Bagdrop')
 ,('company_gst',        '')
 ,('company_address',    '')
 ,('company_phone',      '')
 ,('company_email',      'hello@bagdrop.co')
 ,('payment_upi',        '')
 ,('payment_bank_name',  '')
 ,('payment_account_no', '')
 ,('payment_ifsc',       '')
 ,('notif_email',        'true')
 ,('notif_whatsapp',     'false')
 ,('notif_sms',          'false')
ON CONFLICT (key) DO NOTHING;

-- ── INDEXES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS payments_booking_id_idx   ON payments(booking_id);
CREATE INDEX IF NOT EXISTS payments_status_idx       ON payments(payment_status);
CREATE INDEX IF NOT EXISTS payments_created_at_idx   ON payments(created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_booking_id_idx   ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx       ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS invoices_created_at_idx   ON invoices(created_at DESC);

-- ── AUTO-UPDATE updated_at ────────────────────────────────────────
DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_payments" ON payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_invoices" ON invoices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_settings" ON settings FOR ALL TO service_role USING (true) WITH CHECK (true);
