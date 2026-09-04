/**
 * Bagdrop Notification Service
 * Sends Email (Resend) and WhatsApp (Meta Cloud API) on booking status changes.
 */

import { formatCustomerName } from './constants'
// 2026-08-31 fix — see buildInternationalRecipient() below for the full
// root-cause writeup. parseStoredPhone() is the same helper the PhoneInput
// UI already uses to read a stored "+<dialCode><digits>" string back apart
// (lib/phone-format.ts) — zero React/browser dependency, safe to import
// into this server-side notification module.
import { parseStoredPhone } from './phone-format'

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'

interface NotificationData {
  customerTitle?: string | null
  customerName: string
  customerPhone: string
  customerEmail: string
  trackingId: string
  status: BookingStatus
  fromCity: string
  toCity: string
  isTest?: boolean | null
}

const STATUS_MESSAGES: Record<
  BookingStatus,
  {
    subject: string
    body: string
    whatsapp: string
  }
> = {
  pending: {
    subject: 'Bagdrop: Booking Received',
    body: `We've received your booking request. Our team will confirm it shortly.`,
    whatsapp: `Hi {name}! 🧳 Your Bagdrop booking has been received. Tracking ID: *{trackingId}*. We'll confirm it shortly.`,
  },
  confirmed: {
    subject: 'Bagdrop: Booking Confirmed ✓',
    body: `Great news! Your baggage delivery booking is confirmed.`,
    whatsapp: `Hi {name}! ✅ Your Bagdrop booking *{trackingId}* is CONFIRMED.`,
  },
  pickup_scheduled: {
    subject: 'Bagdrop: Pickup Scheduled',
    body: `Your baggage pickup has been scheduled.`,
    whatsapp: `Hi {name}! 📅 Pickup scheduled for *{trackingId}*.`,
  },
  picked_up: {
    subject: 'Bagdrop: Baggage Picked Up',
    body: `Your baggage has been picked up successfully.`,
    whatsapp: `Hi {name}! 🚀 Baggage picked up successfully. ID: *{trackingId}*`,
  },
  in_transit: {
    subject: 'Bagdrop: Baggage In Transit',
    body: `Your baggage is on its way from {fromCity} to {toCity}.`,
    whatsapp: `Hi {name}! 🚛 Your baggage is in transit from {fromCity} → {toCity}.`,
  },
  out_for_delivery: {
    subject: 'Bagdrop: Out for Delivery',
    body: `Your baggage is out for delivery.`,
    whatsapp: `Hi {name}! 📦 Your baggage is out for delivery.`,
  },
  delivered: {
    subject: 'Bagdrop: Baggage Delivered ✓',
    body: `Your baggage has been delivered successfully.`,
    whatsapp: `Hi {name}! 🎉 Delivered successfully!`,
  },
  completed: {
    subject: 'Bagdrop: Booking Completed',
    body: `Your booking is complete.`,
    whatsapp: `Hi {name}! ⭐ Booking completed.`,
  },
  cancelled: {
    subject: 'Bagdrop: Booking Cancelled',
    body: `Your booking has been cancelled.`,
    whatsapp: `Hi {name}. Booking cancelled.`,
  },
}

// FIX: Reusable type instead of invalid ReturnType<>
type StatusMessage = typeof STATUS_MESSAGES['pending']

function interpolate(template: string, data: NotificationData): string {
  return template
    .replace(/{name}/g, data.customerName)
    .replace(/{trackingId}/g, data.trackingId)
    .replace(/{fromCity}/g, data.fromCity)
    .replace(/{toCity}/g, data.toCity)
}

async function sendEmail(
  data: NotificationData,
  msg: StatusMessage
): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key || !data.customerEmail) return

  const body = interpolate(msg.body, data)
  const subject = interpolate(msg.subject, data)

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bagdrop <updates@bagdrop.co>',
        to: data.customerEmail,
        subject,
        html: `
          <div style="font-family:sans-serif;padding:20px">
            <h2>Bagdrop</h2>
            <p>Hi ${data.customerName},</p>
            <p>${body}</p>
            <p>Booking ID: <strong>${data.trackingId}</strong></p>
          </div>
        `,
      }),
    })
  } catch (err) {
    console.error('Email error:', err)
  }
}

