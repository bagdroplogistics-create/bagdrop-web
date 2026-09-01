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
import { sendWhatsAppTemplate } from './notifications'
import { formatCustomerName } from './constants'
import { getQuotePdfUrl, type LeadRowForPdf } from './quote-pdf'

// STATUS_ORDER / ACTIVE_BOOKING_STATUSES / isForwardMove moved to
// lib/booking-status.ts (2026-08-24) — that file has zero imports, so it's
// safe for client components too (this file imports supabaseAdmin above,
// which is NOT safe to bundle client-side). Re-exported here so every
// existing server-side importer of this file keeps working unchanged.
export { STATUS_ORDER, ACTIVE_BOOKING_STATUSES, isForwardMove } from './booking-status'

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

// Maps a booking status to its approved Fast2SMS/Meta template NAME.
// Migrated 2026-09-01 off the old env-var → numeric Message ID indirection
// (see sendWhatsAppTemplateFast2SMSv2's module comment in
// lib/notifications.ts for why: the old GET endpoint these IDs pointed at
// cannot reach non-Indian numbers at all). Hardcoded rather than re-routed
// through new env vars — every name below was confirmed directly against
// the account's live template list (GET /dev/dlt_manager/whatsapp?type=template)
// on 2026-09-01; re-confirm there before changing one. Template bodies +
// variable order are in FAST2SMS_TEMPLATES.md — keep both in sync.
//
// booking_confirmed_v2 and bags_delivered were picked deliberately over
// other approved variants: booking_confirmed_v2 is the current version of
// that template (v1 superseded); bags_delivered (plain UTILITY) was used
// instead of bags_delivered_review (which bakes in a Google-review CTA)
// because review requests are already handled separately by
// components/admin/ReviewPanel.tsx's own manual flow — sending both would
// double up. quote_sent_v2 (adds a Document header with the quote PDF) was
// "Pending" Meta approval as of 2026-09-01 — now Approved (confirmed via
// Fast2SMS's template dashboard), so it's used here instead of the plain
// quote_sent (no header) template. Same body/variable order as the plain
// version — only the header is new. See the quote_sent branch below for
// the PDF-header wiring.
const TEMPLATE_BY_STATUS: Record<string, string> = {
  quote_sent:       'quote_sent_v2',
  accepted:         'quote_accepted',
  rejected:         'quote_rejected',
  payment_pending:  'payment_request',
  payment_received: 'payment_received',
  confirmed:        'booking_confirmed_v2',
  picked_up:        'bags_picked_up',
  in_transit:       'bags_in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered:        'bags_delivered',
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
const PAYMENT_QR_MEDIA_URL = 'https://www.bagdrop.co/bagdrop_upi_qr.png'

/**
 * Fires the lifecycle WhatsApp template for this status, if one is mapped
 * and the booking has a phone number on file. Safe to call unconditionally
 * — no-ops without error if there's no template for this status. Never
 * throws, so it can never turn a successful status update into a failed
 * request even if Fast2SMS is unreachable or the template isn't configured.
 */
export async function sendLifecycleWhatsApp(status: string, booking: BookingLike): Promise<void> {
  try {
    const templateName = TEMPLATE_BY_STATUS[status]
    if (!templateName) return // no template mapped for this status — nothing to do

    if (!booking.customer_phone) {
      console.log(`[LifecycleWhatsApp] Booking ${booking.tracking_id} — skipped (${status}): no phone on file`)
      return
    }

    const name        = (formatCustomerName(booking.title, booking.customer_name) || booking.customer_name?.trim()) || 'Customer'
    const route       = [booking.from_city, booking.to_city].filter(Boolean).join(' → ')

    let variables: string[] = []
    let quotePdfHeader: { type: 'document'; url: string; filename: string } | undefined

    if (status === 'quote_sent' || status === 'accepted' || status === 'rejected') {
      // These three need the quote number, which lives on the linked lead,
      // not the booking itself. Full row (not a narrow select) because
      // quote_sent additionally needs everything getQuotePdfUrl/
      // LeadRowForPdf reads to regenerate the PDF for the template's
      // Document header.
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('*')
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
        // quote_sent_v2's approved template has a Document header — the
        // quote PDF itself. getQuotePdfUrl() always regenerates fresh off
        // the lead's current row (see lib/quote-pdf.ts), so this can never
        // attach a stale/previous quote. If PDF generation fails, this
        // throws up to the outer try/catch below — the WhatsApp send for
        // this booking is skipped and logged, same as any other transient
        // failure, rather than sending a Document-header template with no
        // document attached.
        if (lead) {
          const { url, filename } = await getQuotePdfUrl(lead as LeadRowForPdf)
          quotePdfHeader = { type: 'document', url, filename }
        }
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

    // payment_pending's template has an Image header (the QR code);
    // quote_sent's (quote_sent_v2) has a Document header (the quote PDF,
    // built above). Every other status's template has a plain text header
    // (or none), so no header param is needed for those.
    const header = status === 'payment_pending'
      ? { type: 'image' as const, url: PAYMENT_QR_MEDIA_URL }
      : status === 'quote_sent'
      ? quotePdfHeader
      : undefined

    // Routed via sendWhatsAppTemplate() (lib/notifications.ts) — Indian
    // numbers through Fast2SMS, everyone else straight through Meta's
    // Cloud API (Fast2SMS restricts all international WhatsApp sending
    // account-wide; see that function's module comment for the full
    // 2026-09-01 root cause).
    const result = await sendWhatsAppTemplate(booking.customer_phone, templateName, variables, header)

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
