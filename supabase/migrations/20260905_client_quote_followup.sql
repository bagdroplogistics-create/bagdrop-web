-- BAGDROP — Client-facing Quote Follow-up (2h), separate from the existing
-- internal-staff Sales Follow-up system (lib/sales-followup-reminders.ts).
--
-- Founder request (2026-09-05): a new Fast2SMS WhatsApp template
-- ('quote_follow_up_2_hours', message_id 31553 at the time of writing —
-- NOT the longer "Template ID" 1396006806043870 shown on the same
-- Fast2SMS screen, which is a different field the send API doesn't use —
-- still PENDING approval in the Fast2SMS dashboard as of this migration)
-- sends DIRECTLY TO THE CUSTOMER 2 hours after a quote is sent,
-- if they haven't responded yet. This is intentionally a separate track
-- from the existing 'response_*' tiers, which only ever notify internal
-- staff (settings.sales_followup_whatsapp) — never the customer. Adding
-- this as its own reminder_type keeps the existing, already-working
-- internal reminder system completely untouched.
--
-- Same dedup/idempotency mechanism as every other tier here — the
-- UNIQUE(lead_id, reminder_type, channel) constraint on lead_followups is
-- simply widened to also allow this new value.

ALTER TABLE lead_followups DROP CONSTRAINT IF EXISTS lead_followups_reminder_type_check;
ALTER TABLE lead_followups
  ADD CONSTRAINT lead_followups_reminder_type_check
  CHECK (reminder_type IN (
    'quote_pending_24h', 'quote_pending_48h', 'quote_pending_72h',
    'response_24h',      'response_48h',      'response_72h',
    'client_quote_followup_2h'
  ));

-- Defaults to DISABLED — the Fast2SMS template is still pending approval
-- at the time of writing. Flip 'client_quote_followup_enabled' to 'true'
-- (Settings, or directly in Supabase) once Fast2SMS approves the template
-- AND FAST2SMS_CLIENT_QUOTE_FOLLOWUP_MESSAGE_ID is set in the deployment
-- environment — sending is a no-op (logged as a failed send) without it.
INSERT INTO settings (key, value) VALUES
  ('client_quote_followup_enabled', 'false')
 ,('client_quote_followup_hours',   '2')
ON CONFLICT (key) DO NOTHING;

-- Verify
SELECT conname FROM pg_constraint WHERE conname = 'lead_followups_reminder_type_check';
