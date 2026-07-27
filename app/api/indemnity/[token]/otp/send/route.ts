import { NextRequest, NextResponse } from 'next/server'
import { resolveIndemnityToken } from '@/lib/indemnity-token'
import { sendIndemnityOtp } from '@/lib/indemnity-otp'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

// ── POST /api/indemnity/[token]/otp/send ──────────────────────────────
// Step 3. Body: { type: 'email' | 'phone' }. Deliberately does NOT accept
// an arbitrary contact from the request — it only ever sends the OTP to
// the email/phone already on file for this booking, so the public link
// can't be used to spam or phish an unrelated address.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  const result = await resolveIndemnityToken(token)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const { bond, booking } = result
  const body = await req.json().catch(() => ({}))
  const type = body?.type === 'phone' ? 'phone' : 'email'

  const contact = type === 'email' ? booking.customer_email : booking.customer_phone
  if (!contact) {
    return NextResponse.json({ error: `No ${type} on file for this booking. Please contact Bagdrop support.` }, { status: 400 })
  }

  const sendResult = await sendIndemnityOtp(type, contact)
  if (!sendResult.success) {
    return NextResponse.json({ error: sendResult.error ?? 'Failed to send code. Please try again.' }, { status: 500 })
  }

  await supabaseAdmin.from('indemnity_bonds').update({ otp_contact: contact }).eq('id', bond.id)

  return NextResponse.json({
    success: true,
    sent_to: type === 'email' ? maskEmail(contact) : maskPhone(contact),
  })
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return email
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`
}
