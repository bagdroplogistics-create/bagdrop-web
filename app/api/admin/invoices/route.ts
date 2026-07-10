import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status    = searchParams.get('status')
  const search    = searchParams.get('search')
  const bookingId = searchParams.get('booking_id')
  const page   = parseInt(searchParams.get('page') ?? '1', 10)
  const limit  = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('invoices')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') query = query.eq('payment_status', status)
  if (bookingId) query = query.eq('booking_id', bookingId)
  if (search) query = query.or(`customer_name.ilike.%${search}%,invoice_number.ilike.%${search}%,customer_phone.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data, total: count, page, limit })
}

// POST /api/admin/invoices — manually generate invoice from a booking_id
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const bookingId = body.booking_id

  // Fetch full booking
  const { data: booking, error: bErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single()

  if (bErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Check for existing invoice
  const { data: existingInv } = await supabaseAdmin
    .from('invoices')
    .select('id, total_amount, invoice_number')
    .eq('booking_id', bookingId)
    .maybeSingle()

  const total   = Number(booking.total_amount ?? 0)
  const baseAmt = parseFloat((total / 1.05).toFixed(2))
  const cgst    = parseFloat((baseAmt * 0.025).toFixed(2))
  const sgst    = parseFloat((baseAmt * 0.025).toFixed(2))

  const payload = {
    customer_name:     booking.customer_name,
    customer_phone:    booking.customer_phone,
    customer_email:    booking.customer_email ?? null,
    service_type:      booking.service_type ?? null,
    from_city:         booking.from_city,
    to_city:           booking.to_city,
    total_bags:        Number(booking.total_bags ?? 1),
    base_amount:       baseAmt,
    cgst,
    sgst,
    total_amount:      total,
    payment_status:    booking.payment_status ?? 'paid',
    payment_method:    booking.payment_method ?? null,
    payment_reference: booking.payment_reference ?? null,
    invoice_date:      new Date().toISOString().split('T')[0],
  }

  if (existingInv) {
    const { data: updated, error: uErr } = await supabaseAdmin
      .from('invoices')
      .update(payload)
      .eq('id', existingInv.id)
      .select()
      .single()
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

    // Send email even for existing invoices when explicitly requested
    let email_sent = false
    if (body.send_email && payload.customer_email) {
      email_sent = await sendInvoiceEmail({
        to:               payload.customer_email,
        customerName:     payload.customer_name,
        invoiceNumber:    existingInv.invoice_number,
        serviceType:      payload.service_type ?? 'Baggage Delivery',
        fromCity:         payload.from_city,
        toCity:           payload.to_city,
        totalBags:        payload.total_bags,
        baseAmount:       payload.base_amount,
        cgst:             payload.cgst,
        sgst:             payload.sgst,
        totalAmount:      payload.total_amount,
        paymentMethod:    payload.payment_method ?? 'UPI',
        paymentReference: payload.payment_reference ?? '',
        trackingId:       booking.tracking_id ?? '',
      })
      if (email_sent) {
        await supabaseAdmin.from('invoices').update({ sent_email: true }).eq('id', existingInv.id)
      }
    }

    return NextResponse.json({ invoice: updated, action: 'updated', email_sent })
  }

  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .like('invoice_number', `BDI-${year}-%`)

  const invNum = `BDI-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data: created, error: cErr } = await supabaseAdmin
    .from('invoices')
    .insert({ invoice_number: invNum, booking_id: bookingId, ...payload })
    .select()
    .single()

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // Auto-send invoice email if requested
  let email_sent = false
  if (body.send_email && payload.customer_email) {
    email_sent = await sendInvoiceEmail({
      to:               payload.customer_email,
      customerName:     payload.customer_name,
      invoiceNumber:    invNum,
      serviceType:      payload.service_type ?? 'Baggage Delivery',
      fromCity:         payload.from_city,
      toCity:           payload.to_city,
      totalBags:        payload.total_bags,
      baseAmount:       payload.base_amount,
      cgst:             payload.cgst,
      sgst:             payload.sgst,
      totalAmount:      payload.total_amount,
      paymentMethod:    payload.payment_method ?? 'UPI',
      paymentReference: payload.payment_reference ?? '',
      trackingId:       booking.tracking_id ?? '',
    })
    if (email_sent) {
      await supabaseAdmin.from('invoices').update({ sent_email: true }).eq('id', (created as { id: string }).id)
    }
  }

  return NextResponse.json({ invoice: created, action: 'created', email_sent })
}

