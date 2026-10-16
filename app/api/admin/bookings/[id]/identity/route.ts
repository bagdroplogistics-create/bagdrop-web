import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/email'

// Admin: Aadhaar verification status of a booking + "Send Aadhaar link" to the customer.
// Applies to website-flow bookings (use_case set). International travellers are verified manually.

function origin(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '')
}

async function load(id: string) {
  const { data: b } = await supabaseAdmin.from('bookings')
    .select('id, tracking_id, title, customer_name, customer_email, use_case, notes, identity_verification_id')
    .eq('id', id).maybeSingle()
  if (!b) return null
  const intl = /International traveller/i.test(String(b.notes ?? ''))
  let status: 'not_required' | 'pending' | 'verified' | 'review' = 'pending'
  let verifiedName: string | null = null
  let maskedNumber: string | null = null
  let verifiedAt: string | null = null
  if (!b.use_case || intl) status = 'not_required'
  else if (b.identity_verification_id) {
    const { data: v } = await supabaseAdmin.from('identity_verifications')
      .select('status, review_status, match_outcome, spelling_confirmed_at, verified_name, masked_number, verified_at')
      .eq('id', b.identity_verification_id).maybeSingle()
    if (v?.status === 'verified') {
      verifiedName = v.verified_name; maskedNumber = v.masked_number; verifiedAt = v.verified_at
      if (v.review_status) status = 'review'
      else if (v.match_outcome === 'pass' || v.spelling_confirmed_at) status = 'verified'
    }
  }
  return { b, intl, status, verifiedName, maskedNumber, verifiedAt }
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const r = await load(id)
  if (!r) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  return NextResponse.json({
    status: r.status, intl: r.intl, verifiedName: r.verifiedName, maskedNumber: r.maskedNumber, verifiedAt: r.verifiedAt,
    link: `${origin(req)}/book/verify?id=${r.b.tracking_id}`,
    hasEmail: !!r.b.customer_email,
  })
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const r = await load(id)
  if (!r) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (r.status === 'not_required') return NextResponse.json({ error: 'Aadhaar verification does not apply to this booking.' }, { status: 400 })
  if (r.status === 'verified') return NextResponse.json({ error: 'Already verified.' }, { status: 409 })
  if (!r.b.customer_email) return NextResponse.json({ error: 'No customer email on this booking. Copy the link and send it on WhatsApp.' }, { status: 400 })

  const link = `${origin(req)}/book/verify?id=${r.b.tracking_id}`
  const name = String(r.b.customer_name ?? 'there')
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111827">
    <h2 style="color:#FF6300">Verify your identity</h2>
    <p>Hi ${name.replace(/[<>&]/g, '')},</p>
    <p>Your Bagdrop booking <b>${r.b.tracking_id}</b> is confirmed. Before pickup, please verify the traveller with Aadhaar through DigiLocker. It takes about a minute. We never store your full Aadhaar number.</p>
    <p style="margin:24px 0"><a href="${link}" style="background:#FF6300;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Verify with DigiLocker</a></p>
    <p style="font-size:13px;color:#6b7280">You will sign in with a code sent to the mobile number on the booking.<br>If the button does not work, open: ${link}</p>
  </div>`
  const res = await sendEmail(r.b.customer_email, `Verify your identity — Booking ${r.b.tracking_id} | Bagdrop`, html, 'aadhaar-link:' + r.b.tracking_id)
  if (!res.success) return NextResponse.json({ error: 'Email could not be sent: ' + (res.error ?? 'unknown error') }, { status: 502 })
  return NextResponse.json({ ok: true, link })
}
