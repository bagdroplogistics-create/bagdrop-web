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
  const bookingName = String(body?.bookingName ?? '').trim()
  if (bookingName.length < 2) return NextResponse.json({ error: 'Enter the name for this booking.' }, { status: 400 })
  if (body?.consent !== true) return NextResponse.json({ error: 'Consent is required to continue.' }, { status: 400 })

  const cfg = setuConfigFromEnv()
  if (!cfg) return NextResponse.json({ error: 'Identity verification is not configured.' }, { status: 503 })

  try {
    const session = await ensureSession(user, bookingName, body?.useCase ?? null)
    const redirectUrl = `${safeOrigin(req)}/book/identity-return?s=${session.id}`
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

    return NextResponse.json({ url: created.url, verificationId: row.id, requestId: created.requestId })
  } catch (e) {
    console.error('[identity/start]', (e as Error).message)
    return NextResponse.json({ error: 'Could not start identity verification. Please try again.' }, { status: 502 })
  }
}
