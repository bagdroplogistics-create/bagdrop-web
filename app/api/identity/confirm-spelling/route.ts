import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthUser, identityGateEnabled } from '@/lib/booking-session'

// POST /api/identity/confirm-spelling  { verificationId: string, confirm: boolean }
// Only valid for the 0.70–0.85 "confirm" band, and only once. confirm=true accepts the
// verified spelling; confirm=false sends the case to manual review.
export async function POST(req: Request) {
  if (!(await identityGateEnabled())) return NextResponse.json({ error: 'Not enabled.' }, { status: 404 })
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = String(body?.verificationId ?? '')
  if (!id || typeof body?.confirm !== 'boolean') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  const { data: row } = await supabaseAdmin.from('identity_verifications')
    .select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Verification not found.' }, { status: 404 })
  if (row.status !== 'verified' || row.match_outcome !== 'confirm') {
    return NextResponse.json({ error: 'Nothing to confirm for this verification.' }, { status: 409 })
  }
  if (row.spelling_confirmed_at || row.review_status) {
    return NextResponse.json({ error: 'Already answered.' }, { status: 409 })   // one chance only
  }

  // Confirming means: "yes, the name on my ID is mine — use it for this booking".
  // The booking name becomes the provider-verified name, so the record carries the legal name.
  const patch = body.confirm
    ? { spelling_confirmed_at: new Date().toISOString(), booking_name: row.verified_name ?? row.booking_name }
    : { review_status: 'pending' }
  const { error } = await supabaseAdmin.from('identity_verifications').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, outcome: body.confirm ? 'confirmed' : 'review' })
}