// ── Generic WhatsApp sender ─────────────────────────────────────────
// Low-level building block reused by both the booking-status notifier
// below and the inquiry-acknowledgment flow (lib/lead-acknowledgment.ts).
// Returns a result object (rather than swallowing errors) so callers that
// need delivery status — e.g. for logging to communication_log — can see
// exactly what happened.
// ── Build the full international recipient number for outbound WhatsApp ──
// (Fast2SMS and Meta Graph API sends) — 2026-08-31 fix.
//
// Root cause of the "+1 US number sent to +91 instead" bug: both send
// functions below used to strip the stored phone down to bare digits and
// either take just the LAST 10 digits (sendWhatsAppTemplateFast2SMS — see
// old comment "Fast2SMS wants a bare 10-digit Indian mobile number") or
// prepend "91" unless the digit string already happened to start with "91"
// (sendWhatsAppText). Both approaches silently throw away whatever country
// code was actually stored (e.g. "+17037129479" → digits "17037129479" →
// last 10 = "7037129479", country code gone entirely) and hand Fast2SMS/
// Meta a number with NO country code — which both platforms then default
// to India for, since Bagdrop's account is Indian. This was a pure
// send-time bug: the correct "+17037129479" was already sitting in
// bookings.customer_phone the whole time (see PhoneInput +
// lib/phone-format.ts's toE164(), which builds it correctly on entry) —
// this function is what finally reads that stored value back out CORRECTLY
// instead of re-deriving a broken one.
//
// parseStoredPhone() (lib/phone-format.ts) already handles every shape
// currently in the database: a proper "+<dialCode><digits>" string parses
// via libphonenumber-js to the real {dialCode, nationalNumber}; a legacy
// bare 10-digit row (written before international numbers existed) is
// still correctly assumed Indian (dialCode '91') — so existing Indian
// customers keep receiving messages exactly as before. Returns digits only,
// country code + national number concatenated with NO leading "+" and NO
// separator — confirmed against Fast2SMS's own sibling endpoint
// (/dev/whatsapp-session's `to` param, documented example "919876543210")
// as the format both of Fast2SMS's WhatsApp APIs expect.
function buildInternationalRecipient(phone: string): string {
  const { dialCode, nationalNumber } = parseStoredPhone(phone)
  return `${dialCode}${nationalNumber}`
}

export async function sendWhatsAppText(
  phone: string,
  text: string
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneId) {
    return { success: false, error: 'WhatsApp not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing)' }
  }
  if (!phone) {
    return { success: false, error: 'No phone number provided' }
  }

  const e164 = buildInternationalRecipient(phone)

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: e164,
        type: 'text',
        text: { body: text },
      }),
    })

    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    if (!res.ok) {
      console.error('[WhatsApp] FAILED', '| status:', res.status, '| error:', JSON.stringify(data))
      return { success: false, error: JSON.stringify(data) }
    }

    const messageId = (data as { messages?: { id: string }[] }).messages?.[0]?.id
    console.log('[WhatsApp] SENT', '| to:', e164, '| id:', messageId)
    return { success: true, messageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[WhatsApp] EXCEPTION', msg)
    return { success: false, error: msg }
  }
}

async function sendWhatsApp(
  data: NotificationData,
  msg: StatusMessage
): Promise<void> {
  if (!data.customerPhone) return
  await sendWhatsAppText(data.customerPhone, interpolate(msg.whatsapp, data))
}

