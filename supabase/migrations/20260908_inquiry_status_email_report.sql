-- BAGDROP — Automatic Inquiry Status Email Reports
-- (lib/inquiry-status-email-report.ts, app/api/cron/send-inquiry-status-
-- report/route.ts). Sends one internal-ops email daily (9:00 AM IST) to
-- info@bagdrop.co with two sections: every booking currently Confirmed/
-- Ongoing, and every inquiry still awaiting a quote — so the team can
-- scan both "needs operational follow-up" and "needs a quote" in one place
-- without opening the dashboard.
--
-- This is a purely additive reporting feature — it never reads from or
-- writes to bookings/leads/quotes/payments beyond a plain SELECT. This
-- table is only the idempotency guard, same "the row itself is the lock"
-- pattern already used by scheduled_report_runs
-- (20260818d_confirmed_ongoing_summary.sql): one row per report, keyed by
-- a unique report_key ('YYYY-MM-DD' IST for real scheduled runs,
-- 'test_<timestamp>' for manual/dry-run test sends, which deliberately
-- never collide with the real daily key). Inserted with
-- ON CONFLICT (report_key) DO NOTHING as the very first step of a run —
-- if 0 rows come back, another invocation already claimed this exact
-- report, so this one no-ops rather than double-sending.
--
-- A separate table from scheduled_report_runs (not a reused row shape)
-- because that table's report_type CHECK constraint is hardcoded to
-- ('morning', 'evening') for the WhatsApp booking report, and its columns
-- (fast2sms_response, message_parts) don't fit an email report with a
-- third count bucket (quote-pending). New table, same proven pattern.

CREATE TABLE IF NOT EXISTS inquiry_status_email_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key            text NOT NULL UNIQUE,
  report_date           date NOT NULL,
  is_test               boolean NOT NULL DEFAULT false,
  confirmed_count       integer,
  ongoing_count         integer,
  quote_pending_count   integer,
  recipients            text[],
  resend_response        jsonb,
  success               boolean,
  error                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

CREATE INDEX IF NOT EXISTS inquiry_status_email_runs_report_date_idx ON inquiry_status_email_runs(report_date);
