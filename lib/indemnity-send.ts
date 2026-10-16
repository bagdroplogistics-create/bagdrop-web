import { supabaseAdmin } from '@/lib/supabase'
import { sendIndemnityBondEmail } from '@/lib/email'
import { generateSecureToken, getIndemnityExpiryDays, sendIndemnityWhatsApp } from '@/lib/indemnity-notifications'
import { resolveIndemnityToken } from '@/lib/indemnity-token'

// Step 1 of the Indemnity Bond flow, shared by the admin "Send Indemnity Bond" button
// (app/api/admin/bookings/[id]/indemnity/send) and the automatic send after Aadhaar verification.
// Logic moved unchanged from the admin route.

export type SendBondResult =
  | { ok: true; secureLink: string; expiresAt: string }
  | { ok: false; status: number; error: string }

export async function sendIndemnityBondForBooking(id: string, adminApprove = false): Promise<SendBondResult> {
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, status, status_history, customer_name, customer_phone, customer_email')
    .eq('id', id)
    .single()

  if (bookingErr || !booking) return { ok: false, status: 404, error: 'Booking not found' }

  const expiryDays = await getIndemnityExpiryDays()
  const secureToken = generateSecureToken()
  const tokenExpiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: existingBond } = await supabaseAdmin
    .from('indemnity_bonds')
    .select('id, sent_at')
    .eq('booking_id', id)
    .maybeSingle()

  // Idempotency guard — blocks an accidental re-send within 2 minutes.
  const COOLDOWN_MS = 2 * 60 * 1000
  if (existingBond?.sent_at) {
    const elapsedMs = Date.now() - new Date(existingBond.sent_at).getTime()
    if (elapsedMs < COOLDOWN_MS) {
      return { ok: false, status: 429, error: `Indemnity bond link was already sent ${Math.round(elapsedMs / 1000)}s ago. Please wait a moment before sending again.` }
    }
  }

  const sentVia: string[] = []
  if (booking.customer_email) sentVia.push('email')
  if (booking.customer_phone) sentVia.push('whatsapp')

  const bondPayload = {
    booking_id:        id,
    secure_token:      secureToken,
    token_expires_at:  tokenExpiresAt,
    sent_at:           new Date().toISOString(),
    sent_via:          sentVia,
    otp_verified:      false,
    otp_verified_at:   null,
    document_status:   'pending',
  }

  const { error: upsertErr } = existingBond
    ? await supabaseAdmin.from('indemnity_bonds').update(bondPayload).eq('id', existingBond.id)
    : await supabaseAdmin.from('indemnity_bonds').insert(bondPayload)
  if (upsertErr) return { ok: false, status: 500, error: upsertErr.message }

  const preflight = await resolveIndemnityToken(secureToken)
  if (!preflight.ok) {
    console.error(`[indemnity send] Booking ${id} — generated link failed its own resolve check: ${preflight.error}`)
    return { ok: false, status: 500, error: `Link was created but failed a consistency check (${preflight.error}). Nothing was sent — please try again or contact support.` }
  }

  const secureLink = `https://www.bagdrop.co/indemnity/${secureToken}`

  if (!adminApprove) {
    if (booking.customer_email) {
      await sendIndemnityBondEmail({
        customerName:  booking.customer_name,
        customerEmail: booking.customer_email,
        trackingId:    booking.tracking_id,
        secureLink,
        expiryDays,
      })
    }
    // Approved WhatsApp template "indemnity_bond_sent": exactly 2 body variables ({{1}} name, {{2}} link).
    await sendIndemnityWhatsApp('bond_sent', {
      customerPhone: booking.customer_phone,
      customerName:  booking.customer_name,
      trackingId:    booking.tracking_id,
    }, [booking.customer_name ?? 'Customer', secureLink])
  }

  const history = (booking.status_history ?? []) as object[]
  history.push({
    from:       booking.status,
    to:         'indemnity_bond_sent',
    timestamp:  new Date().toISOString(),
    changed_by: 'admin',
    note:       adminApprove
      ? `Indemnity bond link generated (expires in ${expiryDays} days) — Admin Approve: no customer notification sent`
      : `Indemnity bond link sent (expires in ${expiryDays} days)`,
  })

  const { error: statusErr } = await supabaseAdmin
    .from('bookings')
    .update({ status: 'indemnity_bond_sent', status_history: history })
    .eq('id', id)
  if (statusErr) return { ok: false, status: 500, error: statusErr.message }

  return { ok: true, secureLink, expiresAt: tokenExpiresAt }
}

// Called right after Aadhaar is verified. Sends the bond ONLY when the booking is at "confirmed"
// (paid and approved) and no bond has been sent yet, so an unconfirmed request never gets one
// and the admin's manual button keeps working. Never throws.
export async function sendBondAfterVerification(verificationId: string): Promise<void> {
  try {
    const { data: b } = await supabaseAdmin.from('bookings')
      .select('id, status, tracking_id').eq('identity_verification_id', verificationId).maybeSingle()
    if (!b || b.status !== 'confirmed') return
    const { data: bond } = await supabaseAdmin.from('indemnity_bonds').select('sent_at').eq('booking_id', b.id).maybeSingle()
    if (bond?.sent_at) return
    const r = await sendIndemnityBondForBooking(b.id, false)
    if (!r.ok) console.error(`[identity] auto bond for ${b.tracking_id} failed: ${r.error}`)
    else console.log(`[identity] indemnity bond emailed for ${b.tracking_id} after Aadhaar verification`)
  } catch (e) {
    console.error('[identity] auto bond error:', e)
  }
}