// ── Fast2SMS WhatsApp Template Sender ───────────────────────────────
// Fast2SMS is a Meta-approved WhatsApp Business Solution Provider — used
// instead of calling Meta's Graph API directly. Sends via a pre-approved
// message template, which WhatsApp requires for any business-initiated
// first message (a customer who hasn't messaged you first can't receive
// free-form text — only an approved template).
// Docs: https://docs.fast2sms.com
export async function sendWhatsAppTemplateFast2SMS(
  phone: string,
  messageId: string,
  variables: string[],
  mediaUrl?: string
): Promise<{ success: boolean; error?: string; requestId?: string }> {
  const apiKey        = process.env.FAST2SMS_API_KEY
  const phoneNumberId = process.env.FAST2SMS_WHATSAPP_PHONE_NUMBER_ID

  if (!apiKey || !phoneNumberId) {
    return { success: false, error: 'Fast2SMS not configured (FAST2SMS_API_KEY / FAST2SMS_WHATSAPP_PHONE_NUMBER_ID missing)' }
  }
  if (!phone) {
    return { success: false, error: 'No phone number provided' }
  }
  if (!messageId) {
    return { success: false, error: 'No Fast2SMS template message_id provided' }
  }

  // See buildInternationalRecipient()'s module comment above for the full
  // 2026-08-31 root-cause writeup — this used to blindly take the last 10
  // digits (silently discarding the country code entirely), which is what
  // sent a US customer's +1 number to +91 instead. Now sends the full
  // international number (country code + national number, no "+"),
  // matching the format Fast2SMS's own docs show for its WhatsApp APIs.
  const recipient = buildInternationalRecipient(phone)

  // Templates with an Image/PDF header (e.g. payment_request's QR code) do
  // NOT bake the approved-template sample image into every send — Fast2SMS
  // requires the header media to be supplied per-request via `media_url`,
  // or the header renders empty ("No Preview Available") on WhatsApp even
  // though the rest of the template body sends fine. Only added when the
  // caller passes one; harmless (and omitted) for plain text-header templates.
  // Fast2SMS's variables_values format is pipe-delimited ("val1|val2|...")
  // — it splits on "|" server-side to know how many {{}} slots were
  // supplied. Found via a real bug: the Confirmed & Ongoing Inquiry Summary
  // report's single {{1}} variable renders "Date: 20 Aug 2026 | Report:
  // 9:00 AM\n\nSUMMARY\n..." — the literal " | " inside that ONE variable's
  // own text was silently splitting it into two values for a template that
  // only declares one placeholder, so Fast2SMS kept just the first segment
  // ("Date: 20 Aug 2026") and dropped everything after it, including the
  // entire summary + booking list. Stripping "|" out of every variable's
  // text here (not just that one caller) protects every current and future
  // template from the same silent-truncation failure mode.
  //
  // Second real bug (2026-08-21), same Confirmed & Ongoing report: WhatsApp
  // rejects the whole send with error (#132018) "There's an issue with the
  // parameters in your template" whenever a template parameter's VALUE
  // contains a literal newline, carriage return, or tab character — this is
  // a hard Meta/WhatsApp Business API restriction on parameter text, not
  // something Fast2SMS can relax. It's unrelated to (and stricter than) the
  // per-character formatting allowed in the template body itself. This
  // report's {{1}} variable is a multi-line rendered block (one booking per
  // several \n-joined lines), so every send was failing outright — the
  // Fast2SMS dashboard's own delivery-details preview still renders the
  // literal text fine, which made this look like a delivery problem rather
  // than a rejected-at-submission one.
  // There is no way to send a real line break inside a single WhatsApp
  // template parameter — this is a documented platform limitation, not
  // something a character substitution can trick around. Fix: replace
  // \r\n/\n/\r with " • " (a plain separator, not a line break) so the
  // report still reads as distinct fields/entries rather than becoming one
  // unbroken run of words, and tabs / runs of 5+ spaces (also disallowed)
  // collapse to a single space / 4 spaces. Applied to every variable/every
  // caller, not just this one report, for the same "protect every current
  // and future template" reason as the pipe fix above. Net effect: the
  // Confirmed & Ongoing report now sends as one continuous line per message
  // instead of the intended multi-line layout — a real, visible trade-off,
  // not a full fix; flagged in case the founder would rather restructure
  // that report (e.g. one WhatsApp message per booking) to get real line
  // breaks back.
  const sanitizedVariables = variables.map(v =>
    v.replace(/\|/g, '·')
     .replace(/\r\n|\r|\n/g, ' • ')
     .replace(/\t/g, ' ')
     .replace(/ {5,}/g, '    ')
  )

  const params = new URLSearchParams({
    message_id:       messageId,
    phone_number_id:  phoneNumberId,
    numbers:          recipient,
    variables_values: sanitizedVariables.join('|'),
    ...(mediaUrl ? { media_url: mediaUrl } : {}),
  })

  // Cron-triggered sends (quote-pending, sales-followup, ops-pickup
  // reminders) call this in a sequential loop over potentially many due
  // rows in one request. Fast2SMS's endpoint has no documented SLA, and a
  // plain fetch() has no timeout of its own — a single slow/hanging
  // response would previously stall the entire cron run until the
  // platform's own function timeout killed it, which surfaced as
  // cron-job.org reporting "Failed (timeout)" with no useful error detail.
  // Capping each individual send at 10s means one bad Fast2SMS response
  // costs at most 10s, not the whole batch.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`https://www.fast2sms.com/dev/whatsapp?${params.toString()}`, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    if (!res.ok || data.status === false) {
      console.error('[Fast2SMS WhatsApp] FAILED', '| status:', res.status, '| error:', JSON.stringify(data))
      return { success: false, error: JSON.stringify(data) }
    }

    const requestId = data.request_id as string | undefined
    console.log('[Fast2SMS WhatsApp] SENT', '| to:', recipient, '| request_id:', requestId)
    return { success: true, requestId }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const msg = isAbort ? 'Timed out waiting for Fast2SMS (10s)' : (err instanceof Error ? err.message : String(err))
    console.error('[Fast2SMS WhatsApp] EXCEPTION', msg)
    return { success: false, error: msg }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Fast2SMS WhatsApp Template Sender v2 — Meta-format endpoint (2026-09-01) ──