// ── Invoice email via Resend ──────────────────────────────────────
async function sendInvoiceEmail(p: {
  to: string; customerName: string; invoiceNumber: string; serviceType: string
  fromCity: string; toCity: string; totalBags: number
  baseAmount: number; cgst: number; sgst: number; totalAmount: number
  paymentMethod: string; paymentReference: string; trackingId: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false
  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 })

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:600px">

<!-- Header -->
<tr><td style="background:#FF6300;padding:28px 32px">
  <p style="margin:0;font-size:26px;font-weight:700;color:#fff">Bagdrop</p>
  <p style="margin:4px 0 0;font-size:13px;color:#ffe0cc">Baggage Delivered. Journey Simplified.</p>
</td></tr>

<!-- Green confirmation banner -->
<tr><td style="background:#16a34a;padding:12px 32px;text-align:center">
  <p style="margin:0;font-size:14px;font-weight:700;color:#fff">✅ Booking Confirmed — Payment Received</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px">
  <p style="margin:0 0 8px;font-size:15px;color:#374151">Hi <strong>${p.customerName}</strong>,</p>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
    Your payment has been received and your Bagdrop booking is <strong>confirmed</strong>.
    Please find your invoice below.
  </p>

  <!-- Invoice & Tracking -->
  <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
    <div style="background:#fff7f0;border:1px solid #ffedd5;border-radius:8px;padding:12px 20px;flex:1;min-width:140px">
      <p style="margin:0;font-size:10px;color:#9a3412;font-weight:700;text-transform:uppercase;letter-spacing:1px">Invoice</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#FF6300;font-family:monospace">${p.invoiceNumber}</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 20px;flex:1;min-width:140px">
      <p style="margin:0;font-size:10px;color:#14532d;font-weight:700;text-transform:uppercase;letter-spacing:1px">Tracking ID</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#16a34a;font-family:monospace">${p.trackingId}</p>
    </div>
  </div>

  <!-- Service details -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px">
    <tr style="background:#f9fafb"><td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Service Details</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;width:42%">Service</td><td style="padding:9px 16px;font-size:13px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6">${p.serviceType}</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Route</td><td style="padding:9px 16px;font-size:13px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6">${p.fromCity} → ${p.toCity}</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Total Bags</td><td style="padding:9px 16px;font-size:13px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6">${p.totalBags}</td></tr>
  </table>

  <!-- Pricing -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px">
    <tr style="background:#f9fafb"><td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Invoice Summary</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Base Amount</td><td style="padding:9px 16px;font-size:13px;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${fmt(p.baseAmount)}</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">CGST 2.5%</td><td style="padding:9px 16px;font-size:13px;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${fmt(p.cgst)}</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">SGST 2.5%</td><td style="padding:9px 16px;font-size:13px;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${fmt(p.sgst)}</td></tr>
    <tr style="background:#f0fdf4"><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#111827;border-top:2px solid #bbf7d0">Total Paid</td><td style="padding:12px 16px;font-size:18px;font-weight:700;color:#16a34a;text-align:right;border-top:2px solid #bbf7d0">${fmt(p.totalAmount)}</td></tr>
  </table>

  <!-- Payment info -->
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:24px">
    <p style="margin:0;font-size:12px;font-weight:700;color:#14532d;text-transform:uppercase;letter-spacing:1px">Payment Details</p>
    <p style="margin:6px 0 0;font-size:13px;color:#15803d">Method: ${p.paymentMethod.toUpperCase()}${p.paymentReference ? ` · Ref: ${p.paymentReference}` : ''}</p>
  </div>

  <p style="margin:0 0 4px;font-size:14px;color:#374151">Track your shipment or reach us anytime:</p>
  <p style="margin:0;font-size:14px;color:#374151">📞 <a href="tel:+916357115711" style="color:#FF6300;text-decoration:none">+91 63571 15711</a> &nbsp; 📧 <a href="mailto:info@bagdrop.co" style="color:#FF6300;text-decoration:none">info@bagdrop.co</a></p>
</td></tr>

<!-- Footer -->
<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© ${new Date().getFullYear()} Bagdrop Logistics Solutions Pvt. Ltd.</p>
</td></tr>

</table></td></tr></table>
</body></html>`

  try {
    const res  = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'Bagdrop <info@bagdrop.co>',
        to:      p.to,
        subject: `Booking Confirmed — Invoice ${p.invoiceNumber} | Bagdrop`,
        html,
      }),
    })
    const body = await res.json().catch(() => ({}))
    console.log('[sendInvoiceEmail] status:', res.status, 'body:', JSON.stringify(body))
    return res.ok
  } catch (e) { console.error('[sendInvoiceEmail] error:', e); return false }
}
