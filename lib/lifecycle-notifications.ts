// BAGDROP — lib/lifecycle-notifications.ts
//
// Fires the matching Fast2SMS WhatsApp template whenever a booking's status
// advances to one of the mapped lifecycle stages (see FAST2SMS_TEMPLATES.md
// for the exact template text + variable order submitted to Meta for each).
// Called from app/api/admin/bookings/[id]/route.ts's generic status-change
// block — runs *alongside* whatever else already happens for that status
// (the existing "Send Quote via WhatsApp" wa.me link, the payment-request
// email, etc.); nothing existing is replaced.
//
// Deliberately NOT used for 'driver_details_shared' — that one has its own
// dedicated orchestrator (lib/driver-details.ts) with an atomic claim guard
// decoupled from the generic status flow. Everything here is simpler:
// one WhatsApp send, best-effort, logged either way, never thrown.

import { supabaseAdmin } from './supabase'
import { sendWhatsAppTemplateFast2SMS } from './notifications'
import { formatCustomerName } from './constants'

// Full booking status sequence (superset — includes the airport-only
// 'driver_details_shared' step, harmless for non-airport bookings since
// that value is simply never reached there). Used only to tell forward
// progress apart from a backward move (Previous Step / doMoveBack) so
// lifecycle WhatsApp templates never re-fire when an admin reverts a status.
// Shared (not duplicated) across every caller that changes booking status —
// app/api/admin/bookings/[id]/route.ts (single-booking edits) AND
// app/api/admin/trip-sheets/[id]/route.ts (driver trip status sync) both
// need the exact same forward/backward check.
export const STATUS_ORDER = [
  'inquiry', 'quote_created', 'quote_sent', 'accepted',
  'payment_pending', 'payment_received', 'payment_approved',
  'confirmed', 'indemnity_bond_sent', 'indemnity_bond_signed',
  'invoice_generated', 'invoice_sent',
  'pickup_scheduled', 'picked_up', 'in_transit',
  'out_for_delivery', 'driver_details_shared', 'delivered',
  'trip_created', 'completed',
]

export function isForwardMove(oldStatus: string | null | undefined, newStatus: string): boolean {
  if (!oldStatus) return true
  const oldIdx = STATUS_ORDER.indexOf(oldStatus)
  const newIdx = STATUS_ORDER.indexOf(newStatus)
  // Unknown/unlisted status on either side (e.g. 'rejected', a terminal
  // branch not part of the main sequence) — default to allowing the send,
  // matching the same "unknown defaults to advanceable" rule used in
  // generate-quote's canUpdateStatus.
  if (oldIdx === -1 || newIdx === -1) return true
  return newIdx > oldIdx
}

interface BookingLike {
  id:                 string
  tracking_id:        string
  title?:             string | null
  customer_name:      string | null
  customer_phone:     string | null
  from_city:          string | null
  to_city:            string | null
  total_bags:         number | null
  total_amount:        number | null
  pickup_date:        string | null
  drop_address:       string | null
  service_label:      string | null
  service_type:       string | null
  status_history:     Array<Record<string, unknown>> | null
}

// Maps a booking status to the Vercel env var holding that template's
// approved Fast2SMS Message ID. Template bodies + variable order are in
// FAST2SMS_TEMPLATES.md — keep both in sync if either changes.
const ENV_VAR_BY_STATUS: Record<string, string> = {
  quote_sent:       'FAST2SMS_QUOTE_SENT_MESSAGE_ID',
  accepted:         'FAST2SMS_QUOTE_ACCEPTED_MESSAGE_ID',
  rejected:         'FAST2SMS_QUOTE_REJECTED_MESSAGE_ID',
  payment_pending:  'FAST2SMS_PAYMENT_REQUEST_MESSAGE_ID',
  payment_received: 'FAST2SMS_PAYMENT_RECEIVED_MESSAGE_ID',
  confirmed:        'FAST2SMS_BOOKING_CONFIRMED_MESSAGE_ID',
  picked_up:        'FAST2SMS_BAGS_PICKED_UP_MESSAGE_ID',
  in_transit:       'FAST2SMS_BAGS_IN_TRANSIT_MESSAGE_ID',
  out_for_delivery: 'FAST2SMS_OUT_FOR_DELIVERY_MESSAGE_ID',
  delivered:        'FAST2SMS_BAGS_DELIVERED_MESSAGE_ID',
}

