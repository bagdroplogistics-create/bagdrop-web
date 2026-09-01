// BAGDROP — lib/driver-details.ts
//
// Sends the "Driver Details Shared" customer message — destination-airport
// bookings only (Doorstep→Airport, Airport→Airport; see
// lib/service-type.ts's shouldShowDriverDetailsStep() for the exact gate —
// enforced in app/api/admin/bookings/[id]/route.ts before this ever runs).
// Called from two places:
//   1. app/api/admin/bookings/[id]/route.ts — when the admin clicks Share
//      Driver Details (sends immediately, no scheduling window).
//   2. app/api/cron/send-driver-details/route.ts — legacy scheduled-send
//      cron job, effectively unused now that sends are always immediate,
//      kept in place in case scheduling is reintroduced later.
//
// Responsibilities (mirrors lib/lead-acknowledgment.ts):
//   1. Guarantee at-most-once send via an atomic "claim" UPDATE against
//      driver_details_sent_at — the database is the lock, not an
//      in-memory check, so concurrent cron ticks / admin retries can't
//      double-send.
//   2. Send via Email (always, if configured + address on file) and
//      WhatsApp (Fast2SMS template — requires FAST2SMS_DRIVER_DETAILS_MESSAGE_ID
//      to be set to an *approved* template's Message ID; fails gracefully
//      and is logged like any other channel if not configured/approved yet).
//   3. Record the send in bookings.status_history — the "booking history
//      / activity log" requirement — regardless of channel outcome, so
//      failures are visible too.
//
// Requires supabase/migrations/20260724_driver_details_shared.sql to have
// been run.
//
// Message content is intentionally minimal — driver name + driver mobile
// only. The WhatsApp template registered in Fast2SMS for
// FAST2SMS_DRIVER_DETAILS_MESSAGE_ID must take exactly 3 variables in this
// order: {{1}} customer name, {{2}} driver name, {{3}} driver mobile.

import { supabaseAdmin } from './supabase'
import { sendDriverDetailsEmail } from './email'
import { sendWhatsAppTemplate } from './notifications'

interface BookingRow {
  id:              string
  tracking_id:     string
  customer_name:   string | null
  customer_email:  string | null
  customer_phone:  string | null
  driver_name:     string | null
  driver_phone:    string | null
  status_history:  Array<Record<string, unknown>> | null
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
      .select('id, tracking_id, customer_name, customer_email, customer_phone, driver_name, driver_phone, status_history')
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

    const channelResults: { channel: 'email' | 'whatsapp'; status: 'sent' | 'failed' | 'skipped'; detail: string | null }[] = []

    // ── Email ───────────────────────────────────────────────────────
    if (booking.customer_email) {
      const result = await sendDriverDetailsEmail({
        customerName:  name,
        customerEmail: booking.customer_email,
        trackingId:    booking.tracking_id,
        driverName:    booking.driver_name  ?? 'To be assigned',
        driverPhone:   booking.driver_phone ?? '—',
      })
      channelResults.push({
        channel: 'email',
        status:  result.success ? 'sent' : 'failed',
        detail:  result.success ? (result.id ?? null) : (result.error ?? 'Unknown error'),
      })
    } else {
      channelResults.push({ channel: 'email', status: 'skipped', detail: 'No email on file' })
    }

    // ── WhatsApp ────────────────────────────────────────────────────
    // Routed via sendWhatsAppTemplate() (lib/notifications.ts) — Indian
    // numbers through Fast2SMS, everyone else straight through Meta's
    // Cloud API (Fast2SMS restricts all international WhatsApp sending
    // account-wide as of 2026-09-01). Template name
    // 'driver_details_shared_v2' confirmed Approved, 3 variables, via
    // Fast2SMS's live template list on 2026-09-01. Variables:
    // {{1}} customer name, {{2}} driver name, {{3}} driver mobile.
    if (booking.customer_phone) {
      const result = await sendWhatsAppTemplate(booking.customer_phone, 'driver_details_shared_v2', [
        name,
        booking.driver_name  ?? 'To be assigned',
        booking.driver_phone ?? '-',
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
      ` — Driver: ${booking.driver_name ?? '—'} (${booking.driver_phone ?? '—'})` +
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
