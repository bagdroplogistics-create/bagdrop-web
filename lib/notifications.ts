/**
 * Bagdrop Notification Service
 * Sends Email (Resend) and WhatsApp (Meta Cloud API) on booking status changes.
 *
 * Required env vars:
 *   RESEND_API_KEY              — for email notifications
 *   WHATSAPP_ACCESS_TOKEN       — Meta Cloud API access token
 *   WHATSAPP_PHONE_NUMBER_ID    — Meta Cloud API phone number ID
 *
 * WhatsApp setup: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
 */

export type BookingStatus =
  | 'pending' | 'confirmed' | 'pickup_scheduled' | 'picked_up'
  | 'in_transit' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled'

interface NotificationData {
  customerName:  string
  customerPhone: string
  customerEmail: string
  trackingId:    string
  status:        BookingStatus
  fromCity:      string
  toCity:        string
}

// ── Status Messages ──────────────────────────────────────────────
const STATUS_MESSAGES: Record<BookingStatus, { subject: string; body: string; whatsapp: string }> = {
  pending: {
    subject: 'Bagdrop: Booking Received',
    body: `We've received your booking request. Our team will confirm it shortly.`,
    whatsapp: `Hi {name}! 🧳 Your Bagdrop booking has been received. Tracking ID: *{trackingId}*. We'll confirm it shortly.`,
  },
  confirmed: {
    subject: 'Bagdrop: Booking Confirmed ✓',
    body: `Great news! Your baggage delivery booking is confirmed.`,
    whatsapp: `Hi {name}! ✅ Your Bagdrop booking *{trackingId}* is CONFIRMED. We'll schedule pickup soon.`,
  },
  pickup_scheduled: {
    subject: 'Bagdrop: Pickup Scheduled',
    body: `Your baggage pickup has been scheduled. Our agent will arrive at the pickup location.`,
    whatsapp: `Hi {name}! 📅 Your pickup is scheduled for booking *{trackingId}*. Please keep your bags ready.`,
  },
  picked_up: {
    subject: 'Bagdrop: Baggage Picked Up',
    body: `Your baggage has been picked up successfully and is now in our custody.`,
    whatsapp: `Hi {name}! 🚀 Your baggage has been *picked up* successfully (ID: *{trackingId}*). Safe travels!`,
  },
  in_transit: {
    subject: 'Bagdrop: Baggage In Transit',
    body: `Your baggage is on its way from {fromCity} to {toCity}.`,
    whatsapp: `Hi {name}! 🚛 Your baggage is *in transit* from {fromCity} → {toCity}. Tracking: *{trackingId}*`,
  },
  out_for_delivery: {
    subject: 'Bagdrop: Out for Delivery',
    body: `Your baggage is out for delivery and will reach you shortly.`,
    whatsapp: `Hi {name}! 📦 Your baggage is *out for delivery* now! (ID: *{trackingId}*). Please be available.`,
  },
  delivered: {
    subject: 'Bagdrop: Baggage Delivered ✓',
    body: `Your baggage has been delivered successfully. Thank you for choosing Bagdrop!`,
    whatsapp: `Hi {name}! 🎉 Your baggage has been *delivered successfully*! (ID: *{trackingId}*). Thank you for choosing Bagdrop. Travel light, always! ✈️`,
  },
  completed: {
    subject: 'Bagdrop: Booking Completed',
    body: `Your booking is now complete. We hope you had a great experience!`,
    whatsapp: `Hi {name}! ⭐ Your Bagdrop booking *{trackingId}* is complete. We'd love your feedback!`,
  },
  cancelled: {
    subject: 'Bagdrop: Booking Cancelled',
    body: `Your booking has been cancelled. Please contact us if this was a mistake.`,
    whatsapp: `Hi {name}. Your Bagdrop booking *{trackingId}* has been cancelled. Contact us at hello@bagdrop.co for help.`,
  },
}

function interpolate(template: string, data: NotificationData): string {
  return template
    .replace(/{name}/g, data.customerName)
    .replace(/{trackingId}/g, data.trackingId)
    .replace(/{fromCity}/g, data.fromCity)
    .replace(/{toCity}/g, data.toCity)
}

// ── Email via Resend ─────────────────────────────────────────────
async function sendEmail(data: NotificationData, msg: ReturnType<typeof STATUS_MESSAGES[BookingStatus]>): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key || !data.customerEmail) return

  const body = interpolate(msg.body, data)
  const subject = interpolate(msg.subject, data)

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Bagdrop <updates@bagdrop.co>',
      to:      data.customerEmail,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
          <h2 style="color:#E85D04;margin-bottom:4px">Bagdrop</h2>
          <p style="color:#6B7280;font-size:13px;margin-top:0">India's Digital Baggage Infrastructure</p>
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0"/>
          <p style="color:#111827;font-size:15px">Hi ${data.customerName},</p>
          <p style="color:#374151;font-size:15px">${body}</p>
          <div style="background:#FFF7F0;border:1px solid #FED7AA;border-radius:12px;padding:16px;margin:20px 0">
            <p style="margin:0;color:#9A3412;font-size:13px;font-weight:600">Tracking ID</p>
            <p style="margin:4px 0 0;color:#111827;font-size:20px;font-weight:800;letter-spacing:2px">${data.trackingId}</p>
          </div>
          <p style="color:#9CA3AF;font-size:12px">Questions? Reply to this email or call us.</p>
          <p style="color:#D1D5DB;font-size:11px;margin-top:24px">Bagdrop · bagdrop.co</p>
        </div>
      `,
    }),
  }).catch(err => console.error('[notifications] Email error:', err))
}

// ── WhatsApp via Meta Cloud API ──────────────────────────────────
async function sendWhatsApp(data: NotificationData, msg: ReturnType<typeof STATUS_MESSAGES[BookingStatus]>): Promise<void> {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    console.log('[notifications] WhatsApp env vars not set — skipping')
    return
  }

  // Strip all non-digits and ensure country code
  const digits = data.customerPhone.replace(/\D/g, '')
  const e164   = digits.startsWith('91') ? digits : '91' + digits

  const text = interpolate(msg.whatsapp, data)

  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
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
  }).catch(err => console.error('[notifications] WhatsApp error:', err))
}

// ── Main export ──────────────────────────────────────────────────
export async function notifyBookingStatus(data: NotificationData): Promise<void> {
  const msg = STATUS_MESSAGES[data.status]
  if (!msg) return

  console.log(`[notifications] Sending ${data.status} notification to ${data.customerPhone}`)

  await Promise.allSettled([
    sendEmail(data, msg),
    sendWhatsApp(data, msg),
  ])
}
