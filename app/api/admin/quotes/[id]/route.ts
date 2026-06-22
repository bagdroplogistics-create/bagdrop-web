import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth, requireAdmin } from '@/lib/admin-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ quote: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Pull out action flags (not stored in DB)
  const sendEmail    = body.send_email    === true
  const sendWhatsApp = body.send_whatsapp === true

  const allowed = [
    'customer_name', 'customer_phone', 'customer_email',
    'service_type', 'from_city', 'to_city', 'pickup_date', 'time_slot',
    'total_bags', 'base_price', 'status', 'valid_until', 'notes',
    'lead_id', 'booking_id',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('base_price' in updates) {
    const base = Number(updates.base_price) || 0
    updates.cgst         = parseFloat((base * 0.025).toFixed(2))
    updates.sgst         = parseFloat((base * 0.025).toFixed(2))
    updates.total_amount = parseFloat((base + (updates.cgst as number) + (updates.sgst as number)).toFixed(2))
  }

  // Convert empty strings to null for optional columns
  const nullableFields = ['pickup_date', 'valid_until', 'customer_email', 'time_slot', 'notes', 'lead_id', 'booking_id']
  for (const f of nullableFields) {
    if (f in updates && updates[f] === '') updates[f] = null
  }

  if (Object.keys(updates).length === 0 && !sendEmail && !sendWhatsApp) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Fetch full current quote for email sending + version tracking
  const { data: current } = await supabaseAdmin
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single()

  if (Object.keys(updates).length > 0) {
    updates.version = ((current?.version ?? 1) as number) + 1
  }

  let data = current
  let updateError = null

  if (Object.keys(updates).length > 0) {
    const result = await supabaseAdmin
      .from('quotes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    data        = result.data ?? current
    updateError = result.error
  }

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const quote = data!

  // ── Sync booking status when quote is sent ──────────────────────
  const newStatus     = (updates.status ?? quote.status) as string
  const linkedBooking = (updates.booking_id ?? quote.booking_id) as string | null

  if (newStatus === 'sent' && linkedBooking) {
    const totalAmt = (updates.total_amount ?? quote.total_amount) as number
    await supabaseAdmin
      .from('bookings')
      .update({ status: 'quote_sent', total_amount: totalAmt })
      .eq('id', linkedBooking)
  }

  // ── Send Email ───────────────────────────────────────────────────
  let email_sent    = false
  let whatsapp_sent = false

  if (sendEmail && quote.customer_email) {
    const apiKey = process.env.RESEND_API_KEY
    if (apiKey) {
      const fmt = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })
      const base = Number(updates.base_price ?? quote.base_price) || 0
      const cgst = parseFloat((base * 0.025).toFixed(2))
      const sgst = parseFloat((base * 0.025).toFixed(2))
      const total = parseFloat((base + cgst + sgst).toFixed(2))
      const pickupDate = (updates.pickup_date ?? quote.pickup_date) as string | null

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
  <p style="margin:0 0 8px;font-size:15px;color:#374151">Hi <strong>${quote.customer_name}</strong>,</p>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">Thank you for choosing Bagdrop. Please find your service quote below.</p>
  <div style="background:#fff7f0;border:1px solid #ffedd5;border-radius:8px;padding:12px 16px;margin-bottom:24px;display:inline-block">
    <span style="font-size:12px;color:#9a3412;font-weight:600;text-transform:uppercase;letter-spacing:1px">Quote Number</span><br>
    <span style="font-size:20px;font-weight:700;color:#FF6300;font-family:monospace">${quote.quote_number}</span>
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px">
    <tr style="background:#f9fafb"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Service Details</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;width:40%">Service</td><td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6">${updates.service_type ?? quote.service_type}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Route</td><td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6">${updates.from_city ?? quote.from_city} → ${updates.to_city ?? quote.to_city}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Pickup Date</td><td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6">${pickupDate ? new Date(pickupDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'To be confirmed'}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Bags</td><td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6">${updates.total_bags ?? quote.total_bags}</td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px">
    <tr style="background:#f9fafb"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Pricing</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Base Price</td><td style="padding:10px 16px;font-size:13px;text-align:right;border-top:1px solid #f3f4f6">${fmt(base)}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">CGST 2.5%</td><td style="padding:10px 16px;font-size:13px;text-align:right;border-top:1px solid #f3f4f6">${fmt(cgst)}</td></tr>
    <tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">SGST 2.5%</td><td style="padding:10px 16px;font-size:13px;text-align:right;border-top:1px solid #f3f4f6">${fmt(sgst)}</td></tr>
    <tr style="background:#fff7f0"><td style="padding:14px 16px;font-size:15px;font-weight:700;color:#111827;border-top:2px solid #ffedd5">Total</td><td style="padding:14px 16px;font-size:18px;font-weight:700;color:#FF6300;text-align:right;border-top:2px solid #ffedd5">${fmt(total)}</td></tr>
  </table>
  <p style="margin:0 0 4px;font-size:14px;color:#374151">To confirm your booking:</p>
  <p style="margin:0;font-size:14px;color:#374151">📞 <a href="tel:+919876543210" style="color:#FF6300">+91 98765 43210</a> &nbsp; 📧 <a href="mailto:info@bagdrop.co" style="color:#FF6300">info@bagdrop.co</a></p>
</td></tr>
<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© ${new Date().getFullYear()} Bagdrop Logistics Solutions Pvt. Ltd. · Quote valid for 7 days.</p>
</td></tr>
</table></td></tr></table></body></html>`

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'Bagdrop <info@bagdrop.co>',
            to:      quote.customer_email,
            subject: `Your Bagdrop Quote — ${quote.quote_number} (${fmt(total)})`,
            html,
          }),
        })
        email_sent = emailRes.ok
      } catch { email_sent = false }
    }
  }

  // ── Send WhatsApp ────────────────────────────────────────────────
  if (sendWhatsApp && quote.customer_phone) {
    const token   = process.env.WHATSAPP_ACCESS_TOKEN
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (token && phoneId) {
      const digits = quote.customer_phone.replace(/\D/g, '')
      const e164   = digits.startsWith('91') ? digits : '91' + digits
      const total  = Number(updates.total_amount ?? quote.total_amount)
      const text   = `Hi ${quote.customer_name}! 🧳\n\nYour Bagdrop service quote is ready.\n\n` +
        `📋 Quote: *${quote.quote_number}*\n` +
        `🗺️ Route: ${updates.from_city ?? quote.from_city} → ${updates.to_city ?? quote.to_city}\n` +
        `💰 Total: *₹${total.toLocaleString('en-IN')}*\n\n` +
        `To confirm your booking, reply here or call +91 98765 43210.\n\n` +
        `_Bagdrop — Baggage Delivered. Journey Simplified._`
      try {
        const waRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: e164, type: 'text', text: { body: text } }),
        })
        whatsapp_sent = waRes.ok
      } catch { whatsapp_sent = false }
    }
  }

  return NextResponse.json({ quote, email_sent, whatsapp_sent })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Admin access required to delete quotes' }, { status: 403 })
  }
  const { id } = await params

  const { error } = await supabaseAdmin.from('quotes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
