import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendIndemnityBondEmail } from '@/lib/email'
import { generateSecureToken, getIndemnityExpiryDays, sendIndemnityWhatsApp } from '@/lib/indemnity-notifications'
import { resolveIndemnityToken } from '@/lib/indemnity-token'

export const runtime = 'nodejs'

// ── POST /api/admin/bookings/[id]/indemnity/send ─────────────────────
// Step 1 of the Indemnity Bond flow. Admin clicks "Send Indemnity Bond" on
// a Booking Confirmed booking. Creates (or refreshes, if re-sending) the
// secure token, emails the signing link now, fires the WhatsApp template
// additively (no-ops until a Meta-approved template + env var exist — see
// lib/indemnity-notifications.ts), and advances the booking to
// indemnity_bond_sent.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, status, status_history, customer_name, customer_phone, customer_email')
    .eq('id', id)
    .single()

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const expiryDays = await getIndemnityExpiryDays()
  const secureToken = generateSecureToken()
  const tokenExpiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()

  // One row per booking — upsert so re-sending (e.g. link expired) simply
  // refreshes the token instead of creating a duplicate bond record.
  const { data: existingBond } = await supabaseAdmin
    .from('indemnity_bonds')
    .select('id, sent_at')
    .eq('booking_id', id)
    .maybeSingle()

  // Idempotency guard — blocks an accidental re-send (double-click, or the
  // admin clicking again before the UI shows success) from re-sending the
  // email/WhatsApp and re-advancing the status a second time. A genuine
  // re-send (e.g. link expired days later) is well outside this window and
  // still goes through normally.
  const COOLDOWN_MS = 2 * 60 * 1000 // 2 minutes
  if (existingBond?.sent_at) {
    const elapsedMs = Date.now() - new Date(existingBond.sent_at).getTime()
    if (elapsedMs < COOLDOWN_MS) {
      return NextResponse.json(
        { error: `Indemnity bond link was already sent ${Math.round(elapsedMs / 1000)}s ago. Please wait a moment before sending again.` },
        { status: 429 },
      )
    }
  }

  const sentVia: string[] = []
  if (booking.customer_email) sentVia.push('email')
  if (booking.customer_phone) sentVia.push('whatsapp') // recorded regardless of template-approval status — the send itself is best-effort/additive

  const bondPayload = {
    booking_id:        id,
    secure_token:      secureToken,
    token_expires_at:  tokenExpiresAt,
    sent_at:           new Date().toISOString(),
    sent_via:          sentVia,
    // Resetting these in case this is a re-send after an earlier expired attempt
    otp_verified:      false,
    otp_verified_at:   null,
    document_status:   'pending',
  }

  const { error: upsertErr } = existingBond
    ? await supabaseAdmin.from('indemnity_bonds').update(bondPayload).eq('id', existingBond.id)
    : await supabaseAdmin.from('indemnity_bonds').insert(bondPayload)

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // Pre-flight self-check — confirm the link we're about to email/WhatsApp
  // actually resolves before sending it out. Catches any bond/booking
  // consistency issue (e.g. an FK edge case, RLS, schema-cache lag) at
  // send-time with a clear server-side error, instead of only surfacing it
  // later when the customer or admin opens a link that turns out broken.
  const preflight = await resolveIndemnityToken(secureToken)
  if (!preflight.ok) {
    console.error(`[indemnity send] Booking ${id} — generated link failed its own resolve check: ${preflight.error}`)
    return NextResponse.json(
      { error: `Link was created but failed a consistency check (${preflight.error}). Nothing was sent — please try again or contact support.` },
      { status: 500 },
    )
  }

  const secureLink = `https://www.bagdrop.co/indemnity/${secureToken}`

  // Email — works today (Resend already configured)
  if (booking.customer_email) {
    await sendIndemnityBondEmail({
      customerName:  booking.customer_name,
      customerEmail: booking.customer_email,
      trackingId:    booking.tracking_id,
      secureLink,
      expiryDays,
    })
  }

  // WhatsApp — approved template "indemnity_bond_sent" has exactly 2 body
  // variables: {{1}} name, {{2}} secure link. Do not add a 3rd value here —
  // that previously shifted the link out of {{2}} and showed the tracking
  // ID in its place instead (confirmed against the live Meta template).
  await sendIndemnityWhatsApp('bond_sent', {
    customerPhone: booking.customer_phone,
    customerName:  booking.customer_name,
    trackingId:    booking.tracking_id,
  }, [booking.customer_name ?? 'Customer', secureLink])

  // Advance booking status + history
  const history = (booking.status_history ?? []) as object[]
  history.push({
    from:       booking.status,
    to:         'indemnity_bond_sent',
    timestamp:  new Date().toISOString(),
    changed_by: 'admin',
    note:       `Indemnity bond link sent (expires in ${expiryDays} days)`,
  })

  const { error: statusErr } = await supabaseAdmin
    .from('bookings')
    .update({ status: 'indemnity_bond_sent', status_history: history })
    .eq('id', id)

  if (statusErr) {
    return NextResponse.json({ error: statusErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, secure_link: secureLink, expires_at: tokenExpiresAt })
}
