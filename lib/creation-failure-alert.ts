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
  // The full, as-received request body for this creation attempt — added
  // 2026-09-14 after BDA-2026-0175 (see app/api/bookings/route.ts's
  // sanitizeFlightDateTime comment). Before this, the audit row/email only
  // ever captured a handful of summary fields (name/phone/email), so
  // recovering a genuinely lost inquiry meant transcribing every other
  // field (addresses, dates, bags, service type...) by hand from a
  // screenshot of the customer-facing "New Inquiry Received" email —
  // error-prone and slow. Optional and best-effort: every existing call
  // site keeps working unchanged without it, but any call site that HAS
  // the raw body should pass it so recreate-lost-inquiry
  // (app/api/admin/repair/recreate-lost-inquiry/route.ts) can be filled in
  // directly from this record instead.
  rawPayload?:    unknown
}

export async function alertCreationFailure(details: CreationFailureDetails): Promise<void> {
  // ── Write the audit row FIRST, not after the email ──────────────────────
  // 2026-09-23 fix: this used to send the email, THEN attempt the DB insert
  // and only console.warn() if it failed — invisible to the founder, who has
  // no routine access to server logs. Real incident: Sanya Chandwani's two
  // failed inquiries (BDA-2026-0214, BDA-2026-0215) both alerted by email
  // exactly as designed, but NEITHER audit row was ever written (confirmed
  // empty in Supabase Table Editor) — so /api/admin/repair/recreate-lost-inquiry
  // had nothing to recreate from, and the founder had no way to even know
  // the raw_payload was gone until asking "how will i recover inquiry" and
  // getting an empty result. The underlying cause of THAT specific insert
  // failure is still unknown (no server-log access from this environment to
  // see the real Postgres error) — but the silence itself was the bigger
  // bug: the one thing telling the founder "the raw payload was NOT saved,
  // don't rely on the recreate tool for this one" is now baked directly
  // into the alert email itself, computed BEFORE the email is sent, so it
  // can never go stale/be missed again.
  let auditRowSaved = false
  let auditError: string | null = null
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
      alert_sent:     false, // corrected below once we know the email actually sent
      raw_payload:    details.rawPayload ?? null,
    })
    if (error) {
      auditError = error.message
      console.warn('[CreationFailureAlert] Could not write audit row (has 20260822_inquiry_creation_failures.sql been run?):', error.message)
    } else {
      auditRowSaved = true
    }
  } catch (err) {
    auditError = err instanceof Error ? err.message : String(err)
    console.error('[CreationFailureAlert] Audit insert threw:', err)
  }

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
        ${auditRowSaved ? '' : `
        <p style="margin-top:16px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-weight:600">
          ⚠️ The audit log row itself also failed to save${auditError ? ' — ' + escapeHtml(auditError) : ''}.
          The Lost Inquiries admin tool will have NOTHING to recreate from for this one —
          you'll need to contact the customer directly using the phone/email above and
          collect their route/dates/bags again by hand.
        </p>`}
        <p style="margin-top:16px;color:#6b7280">
          If this looks like a real customer (not a bot probe), reach out to them
          directly using the phone/email above — their inquiry never made it into
          the system. If a booking record exists for this tracking ID with no
          linked lead, it can be repaired via
          <code>/api/admin/repair/create-lead-for-booking</code>. If NOTHING was
          saved at all (no booking, no lead), ${auditRowSaved
            ? 'the full original submission was captured and is saved in the inquiry_creation_failures table (raw_payload column), and can be one-click recreated from the <a href="https://www.bagdrop.co/admin/repair/lost-inquiries">Lost Inquiries</a> admin page.'
            : 'the full original submission was NOT captured this time (see the red note above) — recreate it from whatever details you gather from the customer via'}
          ${auditRowSaved ? '' : ' <code>/api/admin/repair/recreate-lost-inquiry</code>, using this same tracking ID/lead number so the customer\'s original inquiry number is preserved.'}
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

  // Best-effort correction of alert_sent now that we actually know — the
  // row was necessarily inserted with alert_sent:false above since the
  // email hadn't been attempted yet at that point.
  if (auditRowSaved && alertSent) {
    try {
      await supabaseAdmin
        .from('inquiry_creation_failures')
        .update({ alert_sent: true })
        .eq('tracking_id', details.trackingId ?? '')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
    } catch (err) {
      console.warn('[CreationFailureAlert] Could not backfill alert_sent (non-fatal):', err)
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
