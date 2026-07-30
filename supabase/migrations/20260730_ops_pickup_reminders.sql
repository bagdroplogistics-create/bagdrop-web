-- BAGDROP — Internal Ops WhatsApp Pickup Reminders
--
-- One row per (booking, reminder_type). UNIQUE(booking_id, reminder_type) is
-- the dedup mechanism: scheduling always upserts onto this constraint, so a
-- reschedule (pickup date/time changed) overwrites scheduled_for on the
-- existing row instead of creating a second one, and the cron job's atomic
-- "pending -> sent" claim guarantees at-most-once delivery even if the cron
-- job overlaps itself.
--
-- This is entirely separate from bookings.status_history / the customer
-- notification pipeline (lib/notifications.ts, lib/lifecycle-notifications.ts)
-- — it never sends anything to a customer, only to the fixed internal Ops
-- WhatsApp number configured in settings.ops_reminder_whatsapp.

CREATE TABLE IF NOT EXISTS booking_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reminder_type   text NOT NULL CHECK (reminder_type IN ('day_before', 'day_of')),
  scheduled_for   timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at         timestamptz,
  delivery_status text,          -- e.g. Fast2SMS request_id on success, or the error string on failure
  channel         text,          -- 'whatsapp' today; kept as a column in case SMS/email fallback is added later
  recipient       text,          -- the number it was actually sent to, captured at send time
  detail          text,          -- free-text note, mirrors the summary appended to bookings.status_history
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (booking_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS booking_reminders_due_idx
  ON booking_reminders (status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS booking_reminders_booking_id_idx
  ON booking_reminders (booking_id);

ALTER TABLE booking_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_booking_reminders" ON booking_reminders;
CREATE POLICY "service_role_all_booking_reminders"
  ON booking_reminders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reuses the same update_updated_at_column() trigger function created by
-- supabase/migrations/20260731_google_calendar.sql (CREATE OR REPLACE there
-- makes it safe to depend on regardless of which migration runs first).
DROP TRIGGER IF EXISTS booking_reminders_updated_at ON booking_reminders;
CREATE TRIGGER booking_reminders_updated_at
  BEFORE UPDATE ON booking_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Settings: internal ops reminder config ──────────────────────────────────
-- Editable from Settings → Notifications without a redeploy. Times are plain
-- "HH:MM" 24h strings interpreted in IST (Asia/Kolkata), matching how every
-- other date on this dashboard is displayed to admins.
INSERT INTO settings (key, value) VALUES
  ('ops_reminder_enabled',             'true')
 ,('ops_reminder_whatsapp',            '+916357115711')
 ,('ops_reminder_day_before_time',     '18:00')
 ,('ops_reminder_day_of_time',         '08:00')
 ,('ops_reminder_hours_before_flight', '4')
ON CONFLICT (key) DO NOTHING;
