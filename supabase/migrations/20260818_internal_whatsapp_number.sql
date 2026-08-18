-- BAGDROP — route all internal (non-customer-facing) WhatsApp
-- notifications to BOTH internal numbers: +91 63573 35733 and
-- +91 91300 63884.
--
-- Background: +916357115711 is the customer-facing booking-inquiry number
-- and the registered WABA sender for these templates — WhatsApp Business
-- API refuses to let a number message itself ("You can not send message
-- to your own number", confirmed via real Fast2SMS delivery reports on
-- both the "New Inquiry" and "Quote Pending Reminder" templates). The
-- code in lib/new-inquiry-notification.ts, lib/sales-followup-
-- reminders.ts, and lib/ops-reminders.ts now sends to every number listed
-- in these `settings` rows (comma-separated) via lib/internal-whatsapp-
-- recipients.ts. These `settings` rows — when present — take priority
-- over the code-level default, so they need to explicitly list both
-- numbers too, not just one.
--
-- Run in Supabase SQL Editor. Safe to re-run (idempotent upsert).

INSERT INTO settings (key, value, updated_at) VALUES
  ('new_inquiry_whatsapp',    '+916357335733,+919130063884', now()),
  ('sales_followup_whatsapp', '+916357335733,+919130063884', now()),  -- also covers "Quote Pending Reminder" (same setting, both reminder tracks)
  ('ops_reminder_whatsapp',   '+916357335733,+919130063884', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
