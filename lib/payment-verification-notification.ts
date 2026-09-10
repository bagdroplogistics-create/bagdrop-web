// BAGDROP — lib/payment-verification-notification.ts
//
// Sends the "please check and approve this payment" request to the Account
// Department when an admin uploads a customer's payment proof (screenshot
// or PDF) from the Booking Workflow. Two channels, same pattern as
// lib/new-inquiry-notification.ts:
//   - Email to anil@bagdrop.co (lib/email.ts's generic sendEmail — no new
//     Resend template needed, just a plain HTML block built here).
//   - WhatsApp to +91 99986 65328 via a Fast2SMS-approved template. No-ops
//     (logs and returns) until FAST2SMS_PAYMENT_VERIFICATION_TEMPLATE_NAME
//     is set, so nothing breaks before that template is submitted to Meta
//     and approved.
//
// Founder request (2026-09-10): Accounts should be able to approve a
// payment straight from the WhatsApp message itself, with no need to open
// the admin dashboard on a desktop. The public, no-login review page
// (app/payment-verification/[token]/page.tsx, with its own big "Approve
// Payment" / "Reject Payment" buttons) already existed for exactly this —
// it just wasn't reachable from WhatsApp yet. Fixed by sending this
// template via sendWhatsAppTemplateFast2SMSv2 (the POST/Meta-format
// endpoint) instead of the older sendWhatsAppTemplateFast2SMS (a flat GET
// query string with no concept of template components/buttons at all), and
// attaching a CTA URL button whose dynamic parameter is the review token.
// This IS a deliberate deviation from this codebase's usual rule that
// internal/staff-facing templates stay on the plain GET sender (see
// lib/notifications.ts's own module comments) — made only because buttons
// are structurally impossible on that GET endpoint.
//
// This function only ever *asks* Accounts to check the payment — it never
// marks a payment as approved itself. Approval happens separately via
// PATCH /api/admin/payments/[id] (payment_status: 'paid'), which is what
// actually flips bookings.payment_verification_status to 'verified'.

import { sendEmail } from './email'
import { sendWhatsAppTemplateFast2SMSv2 } from './notifications'
import { supabaseAdmin } from './supabase'

const ACCOUNTS_EMAIL             = 'anil@bagdrop.co'
const DEFAULT_ACCOUNTS_WHATSAPP  = '+919998665328'

// Configurable via Admin Settings → settings table (key
// 'payment_verification_whatsapp'), same override pattern as
// new_inquiry_whatsapp / ops_reminder_whatsapp — falls back to the number
// given in the spec.
async function getAccountsWhatsAppNumber(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'payment_verification_whatsapp')
    .maybeSingle()
  return data?.value || DEFAULT_ACCOUNTS_WHATSAPP
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch { return d }
}

