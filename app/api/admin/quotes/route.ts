import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// ── Quote number: BDQ-YYYY-NNNN ──────────────────────────────────
async function nextQuoteNumber(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `BDQ-${year}-`
  const { count } = await supabaseAdmin
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .like('quote_number', `${prefix}%`)
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `${prefix}${seq}`
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const page   = parseInt(searchParams.get('page') ?? '1', 10)
  const limit  = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('quotes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') query = query.eq('status', status)

  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,quote_number.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ quotes: data, total: count, page, limit })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.customer_name || !body?.customer_phone || !body?.service_type || !body?.from_city || !body?.to_city) {
    return NextResponse.json(
      { error: 'customer_name, customer_phone, service_type, from_city, to_city are required' },
      { status: 400 }
    )
  }

  const basePrice   = Number(body.base_price)  || 0
  const cgst        = parseFloat((basePrice * 0.025).toFixed(2))
  const sgst        = parseFloat((basePrice * 0.025).toFixed(2))
  const totalAmount = parseFloat((basePrice + cgst + sgst).toFixed(2))
  const bookingId   = body.booking_id ?? null
  const sendStatus  = body.status ?? 'draft'

  const quoteFields = {
    customer_name:  body.customer_name.trim(),
    customer_phone: body.customer_phone.trim(),
    customer_email: body.customer_email?.trim() || null,
    service_type:   body.service_type,
    from_city:      body.from_city,
    to_city:        body.to_city,
    pickup_date:    body.pickup_date   ?? null,
    time_slot:      body.time_slot     ?? null,
    total_bags:     Number(body.total_bags) || 1,
    base_price:     basePrice,
    cgst,
    sgst,
    total_amount:   totalAmount,
    status:         sendStatus,
    valid_until:    body.valid_until   ?? null,
    notes:          body.notes?.trim() || null,
    booking_id:     bookingId,
  }

  // ── UPSERT: if booking_id provided, update existing quote instead of inserting ──
  if (bookingId) {
    const { data: existing } = await supabaseAdmin
      .from('quotes')
      .select('id, quote_number, version')
      .eq('booking_id', bookingId)
      .maybeSingle()

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('quotes')
        .update({ ...quoteFields, version: ((existing.version ?? 1) as number) + 1 })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Sync booking status when quote is sent
      if (sendStatus === 'sent') {
        await supabaseAdmin.from('bookings').update({ status: 'quote_sent', total_amount: totalAmount }).eq('id', bookingId)
      }

      // Send email
      let email_sent = false
      if (sendStatus === 'sent' && quoteFields.customer_email) {
        email_sent = await sendQuoteEmail({
          to: quoteFields.customer_email, customerName: quoteFields.customer_name,
          quoteNumber: existing.quote_number, serviceType: quoteFields.service_type,
          fromCity: quoteFields.from_city, toCity: quoteFields.to_city,
          pickupDate: quoteFields.pickup_date, totalBags: quoteFields.total_bags,
          basePrice, cgst, sgst, totalAmount, notes: quoteFields.notes,
        })
      }

      return NextResponse.json({ quote: data, action: 'updated', email_sent }, { status: 200 })
    }
  }

  // ── INSERT: new quote ──
  const quoteNumber = await nextQuoteNumber()

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .insert({ quote_number: quoteNumber, lead_id: body.lead_id ?? null, ...quoteFields })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync booking status when quote is sent
  if (sendStatus === 'sent' && bookingId) {
    await supabaseAdmin.from('bookings').update({ status: 'quote_sent', total_amount: totalAmount }).eq('id', bookingId)
  }

  // Send email
  let email_sent = false
  if (sendStatus === 'sent' && quoteFields.customer_email) {
    email_sent = await sendQuoteEmail({
      to: quoteFields.customer_email, customerName: quoteFields.customer_name,
      quoteNumber, serviceType: quoteFields.service_type,
      fromCity: quoteFields.from_city, toCity: quoteFields.to_city,
      pickupDate: quoteFields.pickup_date, totalBags: quoteFields.total_bags,
      basePrice, cgst, sgst, totalAmount, notes: quoteFields.notes,
    })
  }

  return NextResponse.json({ quote: data, action: 'created', email_sent }, { status: 201 })
}

