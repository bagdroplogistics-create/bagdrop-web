-- BAGDROP — Real timestamp for "when the quote was sent"
--
-- Founder report (2026-09-09): quote QT-2026-0167 was created at 3:24pm and
-- the client-facing "quote follow-up" WhatsApp message (meant to fire 2
-- hours later) went out at 3:31pm — 7 minutes after, not 2 hours.
--
-- Root cause: leads.quote_date is a DATE column (no time-of-day at all —
-- see supabase/migrations/20260704_leads_internal_quote.sql). Every quote-
-- scheduling threshold in lib/sales-followup-reminders.ts (both the
-- internal-staff "customer hasn't responded" reminders — response_24h/48h/
-- 72h — AND the client-facing client_quote_followup_2h) computes "N hours
-- since the quote was sent" from this same quote_date column. JavaScript
-- parses a bare date string like "2026-09-09" as midnight UTC (5:30am
-- IST) — so for ANY quote created after 5:30am IST (i.e. basically every
-- quote, ever), the "2 hours since quote_date" condition is ALREADY true
-- the very first time a cron tick checks it, regardless of what time the
-- quote was actually created. The follow-up doesn't fire "7 minutes after
-- creation" on purpose — it fires on the very next cron tick, whenever
-- that happens to land, because the code thinks the quote already went out
-- hours ago (at midnight). This affects every tier on both tracks, not
-- just this one quote — it's a systemic bug, just easiest to notice on
-- the 2-hour customer-facing track.
--
-- Fix: a real TIMESTAMPTZ column, stamped with the actual creation instant
-- at quote-generation time (see app/api/admin/zoho/generate-quote/route.ts
-- and lib/sales-followup-reminders.ts). quote_date itself is left
-- untouched — it's still used for the customer-facing "Quote Date" display
-- on the PDF/UI, where a plain calendar date is exactly what's wanted.
--
-- Backward compatible: NULL for every lead that already has a quote_number
-- (created before this migration) — lib/sales-followup-reminders.ts falls
-- back to the old (buggy but non-crashing) quote_date-based timing for
-- those, so nothing here needs a backfill. Only quotes created/regenerated
-- AFTER this ships get accurate 2h/24h/48h/72h timing.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'quote_sent_at';
