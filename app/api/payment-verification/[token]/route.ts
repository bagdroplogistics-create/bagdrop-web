import { NextRequest, NextResponse } from 'next/server'
import { resolvePaymentVerificationToken } from '@/lib/payment-verification-token'
import { SITE } from '@/lib/constants'

// Public (no admin login) payment-verification review + action endpoint.
// Lets the Account Department approve or reject an uploaded payment proof
// straight from the notification email — the whole point being they don't
// need dashboard credentials to do it. Security is the token itself
// (unguessable, expires — see lib/payment-verification-token.ts), same
// model as the public /api/indemnity/[token] routes.

export const runtime = 'nodejs'

type Params = { params: Promise<{ token: string }> }

// ── GET — fetch details for the review page (read-only, safe to prefetch) ──
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params
  const result = await resolvePaymentVerificationToken(token)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const { payment, booking, inquiryId } = result
  return NextResponse.json({
    payment: {
      payment_id:     payment.payment_id,
      customer_name:  payment.customer_name,
      amount:         payment.amount,
      payment_status: payment.payment_status,
      proof_url:      payment.proof_url,
      proof_type:     payment.proof_type,
      created_at:     payment.created_at,
    },
    booking: booking ? {
      tracking_id: booking.tracking_id,
      route:       [booking.from_city, booking.to_city].filter(Boolean).join(' → ') || '—',
    } : null,
    inquiryId,
    // pending_verification is the only actionable state — anything else
    // means Accounts (or an admin) already approved/rejected this payment,
    // possibly from the dashboard, possibly from an earlier click of this
    // same link. The page uses this to decide whether to show the
    // Approve/Reject buttons at all.
    actionable: payment.payment_status === 'pending_verification',
  })
}

// ── POST — the actual approve/reject action ─────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  const result = await resolvePaymentVerificationToken(token)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const body = await req.json().catch(() => null)
  const action = body?.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  // Re-check current status fresh (not the possibly-stale value from the
  // resolver a moment ago) right before acting — the real guard against
  // double-submission (double-click, or re-opening an already-actioned
  // email days later) is this check, not link expiry.
  const { payment } = result
  if (payment.payment_status !== 'pending_verification') {
    return NextResponse.json(
      { error: `This payment was already marked "${payment.payment_status}" — no further action needed.` },
      { status: 409 },
    )
  }

  const adminKey = process.env.ADMIN_SECRET_KEY
  if (!adminKey) {
    console.error('[payment-verification POST] ADMIN_SECRET_KEY not configured — cannot relay to admin payments route')
    return NextResponse.json({ error: 'Server is not configured for this action yet. Please use the admin dashboard.' }, { status: 500 })
  }

  // Reuses the exact same logic the admin dashboard's Approve/Reject
  // buttons trigger (payment_status sync onto the booking, verification
  // status, and — on approve — the auto-advance to "Booking Confirmed"
  // with the customer WhatsApp) by calling that same, already-tested
  // route server-to-server, instead of re-implementing any of it here.
  const patchRes = await fetch(`${SITE.url}/api/admin/payments/${payment.id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
    body:    JSON.stringify({ payment_status: action === 'approve' ? 'paid' : 'rejected' }),
  })
  const patchData = await patchRes.json().catch(() => ({}))
  if (!patchRes.ok) {
    console.error('[payment-verification POST] internal PATCH to admin payments route failed:', patchData)
    return NextResponse.json({ error: patchData.error ?? 'Failed to update payment' }, { status: patchRes.status })
  }

  return NextResponse.json({
    success: true,
    action,
    message: action === 'approve'
      ? 'Payment approved. The booking has been auto-confirmed.'
      : 'Payment rejected. The customer will need to re-submit proof.',
  })
}
