// BAGDROP — lib/driver-details.ts
//
// Sends the "Driver Details Shared" customer message — Airport Delivery
// bookings only. Called from two places:
//   1. app/api/admin/bookings/[id]/route.ts — when the admin marks the
//      status (from the "Booking Workflow" stepper on
//      app/(admin)/admin/quotes/view/[lead_id]/page.tsx) and the flight
//      is already within 4 hours (send now).
//   2. app/api/cron/send-driver-details/route.ts — the Vercel Cron job
//      that picks up bookings scheduled for later (flight is more than
//      4 hours out when the admin clicked the status).
//
// Responsibilities (mirrors lib/lead-acknowledgment.ts):
//   1. Guarantee at-most-once send via an atomic "claim" UPDATE against
//      driver_details_sent_at — the database is the lock, not an
//      in-memory check, so concurrent cron ticks / admin retries can't
//      double-send.
//   2. Send via Email (always, if configured + address on file) and
//      WhatsApp (Fast2SMS template — pending Meta approval as of this
//      writing; fails gracefully and is logged like any other channel).
//   3. Record the send in bookings.status_history — the "booking history
//      / activity log" requirement — regardless of channel outcome, so
//      failures are visible too.
//
// Requires supabase/migrations/20260724_driver_details_shared.sql to have
// been run.

import { supabaseAdmin } from './supabase'
import { sendDriverDetailsEmail } from './email'
import { sendWhatsAppTemplateFast2SMS } from './notifications'

const SUPPORT_PHONE_DISPLAY = '+91 63571 15711'

interface BookingRow {
  id:                   string
  tracking_id:          string
  customer_name:        string | null
  customer_email:       string | null
  customer_phone:       string | null
  from_city:            string | null
  to_city:              string | null
  driver_name:          string | null
  driver_phone:         string | null
  vehicle_number:       string | null
  pickup_instructions:  string | null
  status_history:       Array<Record<string, unknown>> | null
}

// Airport Delivery routes always have "Airport" in exactly one of the two
// city labels (e.g. "Mumbai Airport (T2)") — pick that one; fall back to
// showing the full route if neither matches (shouldn't happen in practice).
function deriveAirportName(fromCity: string | null, toCity: string | null): string {
  const from = fromCity ?? ''
  const to   = toCity   ?? ''
  if (/airport/i.test(from)) return from
  if (/airport/i.test(to))   return to
  return [from, to].filter(Boolean).join(' → ') || 'Airport'
}

/**
 * Sends the driver-details message for a booking, if it hasn't been sent
 * already. Safe to call unconditionally — no-ops without error if already
 * sent (or if the booking id doesn't exist). Never throws.
 */
export async function sendDriverDetails(bookingId: string): Promise<void> {
  if (!bookingId) return

  try {
    // ── Atomic claim ────────────────────────────────────────────────
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('bookings')
      .update({ driver_details_sent_at: new Date().toISOString(), driver_details_scheduled_at: null })
      .eq('id', bookingId)
      .is('driver_details_sent_at', null)
      .select(`
        id, tracking_id, customer_name, customer_email, customer_phone,
        from_city, to_city, driver_name, driver_phone, vehicle_number,
        pickup_instructions, status_history
      `)
      .maybeSingle()

    if (claimErr) {
      console.error('[DriverDetails] Claim failed (migration 20260724_driver_details_shared.sql run?):', claimErr.message)
      return
    }
    if (!claimed) {
      // Already sent, or booking doesn't exist — no-op.
      return
    }

    const booking = claimed as unknown as BookingRow
    const name    = booking.customer_name?.trim() || 'Customer'
    const airportName = deriveAirportName(booking.from_city, booking.to_city)

    const channelResults: { channel: 'email' | 'whatsapp'; status: 'sent' | 'failed' | 'skipped'; detail: string | null }[] = []

    // ── Email ───────────────────────────────────────────────────────
    if (booking.customer_email) {
      const result = await sendDriverDetailsEmail({
        customerName:       name,
        customerEmail:       booking.customer_email,
        trackingId:          booking.tracking_id,
        driverName:          booking.driver_name    ?? 'To be assigned',
        driverPhone:         booking.driver_phone   ?? '—',
        vehicleNumber:       booking.vehicle_number ?? '—',
        airportName,
        pickupInstructions:  booking.pickup_instructions,
      })
      channelResults.push({
        channel: 'email',
        status:  result.success ? 'sent' : 'failed',
        detail:  result.success ? (result.id ?? null) : (result.error ?? 'Unknown error'),
      })
    } else {
      channelResults.push({ channel: 'email', status: 'skipped', detail: 'No email on file' })
    }

    // ── WhatsApp (Fast2SMS template — pending Meta approval) ─────────
    if (booking.customer_phone) {
      const templateId = process.env.FAST2SMS_DRIVER_DETAILS_MESSAGE_ID ?? ''
      const result = await sendWhatsAppTemplateFast2SMS(booking.customer_phone, templateId, [
        name,
        booking.driver_name    ?? 'To be assigned',
        booking.driver_phone   ?? '-',
        booking.vehicle_number ?? '-',
        airportName,
        booking.pickup_instructions ?? 'Please keep your phone reachable.',
        SUPPORT_PHONE_DISPLAY,
      ])
      channelResults.push({
        channel: 'whatsapp',
        status:  result.success ? 'sent' : 'failed',
        detail:  result.success ? (result.requestId ?? null) : (result.error ?? 'Unknown error'),
      })
    } else {
      channelResults.push({ channel: 'whatsapp', status: 'skipped', detail: 'No phone number on file' })
    }

    const sentChannels = channelResults.filter(c => c.status === 'sent').map(c => c.channel)
    const summaryNote  = 'Driver details ' +
      (sentChannels.length ? `sent via ${sentChannels.join(' + ')}` : 'send attempted — see channel log') +
      (channelResults.some(c => c.status === 'failed')
        ? ` (failed: ${channelResults.filter(c => c.status === 'failed').map(c => `${c.channel}: ${c.detail}`).join('; ')})`
        : '')

    // ── Log on the booking's activity log ────────────────────────────
    const history = Array.isArray(booking.status_history) ? booking.status_history : []
    history.push({
      from: 'driver_details_shared', to: 'driver_details_shared',
      timestamp: new Date().toISOString(), changed_by: 'system', note: summaryNote,
    })
    await supabaseAdmin.from('bookings').update({ status_history: history }).eq('id', booking.id)

    console.log(`[DriverDetails] Booking ${booking.tracking_id} — ${summaryNote}`)
  } catch (err) {
    console.error('[DriverDetails] Unexpected error (non-fatal):', err)
  }
}
