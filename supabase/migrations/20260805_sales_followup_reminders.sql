-- ============================================================
-- BAGDROP — Sales Follow-up & Reminder System (Phase 1)
-- Run in Supabase Dashboard → SQL Editor
--
-- Purely additive background automation layer. Does NOT change the
-- existing inquiry/quotation/booking workflow — it only watches
-- leads.created_at / leads.quote_number / leads.quote_date / the linked
-- booking's status, and fires internal WhatsApp/email reminders when a
-- quote hasn't been sent or a customer hasn't responded in time.
--
-- Mirrors the existing booking_reminders pattern (see
-- 20260730_ops_pickup_reminders.sql / lib/ops-reminders.ts) as closely as
-- possible: one row per (lead, reminder_type), UNIQUE constraint for
-- dedup, atomic pending -> sent claim at send time so an overlapping cron
-- tick can't double-send.
-- ============================================================

-- ── leads: let an admin manually record that the customer responded ───
-- (Accept Quote / Reject Quote already exist as booking-status actions —
-- see app/(admin)/admin/quotes/view/[lead_id]/page.tsx and
-- app/(admin)/admin/page.tsx — and are NOT modified by this migration.
-- The reminder engine treats a booking status other than 'quote_sent'
-- (i.e. accepted/rejected/further along) as an automatic stop condition
-- without needing this column. This column exists only for the new,
-- purely additive "Mark Customer Responded" button for cases with no
-- status change to hook, e.g. the customer called and said "still
-- deciding" or replied by phone.)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS customer_responded_at timestamptz;

COMMENT ON COLUMN leads.customer_responded_at IS
  'Set when an admin clicks "Mark Customer Responded" on the Quote View page. Stops the sales follow-up reminder for this lead. NULL = no manual response recorded (the reminder engine also independently stops once the linked booking is accepted/rejected).';

-- ── lead_followups: one row per (lead, reminder tier) ─────────────────
CREATE TABLE IF NOT EXISTS lead_followups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  reminder_type   text NOT NULL CHECK (reminder_type IN (
                    'quote_pending_24h', 'quote_pending_48h', 'quote_pending_72h',
                    'response_24h',      'response_48h',      'response_72h'
                  )),
  scheduled_for   timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at         timestamptz,
  delivery_status text,          -- Fast2SMS request_id / Resend id on success, or the error string on failure
  channel         text,          -- 'whatsapp' | 'email' — one row per channel actually sent
  recipient       text,          -- number/address actually sent to, captured at send time
  detail          text,          -- free-text note, also mirrored onto leads.communication_log
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (lead_id, reminder_type, channel)
);

CREATE INDEX IF NOT EXISTS lead_followups_due_idx
  ON lead_followups (status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS lead_followups_lead_id_idx
  ON lead_followups (lead_id);

ALTER TABLE lead_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_lead_followups" ON lead_followups;
CREATE POLICY "service_role_all_lead_followups"
  ON lead_followups FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS lead_followups_updated_at ON lead_followups;
CREATE TRIGGER lead_followups_updated_at
  BEFORE UPDATE ON lead_followups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Settings: configurable without any code change ─────────────────────
-- Reuses the existing generic key/value `settings` table (see
-- 20260618_payments_invoices_settings.sql). Every one of these is editable
-- via PATCH /api/admin/settings once allow-listed there (done in the same
-- commit as this migration) — a dedicated "Sales Follow-up Settings" tab
-- UI is a follow-up phase; until then these can be edited directly in
-- Supabase or via the settings API.
INSERT INTO settings (key, value) VALUES
  ('sales_followup_enabled',                 'true')
 ,('sales_followup_whatsapp_enabled',        'true')
 ,('sales_followup_email_enabled',           'false')
 ,('sales_followup_whatsapp',                '+916357115711')
 ,('sales_followup_email',                   '')
 ,('sales_followup_quote_reminder_hours',    '24')
 ,('sales_followup_response_reminder_hours', '24')
 ,('sales_followup_escalation_enabled',      'false')
ON CONFLICT (key) DO NOTHING;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'customer_responded_at'
UNION ALL
SELECT table_name, 'table exists' FROM information_schema.tables
WHERE table_name = 'lead_followups';
