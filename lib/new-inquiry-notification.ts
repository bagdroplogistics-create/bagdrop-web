// BAGDROP — lib/new-inquiry-notification.ts
//
// Fires the Meta-approved "new_inquiry_notification" WhatsApp template to
// the ops/admin WhatsApp number whenever a new inquiry/lead is created —
// an internal notification (mirrors sendInquiryNotification in lib/email.ts,
// which does the same thing via email to info@/aditya@) rather than a
// customer-facing message. See lib/lead-acknowledgment.ts for the
// customer-facing WhatsApp send.
//
// Additive/never-throws, same convention as lib/indemnity-notifications.ts:
// no-ops silently (just logs) until FAST2SMS_NEW_INQUIRY_MESSAGE_ID is set,
// so nothing breaks before the template is approved/configured.
//
// Approved template (Category: Utility, Language: en) variable order:
//   {{1}} Inquiry ID   {{2}} Customer   {{3}} Mobile   {{4}} Email
//   {{5}} Pickup       {{6}} Delivery   {{7}} Pickup Date

import { supabaseAdmin } from './supabase'
import { sendWhatsAppTemplateFast2SMS } from './notifications'
import { formatCustomerName } from './constants'
import type { InquiryEmailData } from './email'

const DEFAULT_OPS_WHATSAPP = '+916357115711'

// Configurable via Admin Settings → settings table (key
// 'new_inquiry_whatsapp'), same pattern as ops_reminder_whatsapp /
// sales_followup_whatsapp — falls back to the standard ops number.
async function getNewInquiryWhatsAppNumber(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'new_inquiry_whatsapp')
    .maybeSingle()
  return data?.value || DEFAULT_OPS_WHATSAPP
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d.includes('T') ? d : d + 'T00:00:00')
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return d }
}

// Best-effort, non-fatal status write-back — see supabase/migrations/
// 20260817b_whatsapp_notification_status.sql. Matched by lead_number
// (== data.inquiryNumber) since every call site already has that value on
// hand without needing to plumb the lead's uuid through as well. If this
// update itself fails (e.g. migration not yet run), it only logs — it must
// never make the notification attempt itself look like it failed.
async function recordStatus(inquiryNumber: string, status: 'sent' | 'failed' | 'skipped', error: string | null) {
  try {
    await supabaseAdmin
      .from('leads')
      .update({ ops_whatsapp_status: status, ops_whatsapp_error: error, ops_whatsapp_sent_at: new Date().toISOString() })
      .eq('lead_number', inquiryNumber)
  } catch (err) {
    console.error('[NewInquiryWhatsApp] status write-back failed (non-fatal):', err)
  }
}

/**
 * Sends the new-inquiry WhatsApp ping to ops. Accepts the exact same data
 * shape already built for sendInquiryNotification at every call site, so
 * callers can pass the identical object to both without restating fields.
 *
 * Never marks the attempt 'sent' unless Fast2SMS's own response indicated
 * success (see sendWhatsAppTemplateFast2SMS's `!res.ok` / HTTP-level check
 * — Fast2SMS returns a genuine 400/401 on failure, not a 200 with a hidden
 * failure flag, so that check is reliable). Every outcome — sent, failed,
 * or skipped because the template isn't configured — is written to
 * leads.ops_whatsapp_status so it's queryable later, not just visible in
 * whichever Vercel deployment's logs happened to catch it.
 */
export async function sendNewInquiryWhatsApp(data: InquiryEmailData): Promise<void> {
  try {
    const templateId = process.env.FAST2SMS_NEW_INQUIRY_MESSAGE_ID
    if (!templateId) {
      console.log(`[NewInquiryWhatsApp] ${data.inquiryNumber} — skipped: template not configured (FAST2SMS_NEW_INQUIRY_MESSAGE_ID)`)
      await recordStatus(data.inquiryNumber, 'skipped', 'FAST2SMS_NEW_INQUIRY_MESSAGE_ID not set')
      return
    }

    const opsNumber   = await getNewInquiryWhatsAppNumber()
    const displayName = formatCustomerName(data.customerTitle, data.customerName) || data.customerName

    const variables = [
      data.inquiryNumber,
      displayName,
      data.customerPhone || '—',
      data.customerEmail || '—',
      data.pickupAddress || '—',
      data.deliveryAddress || '—',
      fmtDate(data.pickupDate),
    ]

    const result = await sendWhatsAppTemplateFast2SMS(opsNumber, templateId, variables)
    console.log(`[NewInquiryWhatsApp] ${data.inquiryNumber} — ` +
      (result.success ? `sent — request_id ${result.requestId ?? '—'}` : `failed — ${result.error}`))
    await recordStatus(data.inquiryNumber, result.success ? 'sent' : 'failed', result.success ? null : (result.error ?? 'unknown error'))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[NewInquiryWhatsApp] Unexpected error (non-fatal):', err)
    await recordStatus(data.inquiryNumber, 'failed', msg)
  }
}
