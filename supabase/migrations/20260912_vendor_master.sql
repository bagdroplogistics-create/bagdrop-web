-- BAGDROP — Vendor Master + Automatic Vendor Notifications
-- (Founder spec, 2026-09-12: BAGDROP-VENDOR-AUTOMATION-001)
--
-- Adds a simple Vendor Master and wires it onto the EXISTING Trip Expenses
-- feature (trip_expenses, see TRIP_SHEET_MIGRATION.sql) so every vendor-
-- linked expense can automatically notify that vendor on its own
-- operational date. Deliberately does NOT touch Payment Verification /
-- Accounts Approval / Payment Receipt in any way — those are unrelated and
-- explicitly out of scope per the founder's spec.
--
-- ── Vendor ID numbering ──────────────────────────────────────────────
-- Every other numbered series in this app (BDA/BDL/BDQ/BDP/GBL/GBAG, see
-- lib/number-series.ts) embeds the calendar year (BDA-2026-0001) — but the
-- founder's spec explicitly wants a flat, non-yearly sequence (VND-00001,
-- VND-00002, ...), so this can't reuse next_series_number(). A dedicated
-- Postgres SEQUENCE + a DEFAULT expression on the column is the simplest
-- way to get an atomic, race-safe, ever-increasing number without a new
-- RPC function — Postgres serializes nextval() calls itself.
CREATE SEQUENCE IF NOT EXISTS vendor_id_seq START 1;

