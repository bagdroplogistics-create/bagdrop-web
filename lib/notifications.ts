/**
 * Bagdrop Notification Service
 * Sends Email (Resend) and WhatsApp (Meta Cloud API) on booking status changes.
 */

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
  variables: string[]
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

  const params = new URLSearchParams({
    message_id:       messageId,
    phone_number_id:  phoneNumberId,
    numbers:          tenDigit,
    variables_values: variables.join('|'),
  })

  try {
    const res = await fetch(`https://www.fast2sms.com/dev/whatsapp?${params.toString()}`, {
      headers: { Authorization: apiKey },
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
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Fast2SMS WhatsApp] EXCEPTION', msg)
    return { success: false, error: msg }
  }
}

export async function notifyBookingStatus(
  data: NotificationData
): Promise<void> {
  const msg = STATUS_MESSAGES[data.status]
  if (!msg) return

  await Promise.allSettled([
    sendEmail(data, msg),
    sendWhatsApp(data, msg),
  ])
}