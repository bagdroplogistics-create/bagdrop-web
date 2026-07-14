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

async function sendWhatsApp(
  data: NotificationData,
  msg: StatusMessage
): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneId) return

  const digits = data.customerPhone.replace(/\D/g, '')
  const e164 = digits.startsWith('91') ? digits : '91' + digits
  const text = interpolate(msg.whatsapp, data)

  try {
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
    })
  } catch (err) {
    console.error('WhatsApp error:', err)
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