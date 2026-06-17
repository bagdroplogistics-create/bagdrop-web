import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Generates a cryptographically random 6-digit OTP
function generateOtp(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return String(100000 + (array[0] % 900000))
}

// For phone users we create a synthetic email so Supabase auth can track them
function syntheticEmail(e164Phone: string): string {
  // e.g. +919876543210 → phone_919876543210@auth.bagdrop.in
  return `phone_${e164Phone.replace('+', '')}@auth.bagdrop.in`
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const { type, contact } = body ?? {}

  if (!type || !contact || !['email', 'phone'].includes(type)) {
    return NextResponse.json({ error: 'type (email|phone) and contact are required.' }, { status: 400 })
  }

  const otp      = generateOtp()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min
  const authEmail = type === 'email' ? contact.trim().toLowerCase() : syntheticEmail(contact)

  // ── Delete any previous unused OTPs for this contact ──
  await supabaseAdmin
    .from('auth_otps')
    .delete()
    .eq('contact', authEmail)
    .eq('used', false)

  // ── Store new OTP ──────────────────────────────────────
  const { error: insertError } = await supabaseAdmin
    .from('auth_otps')
    .insert({ contact: authEmail, otp, expires_at: expiresAt })

  if (insertError) {
    console.error('[send-otp] DB insert error:', insertError)
    return NextResponse.json({ error: 'Failed to generate OTP. Please try again.' }, { status: 500 })
  }

  // ── Email: send via Resend API ─────────────────────────
  if (type === 'email') {
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ error: 'Email service not configured.' }, { status: 500 })
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'Bagdrop <onboarding@resend.dev>',
        to:      contact.trim(),
        subject: 'Your Bagdrop verification code',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
            <h2 style="color:#E85D04;margin-bottom:8px">Bagdrop</h2>
            <p style="color:#374151;font-size:16px">Your one-time verification code is:</p>
            <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#111827;margin:24px 0">${otp}</div>
            <p style="color:#6B7280;font-size:14px">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
            <p style="color:#9CA3AF;font-size:12px">Bagdrop — India's Premium Baggage Delivery Service</p>
          </div>
        `,
      }),
    })

    if (!emailRes.ok) {
      const errBody = await emailRes.json().catch(() => ({}))
      console.error('[send-otp] Resend error:', errBody)
      return NextResponse.json({ error: 'Failed to send email. Please try again.' }, { status: 500 })
    }

    // Don't expose OTP for email — it's in their inbox
    return NextResponse.json({ success: true })
  }

  // ── Phone: return OTP to display on screen ─────────────
  // No SMS is sent — the code is shown directly to the customer
  return NextResponse.json({ success: true, otp })
}