function fmtRs(n: number | null | undefined): string {
  return '₹' + Math.round(Number(n ?? 0)).toLocaleString('en-IN')
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

// payment_request's template has an Image header (the UPI QR code). Fast2SMS
// requires the header media to be supplied per-send via media_url — it is
// NOT automatically reused from the sample image submitted at template
// approval time. This QR is static (encodes only the fixed UPI ID, no
// amount), so one hosted image works for every booking; must live under
// /public so Vercel serves it at this exact path.
const PAYMENT_QR_MEDIA_URL = 'https://bagdrop.co/bagdrop_upi_qr.png'

/**
 * Fires the lifecycle WhatsApp template for this status, if one is mapped
 * and the booking has a phone number on file. Safe to call unconditionally
 * — no-ops without error if there's no template for this status. Never
 * throws, so it can never turn a successful status update into a failed
 * request even if Fast2SMS is unreachable or the template isn't configured.
 */
export async function sendLifecycleWhatsApp(status: string, booking: BookingLike): Promise<void> {
  try {
    const envVar = ENV_VAR_BY_STATUS[status]
    if (!envVar) return // no template mapped for this status — nothing to do

    if (!booking.customer_phone) {
      console.log(`[LifecycleWhatsApp] Booking ${booking.tracking_id} — skipped (${status}): no phone on file`)
      return
    }

    const templateId = process.env[envVar] ?? ''
    const name        = (formatCustomerName(booking.title, booking.customer_name) || booking.customer_name?.trim()) || 'Customer'
    const route       = [booking.from_city, booking.to_city].filter(Boolean).join(' → ')

    let variables: string[] = []

    if (status === 'quote_sent' || status === 'accepted' || status === 'rejected') {
      // These three need the quote number, which lives on the linked lead,
      // not the booking itself.
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('quote_number, quote_total, bags_count')
        .eq('booking_id', booking.id)
        .maybeSingle()
      const quoteNumber = lead?.quote_number ?? booking.tracking_id

      if (status === 'quote_sent') {
        variables = [
          name,
          quoteNumber,
          route,
          String(lead?.bags_count ?? booking.total_bags ?? 1),
          fmtRs(lead?.quote_total ?? booking.total_amount),
        ]
      } else {
        variables = [name, quoteNumber]
      }
    } else if (status === 'payment_pending') {
      variables = [name, booking.tracking_id, fmtRs(booking.total_amount)]
    } else if (status === 'payment_received') {
      variables = [name, booking.tracking_id, fmtRs(booking.total_amount), fmtDate(new Date().toISOString())]
    } else if (status === 'confirmed') {
      variables = [
        name, booking.tracking_id,
        booking.service_label || booking.service_type || 'Baggage Delivery',
        booking.pickup_date ? fmtDate(booking.pickup_date) : 'To be confirmed',
        route,
      ]
    } else if (status === 'picked_up') {
      variables = [name, booking.tracking_id, new Date().toLocaleString('en-IN'), String(booking.total_bags ?? 1)]
    } else if (status === 'in_transit' || status === 'out_for_delivery') {
      variables = [name, booking.tracking_id]
    } else if (status === 'delivered') {
      variables = [name, booking.tracking_id, fmtDate(new Date().toISOString()), booking.drop_address || route || '—']
    }

    // payment_pending is the only stage whose approved template has a media
    // (Image) header — the QR code — so it's the only one that needs media_url.
    const mediaUrl = status === 'payment_pending' ? PAYMENT_QR_MEDIA_URL : undefined

    const result = await sendWhatsAppTemplateFast2SMS(booking.customer_phone, templateId, variables, mediaUrl)

    const note = `WhatsApp (${status}) ` +
      (result.success ? `sent — request_id ${result.requestId ?? '—'}` : `failed — ${result.error}`)

    const history = Array.isArray(booking.status_history) ? booking.status_history : []
    history.push({ from: status, to: status, timestamp: new Date().toISOString(), changed_by: 'system', note })
    await supabaseAdmin.from('bookings').update({ status_history: history }).eq('id', booking.id)

    console.log(`[LifecycleWhatsApp] Booking ${booking.tracking_id} — ${note}`)
  } catch (err) {
    console.error('[LifecycleWhatsApp] Unexpected error (non-fatal):', err)
  }
}
