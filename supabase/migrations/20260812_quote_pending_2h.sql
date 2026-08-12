-- ================================================================
-- Bagdrop — Quote Pending Reminder: switch to 2 hours
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- Founder request: if a new inquiry hasn't been quoted within 2 hours of
-- creation, ping the internal Ops WhatsApp number using the now-approved
-- `quote_pending_reminder` Fast2SMS template.
--
-- IMPORTANT — this does NOT add any new code path. The "quote not yet
-- quoted" reminder already exists in full (lib/sales-followup-reminders.ts,
-- built in supabase/migrations/20260805_sales_followup_reminders.sql):
--   - Timer starts at leads.created_at.
--   - Every cron tick (app/api/cron/send-lead-followups, polled externally
--     every 10-15 min) checks every open lead against the threshold below.
--   - "Quotation sent" = leads.quote_number IS NOT NULL — if it's still
--     null once the threshold has passed, the reminder is scheduled.
--   - Sent ONLY to the internal WhatsApp number (settings.sales_followup_
--     whatsapp) — never to the customer.
--   - Duplicate-proof: lead_followups has UNIQUE(lead_id, reminder_type,
--     channel), so a given lead can only ever get this reminder once,
--     regardless of how many cron ticks run — lead_id (1:1 with the
--     lead's Inquiry ID / lead_number) is the source of truth.
-- This migration only changes the THRESHOLD that logic runs on — from the
-- previous default of 24 hours down to 2 — via the existing
-- sales_followup_quote_reminder_hours setting. No inquiry, quotation,
-- email notification, or booking workflow code is touched.
--
-- After running this, set FAST2SMS_QUOTE_PENDING_MESSAGE_ID in your
-- Vercel env vars to the message_id of your approved `quote_pending_
-- reminder` template (WhatsApp Manager -> Templates tab -> message_id —
-- NOT the long numeric Template ID shown on the approval/detail screen).
-- ================================================================

-- Quote-pending threshold: 24h -> 2h.
UPDATE settings SET value = '2' WHERE key = 'sales_followup_quote_reminder_hours';
INSERT INTO settings (key, value)
SELECT 'sales_followup_quote_reminder_hours', '2'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'sales_followup_quote_reminder_hours');

-- Internal recipient — explicit/idempotent, matches the founder's number
-- (already the coded default, this just makes sure the settings row
-- itself agrees rather than relying on the in-code fallback).
UPDATE settings SET value = '+916357115711' WHERE key = 'sales_followup_whatsapp';
INSERT INTO settings (key, value)
SELECT 'sales_followup_whatsapp', '+916357115711'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'sales_followup_whatsapp');

-- Make sure the system + WhatsApp channel are actually on (documented
-- defaults — this is a no-op if already true, just removes any doubt).
UPDATE settings SET value = 'true' WHERE key = 'sales_followup_enabled';
INSERT INTO settings (key, value)
SELECT 'sales_followup_enabled', 'true'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'sales_followup_enabled');

UPDATE settings SET value = 'true' WHERE key = 'sales_followup_whatsapp_enabled';
INSERT INTO settings (key, value)
SELECT 'sales_followup_whatsapp_enabled', 'true'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'sales_followup_whatsapp_enabled');

-- Explicitly leave sales_followup_email_enabled and
-- sales_followup_escalation_enabled untouched (default 'false' /
-- unset = customer never emailed, no 48h/72h escalation) — the founder
-- only asked for the single 2-hour WhatsApp nudge.
