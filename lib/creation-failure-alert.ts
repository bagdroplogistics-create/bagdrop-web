// BAGDROP — lib/creation-failure-alert.ts
//
// Called from every inquiry-creation route (admin/leads, contact form,
// #Y2K form, website booking, Skybird B2B) whenever a booking or lead
// insert fails AFTER a BDA/BDL number has already been minted from the
// atomic counter — see supabase/migrations/20260822_inquiry_creation_
// failures.sql for the full incident this exists to catch (2026-08-22:
// BDA-2026-0114/0115/0117 vanished with zero trace and zero visibility
// to the founder until days later).
//
// Does two things, both best-effort/non-fatal — this must NEVER cause the
// caller's own request to fail just because the alert itself couldn't be
// written or sent:
//   1. Writes a permanent row to inquiry_creation_failures (best-effort —
//      no-ops with a console.warn if the migration hasn't been run yet).
//   2. Emails info@/aditya@ immediately via lib/email.ts's sendEmail(), so
//      this is caught the same day rather than discovered as a numbering
//      gap with no explanation.

import { supabaseAdmin } from './supabase'
import { sendEmail } from './email'

export interface CreationFailureDetails {
  source:         string   // 'admin-leads' | 'contact-form' | 'y2k-inquiry' | 'website-booking' | 'skybird-leads' | 'skybird-bookings' | etc.
  trackingId?:    string | null
  leadNumber?:    string | null
  failureStage:   'booking_insert' | 'lead_insert' | 'both'
  customerName?:  string | null
  customerPhone?: string | null
  customerEmail?: string | null
  errorMessage:   string
}

export async function alertCreationFailure(details: CreationFailureDetails): Promise<void> {
  let alertSent = false

  try {
    const subject = `⚠️ Inquiry creation failed — ${details.trackingId ?? details.leadNumber ?? 'number burned with no record'}`
    const html = `
      <div style="font-family:sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
        <p style="font-size:16px;font-weight:700;color:#dc2626;margin:0 0 12px">
          An inquiry number was consumed but the record was never saved.
        </p>
        <table cellpadding="6" style="border-collapse:collapse">
          <tr><td style="color:#6b7280">Source</td><td style="font-weight:600">${escapeHtml(details.source)}</td></tr>
          <tr><td style="color:#6b7280">Tracking ID</td><td style="font-weight:600">${escapeHtml(details.trackingId ?? '—')}</td></tr>
          <tr><td style="color:#6b7280">Lead Number</td><td style="font-weight:600">${escapeHtml(details.leadNumber ?? '—')}</td></tr>
          <tr><td style="color:#6b7280">Failed at</td><td style="font-weight:600">${escapeHtml(details.failureStage)}</td></tr>
          <tr><td style="color:#6b7280">Customer Name</td><td style="font-weight:600">${escapeHtml(details.customerName ?? '—')}</td></tr>
          <tr><td style="color:#6b7280">Customer Phone</td><td style="font-weight:600">${escapeHtml(details.customerPhone ?? '—')}</td></tr>
          <tr><td style="color:#6b7280">Customer Email</td><td style="font-weight:600">${escapeHtml(details.customerEmail ?? '—')}</td></tr>
          <tr><td style="color:#6b7280">Error</td><td style="font-weight:600;color:#dc2626">${escapeHtml(details.errorMessage)}</td></tr>
        </table>
        <p style="margin-top:16px;color:#6b7280">
          If this looks like a real customer (not a bot probe), reach out to them
          directly using the phone/email above — their inquiry never made it into
          the system. If a booking record exists for this tracking ID with no
          linked lead, it can be repaired via
          <code>/api/admin/repair/create-lead-for-booking</code>.
        </p>
      </div>
    `
    const result = await sendEmail(
      ['info@bagdrop.co', 'aditya@bagdrop.co'],
      subject,
      html,
      'creation-failure-alert'
    )
    alertSent = result.success
  } catch (err) {
    console.error('[CreationFailureAlert] Email send threw:', err)
  }

  try {
    const { error } = await supabaseAdmin.from('inquiry_creation_failures').insert({
      source:         details.source,
      tracking_id:    details.trackingId ?? null,
      lead_number:    details.leadNumber ?? null,
      failure_stage:  details.failureStage,
      customer_name:  details.customerName ?? null,
      customer_phone: details.customerPhone ?? null,
      customer_email: details.customerEmail ?? null,
      error_message:  details.errorMessage,
      alert_sent:     alertSent,
    })
    if (error) {
      console.warn('[CreationFailureAlert] Could not write audit row (has 20260822_inquiry_creation_failures.sql been run?):', error.message)
    }
  } catch (err) {
    console.error('[CreationFailureAlert] Audit insert threw:', err)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
