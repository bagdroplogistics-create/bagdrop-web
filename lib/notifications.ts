/**
 * Bagdrop Notification Service
 * Sends Email (Resend) and WhatsApp (Meta Cloud API) on booking status changes.
 */

import { formatCustomerName } from './constants'

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

  const digits = phone.replace(/\D/g, '')
  const e164 = digits.startsWith('91') ? digits : '91' + digits

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

  // Fast2SMS wants a bare 10-digit Indian mobile number (no country code).
  const digits   = phone.replace(/\D/g, '')
  const tenDigit = digits.slice(-10)

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
    numbers:          tenDigit,
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
    console.log('[Fast2SMS WhatsApp] SENT', '| to:', tenDigit, '| request_id:', requestId)
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

export async function notifyBookingStatus(
  data: NotificationData
): Promise<void> {
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