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

// ── Fast2SMS — sends OTP as SMS to Indian mobile numbers ─────
// API docs: https://docs.fast2sms.com
// Set FAST2SMS_API_KEY in your environment variables (Vercel → Settings → Env Vars)
async function sendSmsOtp(mobileNumber: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.FAST2SMS_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'FAST2SMS_API_KEY not set' }
  }

  // Strip +91 prefix; Fast2SMS expects 10-digit number
  const digits = mobileNumber.replace(/^\+91/, '').replace(/\D/g, '')

  let data: Record<string, unknown> = {}
  try {
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route:   'q',                                     // Quick SMS — works without DLT, no min recharge
        message: `${otp} is your Bagdrop OTP. Valid for 10 minutes. Do not share. -Bagdrop`,
        numbers: digits,
        flash:   0,
      }),
    })
    data = await res.json().catch(() => ({}))

    if (!res.ok || data.return === false) {
      // data.message is often an array in Fast2SMS responses
      const msgs = Array.isArray(data.message) ? (data.message as string[]).join(', ') : String(data.message ?? JSON.stringify(data))
      console.error('[send-otp] Fast2SMS error:', msgs, '| HTTP:', res.status, '| numbers:', digits)
      return { ok: false, error: msgs }
    }

    console.log('[send-otp] Fast2SMS OK:', data)
    return { ok: true }
  } catch (err) {
    console.error('[send-otp] Fast2SMS fetch threw:', err)
    return { ok: false, error: String(err) }
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const { type, contact } = body ?? {}

  if (!type || !contact || !['email', 'phone'].includes(type)) {
    return NextResponse.json({ error: 'type (email|phone) and contact are required.' }, { status: 400 })
  }

  const otp       = generateOtp()
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
        from:    'Bagdrop <otp@bagdrop.co>',
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
      const detail = process.env.NODE_ENV === 'development'
        ? (errBody?.message ?? JSON.stringify(errBody))
        : 'Failed to send email. Please try again.'
      return NextResponse.json({ error: detail }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  // ── Phone: send OTP via Fast2SMS ───────────────────────
  const smsResult = await sendSmsOtp(contact, otp)

  if (!smsResult.ok) {
    // SMS failed (no key, wrong key, provider error, etc.)
    // Always fall back to on-screen so the customer can still complete their booking.
    // The smsError field tells the admin why SMS didn't send.
    console.error('[send-otp] SMS failed, falling back to on-screen OTP. Reason:', smsResult.error)
    return NextResponse.json({ success: true, otp, fallback: true, smsError: smsResult.error })
  }

  // OTP delivered via SMS — do NOT expose it in the response
  return NextResponse.json({ success: true })
}
