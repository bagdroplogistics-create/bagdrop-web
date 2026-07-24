// BAGDROP — lib/email.ts
// Transactional email via Resend REST API.

const RESEND_API   = 'https://api.resend.com/emails'
const FROM         = 'Bagdrop <info@bagdrop.co>'
const BRAND        = '#FF6300'

// Both admins receive every inquiry notification
const ADMIN_EMAILS = ['info@bagdrop.co', 'aditya@bagdrop.co']

// ── Core send function ────────────────────────────────────────────────
async function sendEmail(
  to:      string | string[],
  subject: string,
  html:    string,
  context: string = '',
): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    const msg = '[Email] RESEND_API_KEY not set — skipping: ' + subject
    console.warn(msg)
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const recipients = Array.isArray(to) ? to : [to]

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({ from: FROM, to: recipients, subject, html }),
    })

    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    if (!res.ok) {
      console.error(
        `[Email] FAILED ${context ? '(' + context + ') ' : ''}"${subject}"`,
        '| status:', res.status,
        '| error:', JSON.stringify(data),
      )
      return { success: false, error: JSON.stringify(data) }
    }

    console.log(
      `[Email] SENT ${context ? '(' + context + ') ' : ''}"${subject}"`,
      '| to:', recipients.join(', '),
      '| id:', data.id,
    )
    return { success: true, id: data.id as string }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Email] EXCEPTION ${context ? '(' + context + ') ' : ''}"${subject}"`, msg)
    return { success: false, error: msg }
  }
}

// ── HTML helpers ──────────────────────────────────────────────────────
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
    '<tr><td style="background:' + BRAND + ';border-radius:12px 12px 0 0;padding:24px 32px;">' +
    '<span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">BAGDROP</span>' +
    '<span style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.7);letter-spacing:2px;margin-left:8px;vertical-align:middle;">BAG. BOX. DELIVERED.</span>' +
    '</td></tr>' +
    '<tr><td style="background:#fff;padding:32px;border-radius:0 0 12px 12px;">' +
    body +
    '</td></tr>' +
    '<tr><td style="padding:18px 32px;text-align:center;">' +
    '<p style="margin:0;font-size:11px;color:#aaa;">Bagdrop &middot; Premium Baggage Infrastructure &middot; India<br/>' +
    '<a href="https://bagdrop.co" style="color:' + BRAND + ';text-decoration:none;">bagdrop.co</a>' +
    ' &middot; ' +
    '<a href="mailto:info@bagdrop.co" style="color:' + BRAND + ';text-decoration:none;">info@bagdrop.co</a>' +
    '</p></td></tr>' +
    '</table></td></tr></table>' +
    '</body></html>'
}

function row(label: string, value: string | null | undefined) {
  if (!value) return ''
  return (
    '<tr style="border-bottom:1px solid #f3f3f3;">' +
    '<td style="padding:8px 12px 8px 0;font-size:12px;color:#888;white-space:nowrap;vertical-align:top;width:160px;">' +
    label + '</td>' +
    '<td style="padding:8px 0;font-size:13px;color:#111;font-weight:500;">' +
    value + '</td>' +
    '</tr>'
  )
}

function badge(text: string, color = BRAND) {
  return (
    '<span style="display:inline-block;background:' + color + ';color:#fff;' +
    'font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;' +
    'padding:3px 8px;border-radius:4px;">' + text + '</span>'
  )
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null
  try {
    return new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
      .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return iso }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }) + ' IST'
  } catch { return iso }
}

const SOURCE_LABELS: Record<string, string> = {
  website:      'Website Booking Form',
  'mobile-app': 'Mobile App',
  admin:        'Admin — Manual Entry',
  whatsapp:     'WhatsApp',
  instagram:    'Instagram',
  facebook:     'Facebook',
  phone:        'Phone Call',
  'walk-in':    'Walk-in Customer',
  b2b:          'B2B Partner',
  b2c:        'B2C Direct',
  referral:   'Referral',
  email:      'Email Inquiry',
}

// ── Inquiry Notification (to both admins) ─────────────────────────────

export interface InquiryEmailData {
  inquiryNumber:    string          // lead_number or tracking_id
  source:           string          // website / admin / whatsapp / etc.
  customerName:     string
  customerPhone:    string
  customerEmail?:   string | null
  serviceType?:     string | null
  fromCity?:        string | null
  toCity?:          string | null
  pickupAddress?:   string | null
  deliveryAddress?: string | null
  bagsCount?:       number | null
  travelDate?:      string | null
  pickupDate?:      string | null
  deliveryDate?:    string | null
  flightNumber?:    string | null
  pnr?:             string | null
  notes?:           string | null
  submittedAt:      string          // ISO timestamp
}

export async function sendInquiryNotification(data: InquiryEmailData) {
  const sourceLabel = SOURCE_LABELS[data.source?.toLowerCase() ?? ''] ?? data.source ?? 'Unknown'

  const serviceMap: Record<string, string> = {
    'airport-to-doorstep':  'Airport → Doorstep',
    'airport-to-door':      'Airport → Doorstep',
    'doorstep-to-airport':  'Doorstep → Airport',
    'door-to-airport':      'Doorstep → Airport',
    'doorstep-to-doorstep': 'Doorstep → Doorstep',
    'airport-to-airport':   'Airport → Airport',
  }
  const serviceLabel = data.serviceType
    ? (serviceMap[data.serviceType] ?? data.serviceType)
    : null

  const body =
    '<h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#111;">🔔 New Inquiry Received</h2>' +
    '<p style="margin:0 0 24px;font-size:13px;color:#777;">' +
    formatDateTime(data.submittedAt) +
    ' &nbsp;|&nbsp; ' +
    badge(sourceLabel) +
    '</p>' +

    // Inquiry number highlight
    '<div style="background:#fff7f0;border-left:4px solid ' + BRAND + ';border-radius:6px;padding:14px 18px;margin-bottom:24px;">' +
    '<p style="margin:0;font-size:11px;color:#999;letter-spacing:1px;text-transform:uppercase;">Inquiry Number</p>' +
    '<p style="margin:4px 0 0;font-size:26px;font-weight:900;color:' + BRAND + ';letter-spacing:2px;">' + data.inquiryNumber + '</p>' +
    '</div>' +

    // Details table
    '<h3 style="margin:0 0 10px;font-size:12px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.5px;">Inquiry Details</h3>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">' +
    row('Customer Name',    data.customerName) +
    row('Contact Number',   data.customerPhone) +
    row('Email Address',    data.customerEmail || '—') +
    row('Source',           sourceLabel) +
    row('Service Type',     serviceLabel) +
    row('From',             data.fromCity) +
    row('To',               data.toCity) +
    row('Pickup Address',   data.pickupAddress) +
    row('Delivery Address', data.deliveryAddress) +
    row('No. of Bags',      data.bagsCount ? String(data.bagsCount) : null) +
    row('Travel Date',      formatDate(data.travelDate)) +
    row('Pickup Date',      formatDate(data.pickupDate)) +
    row('Delivery Date',    formatDate(data.deliveryDate)) +
    row('Flight Number',    data.flightNumber) +
    row('PNR',              data.pnr) +
    row('Notes',            data.notes) +
    row('Submitted At',     formatDateTime(data.submittedAt)) +
    '</table>' +

    // CTA
    '<div style="text-align:center;margin-bottom:8px;">' +
    '<a href="https://bagdrop.co/admin/leads" style="display:inline-block;background:' + BRAND + ';color:#fff;' +
    'font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">View in Admin Panel</a>' +
    '</div>'

  const subject =
    'New Inquiry ' + data.inquiryNumber +
    ' — ' + data.customerName +
    (data.fromCity && data.toCity ? ' — ' + data.fromCity + ' → ' + data.toCity : '') +
    ' [' + sourceLabel + ']'

  // Send one independent email per admin — Resend can silently drop array recipients
  await Promise.allSettled(
    ADMIN_EMAILS.map(addr => sendEmail(addr, subject, baseTemplate(body), data.inquiryNumber))
  )
}

// ── Customer Confirmation ─────────────────────────────────────────────

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
  const dateFormatted = formatDate(data.date) ?? data.date

  const steps = [
    'Our team will contact you shortly to confirm your pickup details.',
    'A Bagdrop representative will arrive at your location at the scheduled time.',
    'Your bags are sealed, photographed, and insured for the journey.',
    'WhatsApp and email updates will be sent at every stage of your delivery.',
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
    '<p style="margin:0;font-size:12px;color:#888;letter-spacing:1px;text-transform:uppercase;">Booking ID</p>' +
    '<p style="margin:4px 0 0;font-size:28px;font-weight:900;color:' + BRAND + ';letter-spacing:2px;">' + data.trackingId + '</p>' +
    '<p style="margin:6px 0 0;font-size:12px;color:#888;">Please quote this ID when contacting us on WhatsApp or email.</p>' +
    '</div>' +

    '<h3 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Booking Summary</h3>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">' +
    row('Service', data.serviceLabel) +
    row('Route', data.fromCity + ' → ' + data.toCity) +
    row('Date', dateFormatted) +
    row('Time slot', data.timeSlot || 'To be confirmed') +
    row('Total bags', String(data.totalBags)) +
    (data.customerPhone ? row('Contact', data.customerPhone) : '') +
    '</table>' +

    '<h3 style="margin:0 0 14px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">What Happens Next</h3>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">' +
    stepsHtml +
    '</table>' +

    '<div style="text-align:center;margin-bottom:20px;">' +
    '<a href="https://wa.me/916357115711?text=Hi! My Bagdrop Booking ID is ' + data.trackingId + '. Can you confirm my booking?" style="display:inline-block;background:' + BRAND + ';color:#fff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">WhatsApp Us</a>' +
    '</div>' +

    '<p style="margin:20px 0 0;font-size:12px;color:#aaa;text-align:center;">Questions? WhatsApp us or email <a href="mailto:info@bagdrop.co" style="color:' + BRAND + ';">info@bagdrop.co</a></p>'

  if (!data.customerEmail) return
  await sendEmail(data.customerEmail, 'Booking Confirmed | Bagdrop', baseTemplate(body), data.trackingId)
}

// ── Inquiry Acknowledgment (to customer) ───────────────────────────────
// Sent automatically the moment ANY inquiry is saved, regardless of source
// (website contact form, booking forms, mobile app, admin/partner/API lead
// creation). See lib/lead-acknowledgment.ts for the orchestration —
// idempotency, WhatsApp, and communication_log — that calls this.

export interface InquiryAcknowledgmentEmailData {
  customerName:  string
  customerEmail: string
}

export async function sendInquiryAcknowledgmentEmail(data: InquiryAcknowledgmentEmailData) {
  if (!data.customerEmail) return { success: false, error: 'No customer email' }

  const body =
    '<h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#111;">Thank You for Your Inquiry</h2>' +
    '<p style="margin:20px 0 0;font-size:14px;color:#333;line-height:1.6;">Dear ' + data.customerName + ',</p>' +
    '<p style="margin:14px 0 0;font-size:14px;color:#333;line-height:1.6;">Thank you for contacting Bagdrop.</p>' +
    '<p style="margin:14px 0 0;font-size:14px;color:#333;line-height:1.6;">' +
    'We have successfully received your inquiry. Our team will review the details and get in touch with you shortly ' +
    'to discuss your requirements and provide a customized quotation based on the information you have shared.' +
    '</p>' +
    '<p style="margin:14px 0 0;font-size:14px;color:#333;line-height:1.6;">' +
    'If you have any additional information or questions, feel free to reply to this message.' +
    '</p>' +
    '<p style="margin:14px 0 0;font-size:14px;color:#333;line-height:1.6;">Thank you for choosing Bagdrop. We look forward to assisting you.</p>' +
    '<p style="margin:24px 0 0;font-size:14px;color:#333;line-height:1.6;">Regards,<br/>Bagdrop Team</p>' +

    '<div style="text-align:center;margin:28px 0 4px;">' +
    '<a href="https://wa.me/916357115711" style="display:inline-block;background:#25D366;color:#fff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">WhatsApp Us</a>' +
    '</div>'

  return sendEmail(data.customerEmail, 'Thank You for Your Inquiry', baseTemplate(body), 'ack:' + data.customerName)
}

// ── Quote Email (to customer) ─────────────────────────────────────────

export interface QuoteEmailData {
  customerName:    string
  customerEmail:   string
  quoteNumber:     string
  fromCity:        string
  toCity:          string
  bagsCount:       number
  pickupDate?:     string | null
  deliveryDate?:   string | null
  lineItems:       { name: string; quantity: number; rate: number; amount: number }[]
  subtotal:        number
  discountAmt?:    number | null
  discountPct?:    number | null
  tax:             number
  total:           number
  notes?:          string | null
  terms?:          string | null
  salesperson?:    string | null
}

export async function sendQuoteEmail(data: QuoteEmailData) {
  if (!data.customerEmail) return { success: false, error: 'No customer email' }

  const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

  // Line items rows
  const itemRows = data.lineItems.map(item =>
    '<tr style="border-bottom:1px solid #f3f3f3;">' +
    '<td style="padding:10px 12px 10px 0;font-size:13px;color:#222;vertical-align:top;">' +
      '<strong>' + item.name + '</strong>' +
    '</td>' +
    '<td style="padding:10px 8px;font-size:13px;color:#555;text-align:center;white-space:nowrap;">' + item.quantity + '</td>' +
    '<td style="padding:10px 8px;font-size:13px;color:#555;text-align:right;white-space:nowrap;">' + fmt(item.rate) + '</td>' +
    '<td style="padding:10px 0 10px 8px;font-size:13px;font-weight:600;color:#111;text-align:right;white-space:nowrap;">' + fmt(item.amount) + '</td>' +
    '</tr>'
  ).join('')

  const body =
    '<h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#111;">Your Quote from Bagdrop</h2>' +
    '<p style="margin:0 0 24px;font-size:14px;color:#555;">Hi ' + data.customerName + ', please find your estimate below. Contact us to confirm your booking.</p>' +

    // Quote number highlight
    '<div style="background:#fff7f0;border-left:4px solid ' + BRAND + ';border-radius:6px;padding:14px 18px;margin-bottom:24px;">' +
    '<p style="margin:0;font-size:11px;color:#999;letter-spacing:1px;text-transform:uppercase;">Quote Number</p>' +
    '<p style="margin:4px 0 0;font-size:26px;font-weight:900;color:' + BRAND + ';letter-spacing:2px;">' + data.quoteNumber + '</p>' +
    '</div>' +

    // Journey summary
    '<h3 style="margin:0 0 10px;font-size:12px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.5px;">Journey Details</h3>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">' +
    row('Customer Name', data.customerName) +
    row('Route',         data.fromCity + ' → ' + data.toCity) +
    row('No. of Bags',  String(data.bagsCount)) +
    row('Pickup Date',  data.pickupDate   ? formatDate(data.pickupDate)   ?? data.pickupDate   : null) +
    row('Delivery Date',data.deliveryDate ? formatDate(data.deliveryDate) ?? data.deliveryDate : null) +
    row('Salesperson',  data.salesperson) +
    '</table>' +

    // Line items table
    '<h3 style="margin:0 0 10px;font-size:12px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.5px;">Items</h3>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">' +
    '<thead><tr style="border-bottom:2px solid #eee;">' +
    '<th style="padding:6px 12px 6px 0;font-size:11px;color:#888;text-align:left;font-weight:600;text-transform:uppercase;">Description</th>' +
    '<th style="padding:6px 8px;font-size:11px;color:#888;text-align:center;font-weight:600;text-transform:uppercase;">Qty</th>' +
    '<th style="padding:6px 8px;font-size:11px;color:#888;text-align:right;font-weight:600;text-transform:uppercase;">Rate</th>' +
    '<th style="padding:6px 0 6px 8px;font-size:11px;color:#888;text-align:right;font-weight:600;text-transform:uppercase;">Amount</th>' +
    '</tr></thead>' +
    '<tbody>' + itemRows + '</tbody>' +
    '</table>' +

    // Totals
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">' +
    '<tr><td style="padding:6px 0;font-size:13px;color:#666;text-align:right;padding-right:8px;">Sub Total</td><td style="padding:6px 0;font-size:13px;color:#333;text-align:right;width:120px;">' + fmt(data.subtotal) + '</td></tr>' +
    ((data.discountAmt ?? 0) > 0
      ? '<tr><td style="padding:6px 0;font-size:13px;color:#dc2626;text-align:right;padding-right:8px;">' +
        (data.discountPct ? 'Discount (' + data.discountPct + '%)' : 'Discount') +
        '</td><td style="padding:6px 0;font-size:13px;color:#dc2626;font-weight:700;text-align:right;">−' + fmt(data.discountAmt!) + '</td></tr>'
      : '') +
    '<tr><td style="padding:6px 0;font-size:13px;color:#666;text-align:right;padding-right:8px;">GST 5% (CGST 2.5% + SGST 2.5%)</td><td style="padding:6px 0;font-size:13px;color:#333;text-align:right;">' + fmt(data.tax) + '</td></tr>' +
    '<tr style="border-top:2px solid #eee;"><td style="padding:10px 0 6px;font-size:15px;font-weight:800;color:#111;text-align:right;padding-right:8px;">Total</td><td style="padding:10px 0 6px;font-size:18px;font-weight:900;color:' + BRAND + ';text-align:right;">' + fmt(data.total) + '</td></tr>' +
    '</table>' +

    // Payment details
    '<div style="background:#f8f9fa;border-radius:8px;padding:16px 20px;margin-bottom:24px;">' +
    '<h3 style="margin:0 0 12px;font-size:12px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.5px;">Payment Details</h3>' +
    '<table width="100%" cellpadding="0" cellspacing="0">' +
    row('Bank Name',    'Indian Overseas Bank (IOB)') +
    row('Account Name', 'Bagdrop Logistics Solutions Pvt. Ltd.') +
    row('Account No.',  '258702000000058') +
    row('IFSC Code',    'IOBA0002587') +
    row('UPI',          'BAGDROP1717@IOB') +
    '</table>' +
    '<div style="text-align:center;margin-top:14px;">' +
    '<img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=upi%3A%2F%2Fpay%3Fpa%3DBAGDROP1717%40IOB%26pn%3DBagdrop%26cu%3DINR" width="130" height="130" alt="UPI QR Code" style="display:block;margin:0 auto 6px;border-radius:6px;border:1px solid #e5e7eb;" />' +
    '<p style="margin:0;font-size:11px;color:#666;">Scan with any UPI app to pay</p>' +
    '</div>' +
    '</div>' +

    // Notes
    (data.notes ? '<div style="background:#fff7f0;border-radius:8px;padding:14px 18px;margin-bottom:20px;"><p style="margin:0;font-size:13px;color:#555;">' + data.notes + '</p></div>' : '') +

    // CTA
    '<div style="text-align:center;margin-bottom:20px;">' +
    '<a href="mailto:info@bagdrop.co" style="display:inline-block;background:' + BRAND + ';color:#fff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;margin-right:8px;">Confirm Booking</a>' +
    '<a href="https://wa.me/916357115711" style="display:inline-block;background:#25D366;color:#fff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">WhatsApp Us</a>' +
    '</div>' +

    '<p style="margin:0;font-size:11px;color:#aaa;text-align:center;">This quote is valid for 7 days from the date of issue. Payment confirms your booking.</p>'

  return sendEmail(
    data.customerEmail,
    'Quote ' + data.quoteNumber + ' for ' + data.customerName + ' — ' + data.fromCity + ' → ' + data.toCity + ' | Bagdrop',
    baseTemplate(body),
    data.quoteNumber,
  )
}

// ── Legacy admin notification (kept for backward compat) ──────────────
// Routes should migrate to sendInquiryNotification instead.

export async function sendAdminNotification(data: BookingEmailData) {
  await sendInquiryNotification({
    inquiryNumber:  data.trackingId,
    source:         'website',
    customerName:   data.customerName,
    customerPhone:  data.customerPhone,
    customerEmail:  data.customerEmail,
    serviceType:    data.serviceLabel,
    fromCity:       data.fromCity,
    toCity:         data.toCity,
    bagsCount:      data.totalBags,
    travelDate:     data.date,
    submittedAt:    new Date().toISOString(),
  })
}
