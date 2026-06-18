// BAGDROP — lib/email.ts
// Transactional email via Resend REST API (no SDK).

const RESEND_API = 'https://api.resend.com/emails'
const FROM = 'Bagdrop <info@bagdrop.co>'
const ADMIN_EMAIL = 'info@bagdrop.co'
const BRAND = '#FF6300'

async function sendEmail(to: string | string[], subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not set — skipping email:', subject)
    return
  }
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[Email] Resend API error:', err)
  } else {
    const data = await res.json()
    console.log('[Email] Sent:', subject, 'id:', data.id)
  }
}

function baseTemplate(body: string) {
  return '<!DOCTYPE html>' +
    '<html lang="en"><head>' +
    '<meta charset="UTF-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>Bagdrop</title>' +
    '</head>' +
    '<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">' +
    '<tr><td align="center">' +
    '<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">' +
    '<tr><td style="background:' + BRAND + ';border-radius:12px 12px 0 0;padding:28px 36px;">' +
    '<span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">BAGDROP</span>' +
    '<span style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.7);letter-spacing:2px;margin-left:8px;vertical-align:middle;">BAG. BOX. DELIVERED.</span>' +
    '</td></tr>' +
    '<tr><td style="background:#fff;padding:36px;border-radius:0 0 12px 12px;">' +
    body +
    '</td></tr>' +
    '<tr><td style="padding:20px 36px;text-align:center;">' +
    '<p style="margin:0;font-size:12px;color:#888;">Bagdrop &middot; Premium Baggage Infrastructure &middot; India<br/>' +
    '<a href="https://bagdrop.co" style="color:' + BRAND + ';text-decoration:none;">bagdrop.co</a>' +
    ' &nbsp;&middot;&nbsp; ' +
    '<a href="mailto:support@bagdrop.co" style="color:' + BRAND + ';text-decoration:none;">support@bagdrop.co</a>' +
    '</p></td></tr>' +
    '</table></td></tr></table>' +
    '</body></html>'
}

function infoRow(label: string, value: string) {
  return '<tr>' +
    '<td style="padding:7px 0;font-size:13px;color:#888;width:140px;vertical-align:top;">' + label + '</td>' +
    '<td style="padding:7px 0;font-size:13px;color:#111;font-weight:500;">' + value + '</td>' +
    '</tr>'
}

export interface BookingEmailData {
  customerName:  string
  customerEmail: string
  customerPhone: string
  trackingId:    string
  serviceLabel:  string
  fromCity:      string
  toCity:        string
  date:          string
  timeSlot:      string
  totalBags:     number
  orderId:       string
}

export async function sendCustomerConfirmation(data: BookingEmailData) {
  const dateFormatted = data.date
    ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : data.date

  const steps = [
    'Our team will call you within 30 minutes to confirm your pickup details.',
    'A Bagdrop representative will arrive at your location at the scheduled time.',
    'Your bags are sealed, photographed, and insured for the journey.',
    'Live tracking updates will be sent to this email and via WhatsApp.',
  ]

  const stepsHtml = steps.map((step, i) =>
    '<tr>' +
    '<td style="width:30px;padding:6px 10px 6px 0;vertical-align:top;">' +
    '<span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:' + BRAND + ';color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:22px;">' + (i + 1) + '</span>' +
    '</td>' +
    '<td style="font-size:13px;color:#444;padding:6px 0;">' + step + '</td>' +
    '</tr>'
  ).join('')

  const body =
    '<h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#111;">Booking Request Received!</h1>' +
    '<p style="margin:0 0 28px;font-size:15px;color:#555;">Hi ' + data.customerName + ', we have received your booking request and our team will contact you shortly to confirm.</p>' +

    '<div style="background:#fff7f0;border:2px solid ' + BRAND + ';border-radius:10px;padding:16px 20px;margin-bottom:28px;text-align:center;">' +
    '<p style="margin:0;font-size:12px;color:#888;letter-spacing:1px;text-transform:uppercase;">Tracking ID</p>' +
    '<p style="margin:4px 0 0;font-size:28px;font-weight:900;color:' + BRAND + ';letter-spacing:2px;">' + data.trackingId + '</p>' +
    '<p style="margin:6px 0 0;font-size:12px;color:#888;">Save this to track your bags at <a href="https://bagdrop.co/track" style="color:' + BRAND + ';">bagdrop.co/track</a></p>' +
    '</div>' +

    '<h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Booking Summary</h3>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f0f0;margin-bottom:28px;">' +
    infoRow('Service', data.serviceLabel) +
    infoRow('Route', data.fromCity + ' &rarr; ' + data.toCity) +
    infoRow('Date', dateFormatted) +
    infoRow('Time slot', data.timeSlot || 'To be confirmed') +
    infoRow('Total bags', String(data.totalBags)) +
    (data.customerPhone ? infoRow('Contact', data.customerPhone) : '') +
    '</table>' +

    '<h3 style="margin:0 0 14px;font-size:14px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">What Happens Next</h3>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">' +
    stepsHtml +
    '</table>' +

    '<div style="text-align:center;margin-bottom:20px;">' +
    '<a href="https://bagdrop.co/track?id=' + data.trackingId + '" style="display:inline-block;background:' + BRAND + ';color:#fff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">Track My Bags</a>' +
    '</div>' +

    '<p style="margin:20px 0 0;font-size:12px;color:#aaa;text-align:center;">Questions? WhatsApp us or email <a href="mailto:support@bagdrop.co" style="color:' + BRAND + ';">support@bagdrop.co</a></p>'

  await sendEmail(
    data.customerEmail,
    'Booking Confirmed — ' + data.trackingId + ' | Bagdrop',
    baseTemplate(body)
  )
}

export async function sendAdminNotification(data: BookingEmailData) {
  const dateFormatted = data.date
    ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      })
    : data.date

  const body =
    '<h2 style="margin:0 0 20px;font-size:18px;font-weight:800;color:#111;">' +
    '🔔 New Booking Inquiry' +
    '</h2>' +

    '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f0f0;margin-bottom:24px;">' +
    infoRow('Tracking ID', data.trackingId) +
    infoRow('Customer', data.customerName) +
    infoRow('Email', data.customerEmail) +
    infoRow('Phone', data.customerPhone) +
    infoRow('Service', data.serviceLabel) +
    infoRow('Route', data.fromCity + ' &rarr; ' + data.toCity) +
    infoRow('Date', dateFormatted) +
    infoRow('Time slot', data.timeSlot || 'Not specified') +
    infoRow('Bags', String(data.totalBags)) +
    '</table>' +

    '<div style="text-align:center;">' +
    '<a href="https://bagdrop.co/admin" style="display:inline-block;background:' + BRAND + ';color:#fff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">View in Dashboard</a>' +
    '</div>'

  await sendEmail(
    ADMIN_EMAIL,
    'New Inquiry ' + data.trackingId + ' — ' + data.customerName + ' — ' + data.fromCity + ' → ' + data.toCity,
    baseTemplate(body)
  )
}
