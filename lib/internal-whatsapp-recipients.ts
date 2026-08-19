// BAGDROP — lib/internal-whatsapp-recipients.ts
//
// Shared helpers for the internal (never customer-facing) WhatsApp
// notifications: new-inquiry alerts, quote-pending / sales-followup
// reminders, and ops pickup reminders (lib/new-inquiry-notification.ts,
// lib/sales-followup-reminders.ts, lib/ops-reminders.ts respectively).
//
// Per founder request (2026-08-18, extended 2026-08-19), every one of
// these now fans out to all THREE internal numbers: +916357335733,
// +919130063884, and +919998665328. +916357115711 (the customer-facing
// booking-inquiry number) must never appear here: it's the registered
// WABA sender for these templates, and WhatsApp Business API refuses to
// let a number message itself ("You can not send message to your own
// number", confirmed via real Fast2SMS delivery reports).
//
// Configurable via the `settings` table (keys: new_inquiry_whatsapp,
// sales_followup_whatsapp, ops_reminder_whatsapp) as a comma-separated
// list, e.g. "+916357335733,+919130063884,+919998665328" — falls back to
// DEFAULT_INTERNAL_WHATSAPP_NUMBERS when the setting is unset/empty.

import { sendWhatsAppTemplateFast2SMS } from './notifications'

export const DEFAULT_INTERNAL_WHATSAPP_NUMBERS = ['+916357335733', '+919130063884', '+919998665328']

/** Parses a `settings.value` string into a recipient list, falling back to the default pair when unset/blank. */
export function parseWhatsAppRecipients(settingValue: string | null | undefined): string[] {
  const parsed = (settingValue ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return parsed.length > 0 ? parsed : DEFAULT_INTERNAL_WHATSAPP_NUMBERS
}

export interface RecipientSendResult {
  phone: string
  success: boolean
  error?: string
  requestId?: string
}

export interface FanOutResult {
  successCount: number
  failCount: number
  perRecipient: RecipientSendResult[]
  /** true if at least one recipient received it — used as the row's overall sent/failed status. */
  anySuccess: boolean
  /** Human-readable one-line summary for logs/communication_log/detail columns. */
  summary: string
}

/**
 * Sends the same approved WhatsApp template to every recipient in the
 * list, sequentially (matches the existing single-recipient sequential-
 * loop convention already used for cron-triggered batches — see the
 * timeout comment in lib/notifications.ts's sendWhatsAppTemplateFast2SMS),
 * and aggregates the per-recipient outcomes into one result. Never throws
 * — each individual send is already non-throwing (sendWhatsAppTemplateFast2SMS
 * returns a { success, error } shape rather than rejecting).
 *
 * Overall status is "sent" the moment AT LEAST ONE recipient succeeds —
 * these DB rows exist to gate idempotency/retries for the notification
 * *event*, not to track each individual recipient (that detail is still
 * fully preserved in `perRecipient`/`summary` for anyone reading the log),
 * so one recipient's account-level hiccup shouldn't make the system treat
 * an otherwise-delivered notification as failed and re-escalate it.
 */
export async function sendToAllRecipients(
  recipients: string[],
  templateId: string,
  variables: string[],
  mediaUrl?: string
): Promise<FanOutResult> {
  const perRecipient: RecipientSendResult[] = []
  for (const phone of recipients) {
    const result = await sendWhatsAppTemplateFast2SMS(phone, templateId, variables, mediaUrl)
    perRecipient.push({ phone, success: result.success, error: result.error, requestId: result.requestId })
  }
  const successCount = perRecipient.filter(r => r.success).length
  const failCount = perRecipient.length - successCount
  const summary = perRecipient
    .map(r => r.success ? `${r.phone}: sent` : `${r.phone}: failed — ${r.error ?? 'unknown error'}`)
    .join('; ')
  return { successCount, failCount, perRecipient, anySuccess: successCount > 0, summary }
}
