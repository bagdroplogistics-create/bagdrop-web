-- BAGDROP — Internal Ops WhatsApp Pickup Reminders: add "2 days before" tier
--
-- Founder request: alongside the existing day_before (default 18:00 IST the
-- day before pickup) and day_of (default 08:00 IST on pickup day, or N
-- hours before flight_datetime when set) reminders, add a third tier that
-- fires 2 CALENDAR DAYS before pickup_date. Uses the exact same already-
-- approved `ops_pickup_reminder` Fast2SMS template (MESSAGE ID 27293, 12
-- variables) — no new template, no code changes to variable-building
-- (lib/ops-reminders.ts's buildReminderVariables already produces the
-- right 12 values for any reminder type).
--
-- Sent ONLY to the internal Ops WhatsApp number (settings.ops_reminder_
-- whatsapp) — this template's own content ("Dear Bagdrop Team", Status,
-- Driver, Special Instructions fields) is internal-only, confirmed with
-- the founder — never the customer.
--
-- Dedup/idempotency: same mechanism as the existing two tiers — the
-- UNIQUE(booking_id, reminder_type) constraint below is simply widened to
-- also allow 'two_days_before' as a value; scheduling still upserts onto
-- it, so a given booking can only ever have one 'two_days_before' row.

-- Postgres has no ALTER ... ADD VALUE for a plain CHECK constraint (unlike
-- an enum type) — drop and recreate with the wider allowed-values list.
-- The name below is Postgres's auto-generated default for an inline
-- column CHECK on this table (table_column_check), matching how this
-- constraint was originally created in
-- 20260730_ops_pickup_reminders.sql (no explicit CONSTRAINT name given).
ALTER TABLE booking_reminders DROP CONSTRAINT IF EXISTS booking_reminders_reminder_type_check;
ALTER TABLE booking_reminders
  ADD CONSTRAINT booking_reminders_reminder_type_check
  CHECK (reminder_type IN ('two_days_before', 'day_before', 'day_of'));

-- New settings key for this tier's trigger time (HH:MM, IST) — same
-- pattern as ops_reminder_day_before_time / ops_reminder_day_of_time.
-- Defaults to the same clock time as day_before (18:00 IST) so "2 days
-- before" and "1 day before" land at a consistent, predictable hour;
-- change via Settings -> Notifications (or directly here) if a different
-- time of day is wanted for this tier specifically.
INSERT INTO settings (key, value) VALUES
  ('ops_reminder_two_days_before_time', '18:00')
ON CONFLICT (key) DO NOTHING;
