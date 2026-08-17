-- BAGDROP — persistent status for the internal "new inquiry" WhatsApp ping
-- (lib/new-inquiry-notification.ts). Previously the only record of whether
-- this actually sent was a console.log line in Vercel's function logs —
-- invisible to anyone without direct Vercel access, and impossible to query
-- ("which of today's inquiries failed to notify ops?"). This makes that
-- inspectable from the database itself.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ops_whatsapp_status  text,        -- 'sent' | 'failed' | 'skipped'
  ADD COLUMN IF NOT EXISTS ops_whatsapp_error    text,        -- failure/skip reason, null when sent
  ADD COLUMN IF NOT EXISTS ops_whatsapp_sent_at  timestamptz; -- when the attempt was made