// Migrated OFF the "Simple" GET /dev/whatsapp API above (that one is kept,
// unchanged, for internal/staff-only templates — see each caller) because
// that endpoint has no real international support: a bare 10-digit
// `numbers` value gets silently assumed Indian, and a properly
// country-coded non-Indian number is rejected outright — confirmed via a
// real send to a US customer (+15622091589) returning
// `{"errors":{"numbers":["Mobile Number format is invalid: 15622091589"]}}`.
// This function instead calls Fast2SMS's Meta Cloud API-compatible proxy
// (same URL/JSON shape as Meta's own Graph API), which Fast2SMS's own docs
// show accepting a full "Recipient Phone Number... with country code":
// https://docs.fast2sms.com/reference/sendtemplatewithvariable
//
// Used ONLY for customer-facing sends: lib/lead-acknowledgment.ts,
// lib/lifecycle-notifications.ts, lib/driver-details.ts,
// lib/indemnity-notifications.ts. Every internal/staff-facing template
// (new inquiry alert, sales follow-up / pickup / quote-pending reminders,
// payment verification, confirmed & ongoing summary) stays on the GET
// function above unchanged — those only ever reach Bagdrop's own Indian
// numbers, so there's nothing to fix there and no reason to touch them.
//
// Templates are addressed by NAME + language code here (Meta's real
// identifier), not Fast2SMS's numeric Message ID — that ID is a
// convenience Fast2SMS's own "Simple" wrapper invented and this endpoint
// has no concept of. Every name below was confirmed directly against the
// account's live approved templates via
// `GET /dev/dlt_manager/whatsapp?type=template` on 2026-09-01 — see each
// caller's own TEMPLATE_BY_* map for the exact status/event → name
// mapping, and confirm there against the same dump before changing one.
export async function sendWhatsAppTemplateFast2SMSv2(
  phone: string,
  templateName: string,
  variables: string[],
  header?: { type: 'image' | 'document'; url: string; filename?: string }
): Promise<{ success: boolean; error?: string; requestId?: string }> {
  const apiKey        = process.env.FAST2SMS_API_KEY
  const phoneNumberId = process.env.FAST2SMS_WHATSAPP_PHONE_NUMBER_ID

  if (!apiKey || !phoneNumberId) {
    return { success: false, error: 'Fast2SMS not configured (FAST2SMS_API_KEY / FAST2SMS_WHATSAPP_PHONE_NUMBER_ID missing)' }
  }
  if (!phone) {
    return { success: false, error: 'No phone number provided' }
  }
  if (!templateName) {
    return { success: false, error: 'No Fast2SMS template name provided' }
  }

  const recipient = buildInternationalRecipient(phone)

  // Same real Meta/WhatsApp platform restriction documented on the GET
  // sender above (error #132018) — a template parameter's VALUE can't
  // contain a literal newline/carriage-return/tab, regardless of which
  // endpoint carries it. The pipe-delimiter workaround is dropped here
  // (it was only needed because the GET endpoint packed every variable
  // into one "val1|val2|..." query string) — each variable is its own
  // separate JSON object below, so a literal "|" inside one variable's
  // text can never be misread as a value separator.
  const sanitizedVariables = variables.map(v =>
    v.replace(/\r\n|\r|\n/g, ' • ')
     .replace(/\t/g, ' ')
     .replace(/ {5,}/g, '    ')
  )

  const components: Array<Record<string, unknown>> = []
  if (header) {
    components.push({
      type: 'header',
      parameters: [{
        type: header.type,
        [header.type]: header.type === 'document'
          ? { link: header.url, ...(header.filename ? { filename: header.filename } : {}) }
          : { link: header.url },
      }],
    })
  }
  components.push({
    type: 'body',
    parameters: sanitizedVariables.map(text => ({ type: 'text', text })),
  })

  // Same per-send timeout rationale as the GET sender above.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`https://www.fast2sms.com/dev/whatsapp/v26.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components,
        },
      }),
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    const errObj = data.error as { message?: string } | undefined
    if (!res.ok || errObj) {
      console.error('[Fast2SMS WhatsApp v2] FAILED', '| status:', res.status, '| error:', JSON.stringify(data))
      return { success: false, error: errObj?.message ?? JSON.stringify(data) }
    }

    const messages = data.messages as Array<{ id?: string }> | undefined
    const requestId = messages?.[0]?.id
    console.log('[Fast2SMS WhatsApp v2] SENT', '| to:', recipient, '| template:', templateName, '| id:', requestId)
    return { success: true, requestId }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const msg = isAbort ? 'Timed out waiting for Fast2SMS (10s)' : (err instanceof Error ? err.message : String(err))
    console.error('[Fast2SMS WhatsApp v2] EXCEPTION', msg)
    return { success: false, error: msg }
  } finally {
    clearTimeout(timeout)
  }
}