// ── Send quote email via Resend ───────────────────────────────────
async function sendQuoteEmail(p: {
  to: string; customerName: string; quoteNumber: string; serviceType: string
  fromCity: string; toCity: string; pickupDate: string | null; totalBags: number
  basePrice: number; cgst: number; sgst: number; totalAmount: number; notes: string | null
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) { console.warn('[quotes] RESEND_API_KEY not set'); return false }

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 })
  const pickupLine = p.pickupDate
    ? new Date(p.pickupDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'To be confirmed'

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:600px">
<tr><td style="background:#FF6300;padding:28px 32px">
  <p style="margin:0;font-size:26px;font-weight:700;color:#fff">Bagdrop</p>
  <p style="margin:4px 0 0;font-size:13px;color:#ffe0cc">Baggage Delivered. Journey Simplified.</p>
</td></tr>
<tr><td style="padding:32px">
  <p style="margin:0 0 8px;font-size:15px;color:#374151">Hi <strong>${p.customerName}</strong>,</p>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">Thank you for choosing Bagdrop. Please find your service quote below.</p>
  <div style="background:#fff7f0;border:1px solid #ffedd5;border-radius:8px;padding:12px 16px;margin-bottom:24px;display:inline-block">
    <span style="font-size:12px;color:#9a3412;font-weight:600;text-transform:uppercase;letter-spacing:1px">Quote Number</span><br>
    <span style="font-size:20px;font-weight:700;color:#FF6300;font-family:monospace">${p.quoteNumber}</span>
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px">
    <tr style="background:#f9fafb"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Service Details</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;width:40%">Service</td><td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6">${p.serviceType}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Route</td><td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6">${p.fromCity} → ${p.toCity}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Pickup Date</td><td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6">${pickupLine}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Bags</td><td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6">${p.totalBags}</td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px">
    <tr style="background:#f9fafb"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Pricing</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Base Price</td><td style="padding:10px 16px;font-size:13px;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${fmt(p.basePrice)}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">CGST 2.5%</td><td style="padding:10px 16px;font-size:13px;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${fmt(p.cgst)}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">SGST 2.5%</td><td style="padding:10px 16px;font-size:13px;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${fmt(p.sgst)}</td></tr>
    <tr style="background:#fff7f0"><td style="padding:14px 16px;font-size:15px;font-weight:700;color:#111827;border-top:2px solid #ffedd5">Total</td><td style="padding:14px 16px;font-size:18px;font-weight:700;color:#FF6300;text-align:right;border-top:2px solid #ffedd5">${fmt(p.totalAmount)}</td></tr>
  </table>
  ${p.notes ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:24px"><p style="margin:0;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase">Notes</p><p style="margin:6px 0 0;font-size:13px;color:#15803d">${p.notes}</p></div>` : ''}
  <p style="margin:0 0 4px;font-size:14px;color:#374151">To confirm, contact us at:</p>
  <p style="margin:0;font-size:14px;color:#374151">📞 <a href="tel:+919876543210" style="color:#FF6300;text-decoration:none">+91 98765 43210</a> &nbsp; 📧 <a href="mailto:info@bagdrop.co" style="color:#FF6300;text-decoration:none">info@bagdrop.co</a></p>
</td></tr>
<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© ${new Date().getFullYear()} Bagdrop Logistics Solutions Pvt. Ltd. · Quote valid for 7 days.</p>
</td></tr>
</table></td></tr></table>
</body></html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'Bagdrop <info@bagdrop.co>',
        to:      p.to,
        subject: `Your Bagdrop Quote — ${p.quoteNumber} (${fmt(p.totalAmount)})`,
        html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

