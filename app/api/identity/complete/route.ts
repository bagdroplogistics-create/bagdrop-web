import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthUser, identityGateEnabled } from '@/lib/booking-session'
import { setuConfigFromEnv, fetchVerifiedIdentity } from '@/lib/identity/setu-digilocker'
import { nameMatchScore, classifyMatch } from '@/lib/identity/name-match'

// POST /api/identity/complete  { requestId: string }
// Called by the /book/identity-return page. The redirect query string is NEVER trusted:
// the result is fetched from Setu server-side, bound to the logged-in user, and is
// idempotent (a verified record is returned as-is, never re-fetched or overwritten).
export async function POST(req: Request) {
  if (!(await identityGateEnabled())) return NextResponse.json({ error: 'Not enabled.' }, { status: 404 })
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const requestId = String(body?.requestId ?? '').trim()
  if (!requestId) return NextResponse.json({ error: 'Missing request.' }, { status: 400 })

  const { data: row } = await supabaseAdmin
    .from('identity_verifications')
    .select('*')
    .eq('provider_request_id', requestId)
    .eq('user_id', user.id)          // session binding: another user's request id is invisible
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Verification not found.' }, { status: 404 })

  const view = (r: typeof row) => ({
    verificationId: r.id,
    status: r.status,
    outcome: r.match_outcome,
    score: r.name_match_score,
    verifiedName: r.verified_name,
    maskedNumber: r.masked_number,
    spellingConfirmed: !!r.spelling_confirmed_at,
    reviewStatus: r.review_status,
  })

  // Replay / duplicate protection: already finalised → return stored result, no provider call.
  if (row.status === 'verified' || row.status === 'failed' || row.status === 'expired') {
    return NextResponse.json(view(row))
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from('identity_verifications').update({ status: 'expired' }).eq('id', row.id)
    return NextResponse.json({ ...view(row), status: 'expired' })
  }

  const cfg = setuConfigFromEnv()
  if (!cfg) return NextResponse.json({ error: 'Identity verification is not configured.' }, { status: 503 })

  try {
    const r = await fetchVerifiedIdentity(cfg, requestId)
    if (r.status === 'pending') return NextResponse.json({ ...view(row), status: 'pending' })
    if (r.status !== 'authenticated' || !r.identity) {
      const { data: upd } = await supabaseAdmin.from('identity_verifications')
        .update({ status: r.status === 'expired' ? 'expired' : 'failed' }).eq('id', row.id).select('*').single()
      return NextResponse.json(view(upd ?? row))
    }

    const score = nameMatchScore(row.booking_name ?? '', r.identity.name)
    const outcome = classifyMatch(score)
    const { data: upd, error } = await supabaseAdmin.from('identity_verifications')
      .update({
        status: 'verified',
        verified_name: r.identity.name,
        masked_number: r.identity.maskedNumber,
        name_match_score: Number(score.toFixed(3)),
        match_outcome: outcome,
        review_status: outcome === 'blocked' ? 'pending' : null,   // <0.70 → manual review
        verified_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('status', 'created')       // atomic: only the first completion wins
      .select('*')
      .maybeSingle()
    if (error) throw new Error(error.message)
    return NextResponse.json(view(upd ?? row))
  } catch (e) {
    const m = (e as Error).message
    console.error('[identity/complete]', m)
    // Most common cause: the customer pressed "Allow" without ticking "Aadhaar Card" on DigiLocker's consent screen.
    if (m.startsWith('setu_aadhaar_failed')) {
      return NextResponse.json({
        error: 'We could not read your Aadhaar from DigiLocker. On the DigiLocker consent screen, tick "Aadhaar Card" before clicking Allow, then try again.',
      }, { status: 400 })
    }
    return NextResponse.json({ error: 'Could not confirm verification. Please try again.' }, { status: 502 })
  }
}
