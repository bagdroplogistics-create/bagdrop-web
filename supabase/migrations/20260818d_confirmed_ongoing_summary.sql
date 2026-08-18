-- BAGDROP — Automated Confirmed & Ongoing Inquiry WhatsApp Summary
-- (lib/confirmed-ongoing-summary.ts, app/api/cron/send-confirmed-ongoing-
-- summary/route.ts). Sends an internal-ops WhatsApp report twice daily
-- (9:00 AM / 6:00 PM IST) listing every booking currently at 'confirmed'
-- or one of the "ongoing" operational statuses, so nothing gets missed
-- just because nobody opened the dashboard.
--
-- This table is the idempotency guard: one row per report, keyed by a
-- unique report_key ('YYYY-MM-DD_morning' / 'YYYY-MM-DD_evening' for real
-- scheduled runs; 'test_<timestamp>_<type>' for manual/dry-run test sends,
-- which deliberately never collide with the real daily key so testing can
-- never block — or be blocked by — the actual scheduled report). A row is
-- inserted with ON CONFLICT (report_key) DO NOTHING as the very first step
-- of a run; if 0 rows are inserted, another invocation already claimed
-- (or already completed) that exact report, so this invocation no-ops.
-- Same "the row itself is the lock" pattern already used by
-- booking_reminders (20260730_ops_pickup_reminders.sql) and the atomic
-- number-series RPC (20260817_atomic_number_series.sql) — reused here
-- rather than inventing a new locking mechanism.

CREATE TABLE IF NOT EXISTS scheduled_report_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key          text NOT NULL UNIQUE,
  report_type         text NOT NULL CHECK (report_type IN ('morning', 'evening')),
  report_date         date NOT NULL,
  scheduled_time      text NOT NULL,           -- '09:00' / '18:00' (IST, display only)
  is_test             boolean NOT NULL DEFAULT false,
  inquiry_count       integer,
  confirmed_count     integer,
  ongoing_count       integer,
  message_parts       integer,
  recipients          text[],
  fast2sms_response   jsonb,
  success             boolean,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS scheduled_report_runs_report_date_idx ON scheduled_report_runs(report_date);
