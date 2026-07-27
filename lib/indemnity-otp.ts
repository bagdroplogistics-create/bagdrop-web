// BAGDROP — lib/indemnity-otp.ts
//
// Lightweight OTP identity-check for the public Indemnity Bond signing page
// (Step 3). Deliberately NOT reusing app/api/auth/*-otp routes as-is: those
// create/sign-in a full Supabase Auth account (via generateLink +
// updateUserById), which is the right shape for the customer mobile app's
// login flow but unnecessary and riskier here — the indemnity page only
// needs a one-time proof that the person on the link really is the
// booking's customer, not a session.
//
// Reuses the SAME auth_otps table and the same delivery channels (Resend
// for email, Fast2SMS quick-SMS for phone — no Meta template needed for
// either), but stores contacts under an `indemnity:` prefix so these OTPs
// can never collide with or interfere with the existing app-login OTP flow
// even if a customer uses the same email/phone for both at the same time.

import { supabaseAdmin } from './supabase'

function generateOtp(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return String(100000 + (array[0] % 900000))
}

function contactKey(type: 'email' | 'phone', contact: string): string {
  const normalized = type === 'email'
    ? contact.trim().toLowerCase()
    : contact.replace(/\D/g, '').slice(-10)
  return `indemnity:${type}:${normalized}`
}

async function sendSmsOtp(mobileNumber: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.FAST2SMS_API_KEY
  if (!apiKey) return { ok: false, error: 'FAST2SMS_API_KEY not set' }

  const digits = mobileNumber.replace(/\D/g, '').slice(-10)
  try {
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route:   'q',
        message: `${otp} is your Bagdrop verification code to sign your indemnity bond. Valid for 10 minutes. -Bagdrop`,
        numbers: digits,
        flash:   0,
      }),
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown>
    if (!res.ok || data.return === false) {
      const msgs = Array.isArray(data.message) ? (data.message as string[]).join(', ') : String(data.message ?? JSON.stringify(data))
      return { ok: false, error: msgs }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

async function sendEmailOtp(email: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { ok: false, error: 'RESEND_API_KEY not set' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'Bagdrop <otp@bagdrop.co>',
        to:      email,
        subject: 'Your Bagdrop verification code',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
            <h2 style="color:#FF6300;margin-bottom:8px">Bagdrop</h2>
            <p style="color:#374151;font-size:16px">Your verification code to sign your indemnity bond is:</p>
            <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#111827;margin:24px 0">${otp}</div>
            <p style="color:#6B7280;font-size:14px">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
          </div>
        `,
      }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return { ok: false, error: JSON.stringify(errBody) }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/** Generates, stores, and delivers an OTP to the given contact. */
export async function sendIndemnityOtp(
  type: 'email' | 'phone',
  contact: string,
): Promise<{ success: boolean; error?: string }> {
  const key = contactKey(type, contact)
  const otp = generateOtp()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await supabaseAdmin.from('auth_otps').delete().eq('contact', key).eq('used', false)
  const { error: insertError } = await supabaseAdmin.from('auth_otps').insert({ contact: key, otp, expires_at: expiresAt })
  if (insertError) return { success: false, error: 'Failed to generate code. Please try again.' }

  const result = type === 'email' ? await sendEmailOtp(contact, otp) : await sendSmsOtp(contact, otp)
  if (!result.ok) return { success: false, error: result.error }
  return { success: true }
}

/** Verifies a submitted OTP against what was stored for this contact. */
export async function verifyIndemnityOtp(
  type: 'email' | 'phone',
  contact: string,
  otp: string,
): Promise<{ success: boolean; error?: string }> {
  const key = contactKey(type, contact)
  const now = new Date().toISOString()

  const { data: rows, error: fetchError } = await supabaseAdmin
    .from('auth_otps')
    .select('id, otp, used')
    .eq('contact', key)
    .eq('used', false)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)

  if (fetchError) return { success: false, error: 'Something went wrong. Please try again.' }

  const record = rows?.[0]
  if (!record) return { success: false, error: 'Code expired or not found. Please request a new one.' }
  if (String(record.otp).trim() !== String(otp).trim()) return { success: false, error: 'Incorrect code. Please check and try again.' }

  await supabaseAdmin.from('auth_otps').update({ used: true }).eq('id', record.id)
  return { success: true }
}