function fmtRs(n: number | null | undefined): string {
  return 'Rs. ' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export interface PaymentVerificationRequestData {
  bookingId:      string   // bookings.id (uuid) — the source of truth
  trackingId:     string   // bookings.tracking_id — human-readable Booking ID
  inquiryId:      string | null // leads.lead_number, if this booking has a linked lead
  customerName:   string
  route:          string   // "From City → To City", or "—" if either is missing
  amount:         number
  paymentDate?:   string | null   // ISO timestamp, if known
  proofUrl:       string
  proofType:      'image' | 'pdf'
  adminUrl:       string  // deep link back into the admin Booking Workflow for this booking
  reviewUrl:      string  // public, no-login Approve/Reject page — see app/payment-verification/[token]/page.tsx
  reviewToken:    string  // bare token portion of reviewUrl — the WhatsApp CTA button's dynamic parameter (button URL, not text, so it can't just reuse reviewUrl's full string)
}

/**
 * Notifies the Account Department that a payment proof was uploaded and
 * needs to be checked/approved. Best-effort on both channels — logs and
 * returns rather than throwing, matching every other notifier in this
 * codebase, since a failed notification should never block the upload
 * that already succeeded.
 */
export async function sendPaymentVerificationRequest(data: PaymentVerificationRequestData): Promise<void> {
  const subject = `Payment verification needed — ${data.trackingId} — ${fmtRs(data.amount)}`

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <div style="background:#111827;padding:20px 28px;border-radius:8px 8px 0 0">
        <p style="margin:0;color:#fff;font-size:16px;font-weight:700">Payment Verification Needed</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 28px;border-radius:0 0 8px 8px">
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
          A payment proof was uploaded and needs Accounts to check and approve it.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:6px 0;color:#6b7280;width:160px">Customer Name</td><td style="padding:6px 0;font-weight:700">${data.customerName}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Booking ID</td><td style="padding:6px 0;font-weight:700">${data.trackingId}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Inquiry ID</td><td style="padding:6px 0;font-weight:700">${data.inquiryId ?? '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Route</td><td style="padding:6px 0;font-weight:700">${data.route}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Payment Amount</td><td style="padding:6px 0;font-weight:700">${fmtRs(data.amount)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Payment Date/Time</td><td style="padding:6px 0;font-weight:700">${fmtDateTime(data.paymentDate)}</td></tr>
        </table>
        <p style="margin:20px 0 8px;font-size:13px;color:#6b7280">Uploaded Proof</p>
        <a href="${data.proofUrl}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:6px">
          View ${data.proofType === 'pdf' ? 'Payment Receipt (PDF)' : 'Payment Screenshot'}
        </a>

        <p style="margin:24px 0 8px;font-size:13px;color:#6b7280">Approve or reject — no dashboard login needed</p>
        <a href="${data.reviewUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:6px">
          Review &amp; Approve / Reject Payment →
        </a>
        <p style="margin:6px 0 0;font-size:11px;color:#9ca3af">This link is valid for 30 days and only works once.</p>

        <p style="margin:20px 0 8px;font-size:13px;color:#6b7280">Or, review in the full Booking Workflow (admin login required)</p>
        <a href="${data.adminUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:6px">
          Open Booking ${data.trackingId}
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6">
          This payment stays in <strong>Payment Verification Pending</strong> until approved or rejected here —
          it is not automatically treated as received.
        </p>
      </div>
    </div>
  `

  const emailResult = await sendEmail(ACCOUNTS_EMAIL, subject, html, 'payment-verification-request')
  console.log(`[PaymentVerification] ${data.trackingId} — email ` +
    (emailResult.success ? `sent to ${ACCOUNTS_EMAIL}` : `failed — ${emailResult.error}`))

  try {
    const templateName = process.env.FAST2SMS_PAYMENT_VERIFICATION_TEMPLATE_NAME
    if (!templateName) {
      console.log(`[PaymentVerification] ${data.trackingId} — WhatsApp skipped: template not configured (FAST2SMS_PAYMENT_VERIFICATION_TEMPLATE_NAME)`)
      return
    }
    const accountsNumber = await getAccountsWhatsAppNumber()
    // Approved-template variable order must match exactly what was
    // submitted to Meta. Template body text (unchanged since 2026-08-13):
    //   Customer Name: {{1}}  Booking ID: {{2}}  Inquiry ID: {{3}}
    //   Route: {{4}}  Payment Amount: ₹{{5}}  Payment Date: {{6}}
    //   Payment Proof: {{7}}
    // Note: {{5}} is plain-number only (no "Rs." prefix, no ₹) since the
    // template body already prepends the ₹ symbol before {{5}}.
    //
    // Also requires the template to have ONE CTA URL button (index 0),
    // configured in Meta/Fast2SMS with a dynamic base URL of
    // "https://www.bagdrop.co/payment-verification/{{1}}" (button-local
    // {{1}}, separate numbering from the body's {{1..7}} above) — label
    // e.g. "Review & Approve". Tapping it in WhatsApp opens the existing
    // public, no-login review page (app/payment-verification/[token]/
    // page.tsx) with its own big Approve/Reject buttons — see this file's
    // module comment for why that's a URL button and not a true in-chat
    // quick-reply (which would need an inbound-webhook receiver instead).
    const variables = [
      data.customerName,
      data.trackingId,
      data.inquiryId ?? '—',
      data.route,
      Number(data.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      fmtDateTime(data.paymentDate),
      data.proofUrl,
    ]
    const result = await sendWhatsAppTemplateFast2SMSv2(accountsNumber, templateName, variables, undefined, [
      { index: 0, payload: data.reviewToken },
    ])
    console.log(`[PaymentVerification] ${data.trackingId} — WhatsApp ` +
      (result.success ? `sent — request_id ${result.requestId ?? '—'}` : `failed — ${result.error}`))
  } catch (err) {
    console.error('[PaymentVerification] WhatsApp unexpected error (non-fatal):', err)
  }
}
