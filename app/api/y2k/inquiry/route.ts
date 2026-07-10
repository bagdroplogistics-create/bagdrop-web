import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, phone, email, guests, bags, pickupAddress, deliveryAddress, pickupTime, requests } = body

    // Basic validation
    const digits = phone?.replace(/\D/g, '') ?? ''
    if (!name?.trim() || !/^[6-9]\d{9}$/.test(digits)) {
      return NextResponse.json({ error: 'Name and a valid 10-digit Indian mobile number are required.' }, { status: 400 })
    }

    const trackingId = 'Y2K-' + Math.random().toString(36).toUpperCase().slice(2, 8)

    // ── Save to database ──────────────────────────────────────
    try {
      await supabaseAdmin.from('bookings').insert({
        tracking_id:    trackingId,
        status:         'pending',
        customer_name:  name.trim(),
        customer_email: email?.trim().toLowerCase() || null,
        customer_phone: '+91' + digits,
        service_type:   'destination-weddings',
        service_label:  'Destination Wedding — #Y2K',
        from_city:      'Udaipur',
        to_city:        'Udaipur',
        pickup_address: pickupAddress || null,
        drop_address:   deliveryAddress || null,
        pickup_date:    '2026-12-17',
        time_slot:      pickupTime || null,
        total_bags:     parseInt(bags) || 1,
        total_amount:   0,
        currency:       'INR',
        notes: [
          '[#Y2K — Yashna ❤️ Yash @ Taj Lake Palace, Udaipur · 17 Dec 2026]',
          guests       ? `Group size: ${guests} guests` : '',
          bags         ? `Luggage pieces: ${bags}` : '',
          pickupAddress   ? `Pickup: ${pickupAddress}` : '',
          deliveryAddress ? `Delivery: ${deliveryAddress}` : '',
          pickupTime   ? `Preferred time: ${pickupTime}` : '',
          requests     ? `Special requests: ${requests}` : '',
        ].filter(Boolean).join(' | '),
        status_history: [{ status: 'pending', timestamp: new Date().toISOString(), note: '#Y2K wedding inquiry received' }],
      })
    } catch (dbErr) {
      console.error('[y2k/inquiry] DB save error:', dbErr)
    }

    // ── Send notification email to info@bagdrop.co ────────────
    const apiKey = process.env.RESEND_API_KEY
    let emailSent = false

    if (apiKey) {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF4EE;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF4EE;padding:32px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(44,24,16,0.10);max-width:580px">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1A0A12 0%,#2E1020 100%);padding:32px 40px;text-align:center">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:rgba(232,212,154,0.7)">OFFICIAL CONCIERGE PARTNER</p>
    <p style="margin:0;font-family:Georgia,serif;font-size:28px;color:#E8D49A;font-weight:300">✨ #Y2K Wedding ✨</p>
    <p style="margin:6px 0 0;font-size:14px;color:rgba(240,192,203,0.8)">Yashna ❤️ Yash · Taj Lake Palace, Udaipur</p>
  </td></tr>

  <!-- Alert banner -->
  <tr><td style="background:#C9A84C;padding:10px 40px;text-align:center">
    <p style="margin:0;font-size:13px;font-weight:700;color:#2C1810;letter-spacing:1px">NEW LUGGAGE CONCIERGE INQUIRY — ${trackingId}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:36px 40px">
    <p style="margin:0 0 24px;font-size:15px;color:#6B4C3B;line-height:1.6">A wedding guest has submitted a luggage concierge inquiry for <strong>#Y2K</strong>.</p>

    <!-- Guest details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0E4D0;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <tr style="background:#FAF4EE"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#A07830">Guest Details</td></tr>
      ${[
        ['Full Name',  name.trim()],
        ['Mobile',     '+91 ' + digits],
        ['Email',      email?.trim() || '—'],
        ['Group Size', (guests || '1') + ' guest(s)'],
        ['Luggage',    (bags   || '1') + ' piece(s)'],
      ].map(([l,v]) => `<tr><td style="padding:10px 16px;font-size:13px;color:#9B7650;border-top:1px solid #F5ECD6;width:40%">${l}</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#2C1810;border-top:1px solid #F5ECD6">${v}</td></tr>`).join('')}
    </table>

    <!-- Logistics -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0E4D0;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <tr style="background:#FAF4EE"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#A07830">Logistics</td></tr>
      ${[
        ['Pickup Address',    pickupAddress   || '—'],
        ['Preferred Time',    pickupTime      || '—'],
        ['Delivery Address',  deliveryAddress || '—'],
        ['Event Date',        '17 December 2026'],
        ['Wedding Venue',     'Taj Lake Palace, Udaipur'],
      ].map(([l,v]) => `<tr><td style="padding:10px 16px;font-size:13px;color:#9B7650;border-top:1px solid #F5ECD6;width:40%">${l}</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#2C1810;border-top:1px solid #F5ECD6">${v}</td></tr>`).join('')}
    </table>

    ${requests ? `<div style="background:#FFF9F0;border:1px solid #F0E4D0;border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#A07830">Special Requests</p>
      <p style="margin:0;font-size:14px;color:#2C1810;line-height:1.65">${requests}</p>
    </div>` : ''}

    <p style="margin:0;font-size:14px;color:#6B4C3B;line-height:1.7">Please follow up with the guest at your earliest convenience to confirm the concierge arrangement for <strong>#Y2K</strong>.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#1A0A12;padding:20px 40px;text-align:center">
    <p style="margin:0;font-size:12px;color:rgba(232,212,154,0.5)">Bagdrop Luggage Concierge · #Y2K Wedding · info@bagdrop.co</p>
  </td></tr>

</table></td></tr></table>
</body></html>`

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'BagDrop Weddings <info@bagdrop.co>',
            to:      ['info@bagdrop.co'],
            subject: `💍 #Y2K Concierge Inquiry — ${name.trim()} (${trackingId})`,
            html,
          }),
        })
        emailSent = emailRes.ok
        if (!emailRes.ok) console.error('[y2k/inquiry] Resend error:', await emailRes.text())
      } catch (err) {
        console.error('[y2k/inquiry] Email send error:', err)
      }
    }

    // ── Send confirmation to guest (if email provided) ────────
    if (apiKey && email?.trim()) {
      const guestHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF4EE;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF4EE;padding:32px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(44,24,16,0.08);max-width:560px">
  <tr><td style="background:linear-gradient(135deg,#1A0A12 0%,#2E1020 100%);padding:36px 40px;text-align:center">
    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:32px;color:#E8D49A;font-weight:300">✨ #Y2K ✨</p>
    <p style="margin:0;font-size:14px;color:rgba(240,192,203,0.85)">Yashna ❤️ Yash · Taj Lake Palace, Udaipur · 17 Dec 2026</p>
  </td></tr>
  <tr><td style="padding:36px 40px;text-align:center">
    <p style="margin:0 0 8px;font-size:18px;color:#2C1810">Dear <strong>${name.trim()}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#6B4C3B;line-height:1.75">Your luggage concierge request for <strong>Yashna ❤️ Yash's</strong> wedding has been received. Our team will be in touch shortly to confirm your arrangement for <strong>#Y2K</strong> at Taj Lake Palace, Udaipur.</p>
    <div style="background:#FAF4EE;border:1px solid #E8D49A;border-radius:12px;padding:20px;display:inline-block;margin-bottom:24px;text-align:left">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#A07830">Your Reference</p>
      <p style="margin:0;font-size:24px;font-weight:300;color:#C9A84C;font-family:Georgia,serif">${trackingId}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#6B4C3B;line-height:1.7">For any queries, reach us at <a href="mailto:info@bagdrop.co" style="color:#C9A84C">info@bagdrop.co</a></p>
  </td></tr>
  <tr><td style="background:#1A0A12;padding:16px 40px;text-align:center">
    <p style="margin:0;font-size:11px;color:rgba(232,212,154,0.4)">Bagdrop — India's Premium Luggage Concierge · bagdrop.co</p>
  </td></tr>
</table></td></tr></table>
</body></html>`

      try {
        await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'BagDrop Weddings <info@bagdrop.co>',
            to:      [email.trim()],
            subject: `Your #Y2K Concierge Request is Confirmed — ${trackingId}`,
            html:    guestHtml,
          }),
        })
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, trackingId, emailSent })
  } catch (err) {
    console.error('[y2k/inquiry] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
