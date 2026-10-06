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

// Optional CTA (Call-To-Action) URL button component for WhatsApp templates
// (e.g. lib/payment-verification-notification.ts's "Approve from WhatsApp"
// button). WhatsApp URL buttons are approved with a STATIC base URL plus one
// dynamic trailing segment — `payload` is just that dynamic segment (e.g. the
// bare token), never the full URL. Meta's API takes it as
// `{ type: 'payload', payload: '...' }`, NOT `{ type: 'text' }` like body params.
export interface WhatsAppCtaButton {
  index:   number
  payload: string
}

// ── WhatsApp Template Sender — direct Meta Cloud API ─────────────────────────
// The ONLY WhatsApp sender in Bagdrop (Founder decision 2026-10-06: Meta
// only — no Fast2SMS/BSP for WhatsApp). Sends from Bagdrop's own WhatsApp
// Business number straight through Meta's Graph API using a System User
// access token (WHATSAPP_ACCESS_TOKEN, permissions whatsapp_business_
// messaging + whatsapp_business_management) against the phone-number id
// WHATSAPP_PHONE_NUMBER_ID (default 995935626929789 — the id shown in Meta
// Business Manager → WhatsApp accounts → Phone numbers → +91 63571 15711;
// not a secret). Templates are addressed by their Meta-approved NAME.
// Works for Indian and international numbers alike.
//
// Call sendWhatsAppTemplate() below (the shared dispatcher) rather than this
// directly, so every send goes through one choke point.
export async function sendWhatsAppTemplateMeta(
  phone: string,
  templateName: string,
  variables: string[],
  header?: { type: 'image' | 'document'; url: string; filename?: string },
  // CTA URL button support (payment-verification-notification.ts's
  // "Approve Payment" button).
  buttons?: WhatsAppCtaButton[]
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
  if (buttons) {
    for (const b of buttons) {
      components.push({
        type:       'button',
        sub_type:   'url',
        index:      String(b.index),
        parameters: [{ type: 'payload', payload: b.payload }],
      })
    }
  }

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

// ── Shared dispatcher — every WhatsApp template send goes through THIS ──────
// Meta Cloud API only (Founder decision 2026-10-06). Fast2SMS is no longer
// used for WhatsApp anywhere — it remains only for plain-SMS OTP
// (app/api/auth/send-otp, lib/indemnity-otp.ts). Callers: lead-acknowledgment,
// lifecycle-notifications (every booking-workflow step), driver-details,
// indemnity-notifications, vendor-notifications, internal-whatsapp-recipients
// (ops/sales/summary fan-outs) and payment-verification-notification.
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  variables: string[],
  header?: { type: 'image' | 'document'; url: string; filename?: string },
  buttons?: WhatsAppCtaButton[]
): Promise<{ success: boolean; error?: string; requestId?: string; provider: 'meta' }> {
  const result = await sendWhatsAppTemplateMeta(phone, templateName, variables, header, buttons)
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