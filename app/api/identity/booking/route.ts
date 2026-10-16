import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthUser } from '@/lib/booking-session'

// GET /api/identity/booking?id=BDA-2026-0001
// Identity status of the caller's own booking (matched by the verified mobile number).
export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')?.trim() ?? ''
  const { data: bk } = await supabaseAdmin.from('bookings')
    .select('title, customer_name, customer_phone, identity_verification_id').eq('tracking_id', id).maybeSingle()
  if (!bk || bk.customer_phone !== user.contact) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

  let status: 'pending' | 'verified' | 'review' = 'pending'
  let verifiedName: string | null = null
  let maskedNumber: string | null = null
  if (bk.identity_verification_id) {
    const { data: v } = await supabaseAdmin.from('identity_verifications')
      .select('status, review_status, match_outcome, spelling_confirmed_at, verified_name, masked_number')
      .eq('id', bk.identity_verification_id).maybeSingle()
    if (v?.status === 'verified') {
      verifiedName = v.verified_name; maskedNumber = v.masked_number
      if (v.review_status) status = 'review'
      else if (v.match_outcome === 'pass' || v.spelling_confirmed_at) status = 'verified'
    }
  }
  return NextResponse.json({ name: bk.customer_name, title: bk.title, status, verifiedName, maskedNumber })
}
