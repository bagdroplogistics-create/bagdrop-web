-- ============================================================
-- BAGDROP — Google Calendar sync for confirmed bookings
-- Run in Supabase Dashboard → SQL Editor
--
-- One shared "Bagdrop Ops" calendar model (not per-admin OAuth): a single
-- admin connects one Google account once; the app then auto-manages events
-- on that one calendar for every confirmed booking. Team members subscribe
-- to that one calendar from their own Google Calendar app to get reminders
-- on their own devices — no per-admin token storage needed, which matches
-- this system's shared-key (ADMIN_SECRET_KEY/STAFF_SECRET_KEY) auth model
-- rather than individual admin logins.
-- ============================================================

-- Single-row table (by convention — the app never inserts a second row).
-- Holds the OAuth tokens for the one connected Google account.
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  google_email      TEXT,                        -- the connected account, for display only
  access_token      TEXT        NOT NULL,
  refresh_token     TEXT        NOT NULL,
  token_expires_at  TIMESTAMPTZ NOT NULL,
  calendar_id       TEXT        NOT NULL DEFAULT 'primary',
  connected_by      TEXT,                        -- admin role that connected it ('admin'/'staff')
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_google_calendar_connections"
  ON google_calendar_connections FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_google_calendar_connections_updated_at ON google_calendar_connections;
CREATE TRIGGER set_google_calendar_connections_updated_at
  BEFORE UPDATE ON google_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Tracks which Google Calendar event belongs to which booking, so a
-- reschedule/cancellation updates or removes the right event instead of
-- creating duplicates. Nullable — most bookings will never have one (only
-- confirmed-or-later bookings get synced).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