// ── WhatsApp Template Sender — direct Meta Cloud API (2026-09-01) ──────────
// Root cause discovered while migrating off Fast2SMS: Fast2SMS's own support
// confirmed "we provide service in India only" — international WhatsApp
// sending is a hard restriction on THEIR product tier, not a limitation of
// Bagdrop's actual WhatsApp Business number. Confirmed directly: the phone
// profile ID shown in Bagdrop's own Meta Business Manager
// (business.facebook.com → WhatsApp accounts → Phone numbers →
// +91 63571 15711) is 995935626929789 — the EXACT SAME id as
// FAST2SMS_WHATSAPP_PHONE_NUMBER_ID. Fast2SMS has been a thin wrapper in
// front of this same WABA the whole time, not a separate number. So this
// function sends from that identical number, straight to Meta's own Graph
// API, bypassing Fast2SMS (and its India-only restriction) entirely.
//
// Requires a System User access token generated in Meta Business Manager
// (Business Settings → Users → System users) with whatsapp_business_
// messaging + whatsapp_business_management permissions, assigned to the
// Bagdrop Logistics Solutions Pvt Ltd WhatsApp account — set as
// WHATSAPP_ACCESS_TOKEN in Vercel. WHATSAPP_PHONE_NUMBER_ID is the id
// above (995935626929789) — same value already used for Fast2SMS, not a
// secret (visible in the Meta Business Manager UI), safe to hardcode as
// the default if the env var isn't set.
//
// Used only for INTERNATIONAL customer-facing sends — see
// sendWhatsAppTemplate() below, the shared dispatcher every caller should
// actually use. Indian numbers keep going through Fast2SMS (cheaper,
// already working) via sendWhatsAppTemplateFast2SMSv2 above.
export async function sendWhatsAppTemplateMeta(
  phone: string,
  templateName: string,
  variables: string[],
  header?: { type: 'image' | 'document'; url: string; filename?: string }
): Promise<{ success: boolean; error?: string; requestId?: string }> {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '995935626929789'

  if (!token) {
    return { success: false, error: 'WhatsApp not configured (WHATSAPP_ACCESS_TOKEN missing — see System User token setup in Meta Business Manager)' }
  }
  if (!phone) {
    return { success: false, error: 'No phone number provided' }
  }
  if (!templateName) {
    return { success: false, error: 'No WhatsApp template name provided' }
  }

  const recipient = buildInternationalRecipient(phone)

  // Same platform restriction as every other WhatsApp sender in this file
  // (Meta error #132018) — a template parameter value can't contain a
  // literal newline/carriage-return/tab.
  const sanitizedVariables = variables.map(v =>
    v.replace(/\r\n|\r|\n/g, ' • ')
     .replace(/\t/g, ' ')
     .replace(/ {5,}/g, '    ')
  )

  const components: Array<Record<string, unknown>> = []
  if (header) {
    components.push({
      type: 'header',
      parameters: [{
        type: header.type,
        [header.type]: header.type === 'document'
          ? { link: header.url, ...(header.filename ? { filename: header.filename } : {}) }
          : { link: header.url },
      }],
    })
  }
  components.push({
    type: 'body',
    parameters: sanitizedVariables.map(text => ({ type: 'text', text })),
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components,
        },
      }),
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    const errObj = data.error as { message?: string } | undefined
    if (!res.ok || errObj) {
      console.error('[Meta WhatsApp] FAILED', '| status:', res.status, '| error:', JSON.stringify(data))
      return { success: false, error: errObj?.message ?? JSON.stringify(data) }
    }

    const messages = data.messages as Array<{ id?: string }> | undefined
    const requestId = messages?.[0]?.id
    console.log('[Meta WhatsApp] SENT', '| to:', recipient, '| template:', templateName, '| id:', requestId)
    return { success: true, requestId }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const msg = isAbort ? 'Timed out waiting for Meta (10s)' : (err instanceof Error ? err.message : String(err))
    console.error('[Meta WhatsApp] EXCEPTION', msg)
    return { success: false, error: msg }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Shared dispatcher — every customer-facing WhatsApp template send should
