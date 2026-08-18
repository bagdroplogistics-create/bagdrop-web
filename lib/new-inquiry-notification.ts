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
// Approved template (Category: Utility, Language: en) variable order —
// CORRECTED 2026-08-17 after a real send (BDL-2026-0104) came back Failed
// in Fast2SMS's Delivery Report. The template's live body actually has 10
// variables, not 7 — the delivery report's message preview showed literal
// "*" placeholders for Delivery Date/Bags/Source because this file was
// only sending the first 7, and WhatsApp rejects the send outright when an
// approved template's declared variables aren't all filled (not a partial
// send with blanks — the whole message fails, matching what happened):
//   {{1}} Inquiry ID    {{2}} Customer   {{3}} Mobile      {{4}} Email
//   {{5}} Pickup        {{6}} Delivery   {{7}} Pickup Date {{8}} Delivery Date
//   {{9}} Bags          {{10}} Source

import { supabaseAdmin } from './supabase'
import { formatCustomerName } from './constants'
import { SOURCE_LABELS, type InquiryEmailData } from './email'
import { parseWhatsAppRecipients, sendToAllRecipients } from './internal-whatsapp-recipients'

// +916357115711 is the customer-facing booking-inquiry number and is
// registered as the WABA sender for this template — WhatsApp Business API
// categorically refuses to let a number message itself (confirmed via a
// real Failed delivery report, reason "You can not send message to your
// own number"), so ops notifications must never go there. Per founder
// request (2026-08-18), this now fans out to BOTH internal numbers —
// +916357335733 and +919130063884 — see lib/internal-whatsapp-recipients.ts.
//
// Configurable via Admin Settings → settings table (key
// 'new_inquiry_whatsapp', comma-separated for multiple numbers), same
// pattern as ops_reminder_whatsapp / sales_followup_whatsapp.
async function getNewInquiryWhatsAppNumbers(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'new_inquiry_whatsapp')
    .maybeSingle()
  return parseWhatsAppRecipients(data?.value)
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

    const opsNumbers  = await getNewInquiryWhatsAppNumbers()
    const displayName = formatCustomerName(data.customerTitle, data.customerName) || data.customerName

    const variables = [
      data.inquiryNumber,                                              // {{1}} Inquiry ID
      displayName,                                                     // {{2}} Customer
      data.customerPhone || '—',                                       // {{3}} Mobile
      data.customerEmail || '—',                                       // {{4}} Email
      data.pickupAddress || '—',                                       // {{5}} Pickup
      data.deliveryAddress || '—',                                     // {{6}} Delivery
      fmtDate(data.pickupDate),                                        // {{7}} Pickup Date
      fmtDate(data.deliveryDate),                                      // {{8}} Delivery Date
      data.bagsCount != null ? String(data.bagsCount) : '—',           // {{9}} Bags
      SOURCE_LABELS[data.source?.toLowerCase() ?? ''] ?? data.source ?? '—', // {{10}} Source
    ]

    const result = await sendToAllRecipients(opsNumbers, templateId, variables)
    console.log(`[NewInquiryWhatsApp] ${data.inquiryNumber} — ${result.summary}`)
    // Detail always carries the per-recipient breakdown when anything failed
    // — even on a partial success — so a silently-broken second number
    // doesn't hide behind an overall "sent" status.
    await recordStatus(data.inquiryNumber, result.anySuccess ? 'sent' : 'failed', result.failCount > 0 ? result.summary : null)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[NewInquiryWhatsApp] Unexpected error (non-fatal):', err)
    await recordStatus(data.inquiryNumber, 'failed', msg)
  }
}
