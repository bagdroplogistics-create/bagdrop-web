import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAdminRole } from '@/lib/admin-auth'
import { sendIndemnityBondStatusEmail } from '@/lib/email'
import { generateSecureToken, getIndemnityExpiryDays, sendIndemnityWhatsApp } from '@/lib/indemnity-notifications'

export const runtime = 'nodejs'

type Action = 'approve' | 'reject' | 'request_resubmission'
const VALID_ACTIONS: Action[] = ['approve', 'reject', 'request_resubmission']

// ── POST /api/admin/bookings/[id]/indemnity/review ────────────────────
// Step 8 admin actions on a submitted bond — Approve / Reject / Request
// Resubmission (Phase 2). Body: { action: 'approve' | 'reject' |
// 'request_resubmission', note?: string }
//
// 'request_resubmission' re-opens the customer's link: it generates a
// fresh secure_token + expiry and clears submitted_at, since
// resolveIndemnityToken() otherwise permanently locks a bond the moment
// it's submitted (by design — a signed legal document shouldn't be
// silently re-editable). The customer gets a new email/WhatsApp with the
// new link, same as the original Step 1 send.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const role = getAdminRole(req)
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params

  const body = await req.json().catch(() => null)
  const action: Action | undefined = body?.action
  const note: string | null = body?.note?.trim() || null

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
  }

  const { data: bond, error: bondErr } = await supabaseAdmin
    .from('indemnity_bonds')
    .select('*')
    .eq('booking_id', id)
    .maybeSingle()

  if (bondErr) return NextResponse.json({ error: bondErr.message }, { status: 500 })
  if (!bond) return NextResponse.json({ error: 'No indemnity bond found for this booking' }, { status: 404 })
  if (!bond.submitted_at) {
    return NextResponse.json({ error: 'This bond has not been submitted yet — nothing to review' }, { status: 409 })
  }

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, status, status_history, customer_name, customer_phone, customer_email')
    .eq('id', id)
    .single()

  if (bookingErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const now = new Date().toISOString()
  const adminLabel = role === 'admin' ? 'admin' : 'staff'

  if (action === 'approve') {
    const { error } = await supabaseAdmin
      .from('indemnity_bonds')
      .update({
        document_status: 'approved',
        reviewed_by:      adminLabel,
        reviewed_at:       now,
        review_note:       note,
        status_history: [...(bond.status_history ?? []), { event: 'approved', timestamp: now, note }],
      })
      .eq('id', bond.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Awaited (not fire-and-forget) before the response returns — same fix
    // applied across every indemnity route this session, since unawaited
    // background sends risk being cut off by Vercel's serverless runtime
    // once the response has gone out.
    if (booking.customer_email) {
      await sendIndemnityBondStatusEmail({
        customerName:  booking.customer_name ?? 'Customer',
        customerEmail: booking.customer_email,
        trackingId:    booking.tracking_id,
        headline:      'Indemnity Bond Approved',
        message:       'your signed indemnity bond and documents have been reviewed and approved. No further action is needed.',
      }).catch(() => {})
    }
    await sendIndemnityWhatsApp('documents_approved', {
      customerPhone: booking.customer_phone, customerName: booking.customer_name, trackingId: booking.tracking_id,
    }, [booking.customer_name ?? 'Customer', booking.tracking_id]).catch(() => {})

    return NextResponse.json({ success: true, document_status: 'approved' })
  }

  if (action === 'reject') {
    const { error } = await supabaseAdmin
      .from('indemnity_bonds')
      .update({
        document_status: 'rejected',
        reviewed_by:      adminLabel,
        reviewed_at:       now,
        review_note:       note,
        status_history: [...(bond.status_history ?? []), { event: 'rejected', timestamp: now, note }],
      })
      .eq('id', bond.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (booking.customer_email) {
      await sendIndemnityBondStatusEmail({
        customerName:  booking.customer_name ?? 'Customer',
        customerEmail: booking.customer_email,
        trackingId:    booking.tracking_id,
        headline:      'Indemnity Bond — Action Required',
        message:       'there was an issue with your submitted documents' + (note ? ': ' + note : '.') + ' Our team will contact you shortly.',
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, document_status: 'rejected' })
  }

  // request_resubmission — re-open the link
  const expiryDays = await getIndemnityExpiryDays()
  const secureToken = generateSecureToken()
  const tokenExpiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
  const secureLink = `https://bagdrop.co/indemnity/${secureToken}`

  const { error } = await supabaseAdmin
    .from('indemnity_bonds')
    .update({
      document_status:   'resubmission_requested',
      reviewed_by:         adminLabel,
      reviewed_at:          now,
      review_note:          note,
      secure_token:         secureToken,
      token_expires_at:     tokenExpiresAt,
      submitted_at:         null, // re-opens resolveIndemnityToken() access
      status_history: [...(bond.status_history ?? []), { event: 'resubmission_requested', timestamp: now, note }],
    })
    .eq('id', bond.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (booking.customer_email) {
    await sendIndemnityBondStatusEmail({
      customerName:  booking.customer_name ?? 'Customer',
      customerEmail: booking.customer_email,
      trackingId:    booking.tracking_id,
      headline:      'Please Resubmit Your Indemnity Bond',
      message:       'we need you to review and resubmit your indemnity bond' + (note ? ': ' + note : '.') + ' Please use the link below.',
      secureLink,
    }).catch(() => {})
  }
  await sendIndemnityWhatsApp('resubmission_requested', {
    customerPhone: booking.customer_phone, customerName: booking.customer_name, trackingId: booking.tracking_id,
  }, [booking.customer_name ?? 'Customer', booking.tracking_id, secureLink]).catch(() => {})

  // Booking's workflow status also needs to go back so Step 7c reappears
  // for tracking — otherwise the admin has no visibility that a bond is
  // waiting on the customer again.
  const history = (booking.status_history ?? []) as object[]
  history.push({
    from: booking.status, to: 'indemnity_bond_sent', timestamp: now,
    changed_by: 'admin', note: `Resubmission requested${note ? ': ' + note : ''}`,
  })
  await supabaseAdmin.from('bookings').update({ status: 'indemnity_bond_sent', status_history: history }).eq('id', id)

  return NextResponse.json({ success: true, document_status: 'resubmission_requested', secure_link: secureLink })
}