// call THIS, not either sender directly ─────────────────────────────────
// Routes by the recipient's actual stored country code (via
// parseStoredPhone, the same helper buildInternationalRecipient() uses):
// Indian numbers → Fast2SMS (sendWhatsAppTemplateFast2SMSv2 — cheaper,
// already working, unaffected by any of this). Every other country →
// direct Meta Cloud API (sendWhatsAppTemplateMeta — bypasses Fast2SMS's
// India-only restriction entirely, same underlying WABA/number). This
// single choke point means every caller (lead-acknowledgment.ts,
// lifecycle-notifications.ts, driver-details.ts, indemnity-notifications.ts,
// the manual Resend Acknowledgment route) gets the right routing for free
// and never has to know which provider is behind it.
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  variables: string[],
  header?: { type: 'image' | 'document'; url: string; filename?: string }
): Promise<{ success: boolean; error?: string; requestId?: string; provider?: 'fast2sms' | 'meta' }> {
  const { dialCode } = parseStoredPhone(phone)
  if (dialCode === '91') {
    const result = await sendWhatsAppTemplateFast2SMSv2(phone, templateName, variables, header)
    return { ...result, provider: 'fast2sms' }
  }
  const result = await sendWhatsAppTemplateMeta(phone, templateName, variables, header)
  return { ...result, provider: 'meta' }
}

export async function notifyBookingStatus(
  data: NotificationData
): Promise<void> {
  // Test Mode bookings must never trigger a real customer-facing send —
  // see the matching guard in lib/lifecycle-notifications.ts for the full
  // rationale. This is the older/simpler notifier (STATUS_MESSAGES-based,
  // still used by app/api/admin/bookings/[id]/route.ts's generic status
  // block) — same rule applies here.
  if (data.isTest) {
    console.log(`[Notify] Booking ${data.trackingId} — skipped (${data.status}): Test Mode`)
    return
  }

  const msg = STATUS_MESSAGES[data.status]
  if (!msg) return

  // Format once here so every channel (email + WhatsApp) below shows
  // "Mr./Mrs./Ms. Name" without each template needing its own logic.
  const formatted: NotificationData = {
    ...data,
    customerName: formatCustomerName(data.customerTitle, data.customerName) || data.customerName,
  }

  await Promise.allSettled([
    sendEmail(formatted, msg),
    sendWhatsApp(formatted, msg),
  ])
}