-- ── Vendor Master ─────────────────────────────────────────────────────
-- Deliberately ONLY the 8 fields the founder's spec asks for — no vendor
-- type, service area, rating, bank details, PAN, contracts, or pricing.
CREATE TABLE IF NOT EXISTS vendors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    TEXT UNIQUE NOT NULL DEFAULT ('VND-' || lpad(nextval('vendor_id_seq')::text, 5, '0')),
  vendor_name  TEXT NOT NULL,
  company_name TEXT,
  mobile       TEXT NOT NULL,
  email        TEXT,
  address      TEXT,
  city         TEXT,
  gst_number   TEXT,
  -- Soft-archive only, same convention as leads.deleted_at elsewhere —
  -- historical trip_expenses/vendor_notifications rows must keep working
  -- (they reference vendors.id, never vendor_name/mobile directly) even
  -- after a vendor is retired from active use.
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_vendor_id ON vendors(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendors_archived   ON vendors(archived_at);

DROP TRIGGER IF EXISTS set_vendors_updated_at ON vendors;
CREATE TRIGGER set_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_vendors" ON vendors FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Trip Expenses — vendor link + operational date ───────────────────
-- The existing `vendor` TEXT column (free text, e.g. "VINOD", "METRO
-- EXPRESS", "INHOUSE") is left completely untouched — it's still what
-- renders in the existing Trip Expenses table today, and nothing about its
-- existing Rate/Cost, Actual Cost, or P&L math changes. vendor_id is a NEW,
-- separate, optional link to the real Vendor Master row for the ONE thing
-- that actually needs a structured recipient: automatic notifications.
-- An expense with vendor_id left NULL (in-house, or not yet assigned) can
-- never trigger a vendor notification, by construction.
ALTER TABLE trip_expenses
  ADD COLUMN IF NOT EXISTS vendor_id           UUID REFERENCES vendors(id) ON DELETE SET NULL,
  -- The date THIS vendor needs to actually perform THIS operation — per
  -- founder spec, never assumed to be the booking's pickup_date for every
  -- expense (a Middle Mile or Airport Delivery vendor needs their own
  -- later date). Admin-editable; defaulted sensibly at creation time from
  -- the parent trip_sheet's pickup_date/delivery_date where a reasonable
  -- guess exists (see the expenses route), left blank otherwise.
  ADD COLUMN IF NOT EXISTS operational_date    DATE,
  -- Free text on purpose — same reasoning lib/ops-reminders.ts and lib/
  -- google-calendar.ts already documented for bookings.time_slot: there's
  -- no single structured "time" concept that fits every vendor operation
  -- cleanly (a pickup window vs. a flight-driven delivery cutoff), so this
  -- is admin-entered free text ("10:00 AM", "Before 2 PM"), optional.
  ADD COLUMN IF NOT EXISTS operational_time    TEXT,
  -- A free-text "Mode" column already exists (expense_type) and stays
  -- exactly as-is for display — but it's genuinely free text ("DELIVERY -
  -- DADAR STATION TO METRO ANDHERI EAST" is a real example), so it can't
  -- reliably drive which of the 5 vendor-message templates applies.
  -- operation_category is a small, separate, admin-editable classification
  -- for that ONE purpose — it never appears anywhere the existing expense
  -- table/PDF/P&L already renders expense_type.
  ADD COLUMN IF NOT EXISTS operation_category  TEXT DEFAULT 'other'
    CHECK (operation_category IN ('pickup','middle_mile','delivery','handling','airport_delivery','other')),
  -- Denormalized cache of "has Ops been told yet" for the Trip Expenses
  -- table's Notification column (spec §20) — the full history with per-
  -- channel detail always lives in vendor_notifications below; this is
  -- just the fast, single-glance summary so the expenses list doesn't need
  -- a join per row. Kept in sync by lib/vendor-notifications.ts, never
  -- written to directly from the UI.
  ADD COLUMN IF NOT EXISTS notification_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (notification_status IN ('not_applicable','pending','sent','partially_sent','failed'));

CREATE INDEX IF NOT EXISTS idx_trip_expenses_vendor_id ON trip_expenses(vendor_id);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_operational_date ON trip_expenses(operational_date);

-- ── Vendor Notification Log ───────────────────────────────────────────
-- One row per (trip_expense, channel) — same "exactly one row per thing,
-- ever, upserted on change" shape as booking_reminders (see
-- supabase/migrations/20260730_ops_pickup_reminders.sql), which is also
-- what makes duplicate-prevention (spec §22) straightforward: the UNIQUE
-- constraint plus an atomic "claim" UPDATE ... WHERE status='pending' is
-- the exact same pattern lib/ops-reminders.ts already uses safely.
--
-- Every identifying field the founder's spec asks for (§21) is snapshotted
-- onto the row at send time — booking/vendor/expense can all be edited or
-- even deleted later without corrupting what a past notification says it
-- told a vendor.
CREATE TABLE IF NOT EXISTS vendor_notifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_expense_id       UUID NOT NULL REFERENCES trip_expenses(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),

  -- Links (nullable — snapshots below are the source of truth if any of
  -- these are ever deleted)
  trip_sheet_id         UUID REFERENCES trip_sheets(id) ON DELETE SET NULL,
  booking_id            UUID REFERENCES bookings(id)    ON DELETE SET NULL,
  vendor_id             UUID REFERENCES vendors(id)     ON DELETE SET NULL,

  -- Snapshot fields (§21)
  tracking_id           TEXT,
  customer_name         TEXT,
  vendor_name           TEXT,
  expense_mode          TEXT,       -- trip_expenses.expense_type at send time
  operation_category    TEXT,
  operational_date      DATE,
  recipient_mobile      TEXT,
  recipient_email       TEXT,
  template              TEXT,       -- template name/category used

  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','cancelled')),
  failure_reason        TEXT,
  provider_message_id   TEXT,
  sent_at               TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (trip_expense_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_vendor_notifications_expense ON vendor_notifications(trip_expense_id);
CREATE INDEX IF NOT EXISTS idx_vendor_notifications_status_date ON vendor_notifications(status, operational_date);
CREATE INDEX IF NOT EXISTS idx_vendor_notifications_vendor  ON vendor_notifications(vendor_id);

DROP TRIGGER IF EXISTS set_vendor_notifications_updated_at ON vendor_notifications;
CREATE TRIGGER set_vendor_notifications_updated_at
  BEFORE UPDATE ON vendor_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE vendor_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_vendor_notifications" ON vendor_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Editable Vendor Communication Templates (email — spec §17) ────────
-- WhatsApp deliberately does NOT have an editable template here: Meta
-- requires a business-initiated WhatsApp message to a number that hasn't
-- messaged first to use a pre-approved template (same rule already
-- documented for payment-verification / ops reminders), so its wording is
-- fixed once approved — only the DATA plugged into it varies per category.
-- Email has no such platform restriction, so this is fully admin-editable,
-- with the exact same {{variables}} the WhatsApp send fills in.
CREATE TABLE IF NOT EXISTS vendor_notification_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category       TEXT UNIQUE NOT NULL
    CHECK (category IN ('pickup','middle_mile','delivery','handling','airport_delivery','other')),
  label          TEXT NOT NULL,
  email_subject  TEXT NOT NULL,
  email_body     TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_vendor_notification_templates_updated_at ON vendor_notification_templates;
CREATE TRIGGER set_vendor_notification_templates_updated_at
  BEFORE UPDATE ON vendor_notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE vendor_notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_vendor_notification_templates" ON vendor_notification_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed the 5 spec'd categories + a generic fallback ("other" — used when
-- an expense is vendor-linked but its operation_category hasn't been set
-- to one of the 5 specific kinds). Uses the exact wording from the
-- founder's spec examples. {{variable}} placeholders are resolved by
-- lib/vendor-notifications.ts.
INSERT INTO vendor_notification_templates (category, label, email_subject, email_body) VALUES
('pickup', 'Pickup',
 'Bagdrop Pickup Scheduled – {{tracking_id}} – {{customer_name}}',
 E'Hello {{vendor_name}},\n\nToday''s pickup for Bagdrop is scheduled.\n\nCustomer: {{customer_name}}\nBooking / Tracking ID: {{tracking_id}}\n\nPickup Date: {{operational_date}}\nPickup Time: {{operational_time}}\nNumber of Bags: {{bags}}\n\nPickup From:\n{{from}}\n\nPickup To:\n{{to}}\n\nPlease collect the {{bags}} bag(s) as scheduled.\n\nThank you,\nBagdrop Operations'),

('middle_mile', 'Middle Mile',
 'Bagdrop Middle-Mile Movement Scheduled – {{tracking_id}} – {{customer_name}}',
 E'Hello {{vendor_name}},\n\nToday''s Bagdrop middle-mile movement is scheduled.\n\nCustomer: {{customer_name}}\nBooking / Tracking ID: {{tracking_id}}\n\nNumber of Bags: {{bags}}\n\nFrom:\n{{from}}\n\nTo:\n{{to}}\n\nOperational Date:\n{{operational_date}}\n\nPlease arrange the movement as scheduled.\n\nThank you,\nBagdrop Operations'),

('delivery', 'Delivery',
 'Bagdrop Delivery Scheduled – {{tracking_id}} – {{customer_name}}',
 E'Hello {{vendor_name}},\n\nToday''s Bagdrop delivery is scheduled.\n\nCustomer: {{customer_name}}\nBooking / Tracking ID: {{tracking_id}}\n\nNumber of Bags: {{bags}}\n\nFrom:\n{{from}}\n\nTo:\n{{to}}\n\nDelivery Date: {{operational_date}}\nDelivery Time: {{operational_time}}\n\nPlease collect and deliver the {{bags}} bag(s) as scheduled.\n\nThank you,\nBagdrop Operations'),

('handling', 'Handling',
 'Bagdrop Handling Scheduled – {{tracking_id}} – {{customer_name}}',
 E'Hello {{vendor_name}},\n\nToday''s Bagdrop handling operation is scheduled.\n\nCustomer: {{customer_name}}\nBooking / Tracking ID: {{tracking_id}}\n\nNumber of Bags: {{bags}}\n\nFrom:\n{{from}}\n\nTo:\n{{to}}\n\nOperational Date: {{operational_date}}\n\nPlease be ready to handle the {{bags}} bag(s) as scheduled.\n\nThank you,\nBagdrop Operations'),

('airport_delivery', 'Airport Delivery',
 'Bagdrop Airport Delivery Scheduled – {{tracking_id}} – {{customer_name}}',
 E'Hello {{vendor_name}},\n\nToday''s Bagdrop airport delivery is scheduled.\n\nCustomer: {{customer_name}}\nBooking / Tracking ID: {{tracking_id}}\n\nNumber of Bags: {{bags}}\n\nPickup From:\n{{from}}\n\nDelivery To:\n{{to}}\n\nDelivery Date: {{operational_date}}\nDelivery Time: {{operational_time}}\n\nPlease collect and deliver the {{bags}} bag(s) as scheduled.\n\nThank you,\nBagdrop Operations'),

('other', 'General / Other',
 'Bagdrop Operation Scheduled – {{tracking_id}} – {{customer_name}}',
 E'Hello {{vendor_name}},\n\nToday''s Bagdrop {{expense_mode}} is scheduled.\n\nCustomer: {{customer_name}}\nBooking / Tracking ID: {{tracking_id}}\n\nNumber of Bags: {{bags}}\n\nFrom:\n{{from}}\n\nTo:\n{{to}}\n\nOperational Date: {{operational_date}}\n\nPlease arrange this as scheduled.\n\nThank you,\nBagdrop Operations')
ON CONFLICT (category) DO NOTHING;

-- ── Settings — configurable default notification time ─────────────────
-- Reuses the existing `settings` key/value table (same pattern as
-- ops_reminder_day_of_time etc.) rather than a new settings mechanism.
INSERT INTO settings (key, value) VALUES ('vendor_notification_time', '08:00')
ON CONFLICT (key) DO NOTHING;
