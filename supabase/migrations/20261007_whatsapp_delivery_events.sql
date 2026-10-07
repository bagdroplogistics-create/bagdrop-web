-- WhatsApp delivery status events (Meta Cloud API webhook)
--
-- The Cloud API answers a send request with "accepted" + a message id (wamid)
-- almost immediately — that is what the Communication Log calls "Sent". Whether
-- the message is actually DELIVERED (or fails later: billing/payment problem,
-- display name under review, recipient unreachable, etc.) is reported
-- asynchronously through the webhook handled by app/api/whatsapp/webhook.
-- Founder report 2026-10-07: Communication Log said Sent, customer received
-- nothing. This table keeps every status callback so the real reason is visible.

CREATE TABLE IF NOT EXISTS whatsapp_delivery_events (
  id            BIGSERIAL PRIMARY KEY,
  wamid         TEXT,
  recipient     TEXT,
  status        TEXT NOT NULL,          -- sent | delivered | read | failed
  error_code    INTEGER,
  error_title   TEXT,
  error_detail  TEXT,
  event_time    TIMESTAMPTZ,
  raw           JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_delivery_events_wamid_idx
  ON whatsapp_delivery_events (wamid);
CREATE INDEX IF NOT EXISTS whatsapp_delivery_events_created_idx
  ON whatsapp_delivery_events (created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_delivery_events_failed_idx
  ON whatsapp_delivery_events (created_at DESC) WHERE status = 'failed';
