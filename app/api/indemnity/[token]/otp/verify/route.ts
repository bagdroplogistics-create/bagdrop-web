import { NextRequest, NextResponse } from 'next/server'
import { resolveIndemnityToken } from '@/lib/indemnity-token'
import { verifyIndemnityOtp } from '@/lib/indemnity-otp'
import { sendIndemnityWhatsApp } from '@/lib/indemnity-notifications'
import { sendIndemnityBondStatusEmail } from '@/lib/email'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

// ── POST /api/indemnity/[token]/otp/verify ────────────────────────────
// Step 3 continued. Body: { type: 'email' | 'phone', otp: string }.
// Marks the bond otp_verified so the submit endpoint can require it before
// accepting the signed bond — the OTP only ever proves identity, never
// creates a login session (see lib/indemnity-otp.ts doc comment).
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
  const otp = String(body?.otp ?? '').trim()

  if (!otp) return NextResponse.json({ error: 'Enter the code sent to you.' }, { status: 400 })

  const contact = type === 'email' ? booking.customer_email : booking.customer_phone
  if (!contact) {
    return NextResponse.json({ error: `No ${type} on file for this booking.` }, { status: 400 })
  }

  const verifyResult = await verifyIndemnityOtp(type, contact, otp)
  if (!verifyResult.success) {
    return NextResponse.json({ error: verifyResult.error }, { status: 400 })
  }

  await supabaseAdmin
    .from('indemnity_bonds')
    .update({ otp_verified: true, otp_verified_at: new Date().toISOString() })
    .eq('id', bond.id)

  // Step 9 — notify (best-effort, never blocks the verify response)
  sendIndemnityWhatsApp('otp_verified', {
    customerPhone: booking.customer_phone,
    customerName:  booking.customer_name,
    trackingId:    booking.tracking_id,
  }, [booking.customer_name ?? 'Customer', booking.tracking_id]).catch(() => {})

  if (booking.customer_email) {
    sendIndemnityBondStatusEmail({
      customerName:  booking.customer_name ?? 'Customer',
      customerEmail: booking.customer_email,
      trackingId:    booking.tracking_id,
      headline:      'Identity Verified',
      message:       'your identity has been verified. Please continue to review and sign your indemnity bond.',
    }).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
