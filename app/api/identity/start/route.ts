import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthUser, identityGateEnabled, ensureSession, safeOrigin, CONSENT_TEXT_VERSION } from '@/lib/booking-session'
import { setuConfigFromEnv, createDigilockerRequest } from '@/lib/identity/setu-digilocker'

// POST /api/identity/start  { bookingName: string, consent: true, useCase?: string }
// Requires the OTP-verified session (Bearer token). Creates a Setu DigiLocker request
// and returns the URL to send the customer to. Nothing is stored beyond the provider ref.
export async function POST(req: Request) {
  if (!(await identityGateEnabled())) {
    return NextResponse.json({ error: 'Identity verification is not enabled.' }, { status: 404 })
  }
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Please verify your mobile number first.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (body?.consent !== true) return NextResponse.json({ error: 'Consent is required to continue.' }, { status: 400 })

  // The booking already exists: verification is attached to it. Ownership = the verified mobile
  // number on this booking (never the client's word for the name).
  const trackingId = String(body?.trackingId ?? '').trim()
  const { data: bk } = await supabaseAdmin.from('bookings')
    .select('id, customer_name, customer_phone, use_case, identity_verification_id').eq('tracking_id', trackingId).maybeSingle()
  if (!bk || bk.customer_phone !== user.contact) {
    return NextResponse.json({ error: 'We could not find this booking for your mobile number.' }, { status: 404 })
  }
  if (bk.identity_verification_id) {
    const { data: prev } = await supabaseAdmin.from('identity_verifications')
      .select('status, review_status').eq('id', bk.identity_verification_id).maybeSingle()
    if (prev?.status === 'verified' && !prev.review_status) {
      return NextResponse.json({ error: 'This booking is already verified.' }, { status: 409 })
    }
  }
  const bookingName = String(bk.customer_name ?? '').trim()
  if (bookingName.length < 2) return NextResponse.json({ error: 'Booking name is missing.' }, { status: 400 })

  const cfg = setuConfigFromEnv()
  if (!cfg) return NextResponse.json({ error: 'Identity verification is not configured.' }, { status: 503 })

  try {
    const session = await ensureSession(user, bookingName, bk.use_case ?? null)
    const redirectUrl = `${safeOrigin(req)}/book/identity-return?s=${session.id}&b=${encodeURIComponent(trackingId)}`
    const created = await createDigilockerRequest(cfg, redirectUrl)

    const expires = created.validUpto ? new Date(created.validUpto) : new Date(Date.now() + 30 * 60_000)
    const { data: row, error } = await supabaseAdmin
      .from('identity_verifications')
      .insert({
        session_id: session.id,
        user_id: user.id,
        provider_request_id: created.requestId,
        document_type: 'aadhaar',
        booking_name: bookingName,
        consent_at: new Date().toISOString(),
        consent_text_version: CONSENT_TEXT_VERSION,
        expires_at: isNaN(expires.getTime()) ? new Date(Date.now() + 30 * 60_000).toISOString() : expires.toISOString(),
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    await supabaseAdmin.from('bookings').update({ identity_verification_id: row.id, booking_session_id: session.id }).eq('id', bk.id)

    return NextResponse.json({ url: created.url, verificationId: row.id, requestId: created.requestId })
  } catch (e) {
    console.error('[identity/start]', (e as Error).message)
    return NextResponse.json({ error: 'Could not start identity verification. Please try again.' }, { status: 502 })
  }
}
