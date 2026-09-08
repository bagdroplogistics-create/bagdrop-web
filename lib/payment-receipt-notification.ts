// BAGDROP — lib/payment-receipt-notification.ts
//
// Payment Acknowledgement + Payment Receipt automation (2026-09-07).
//
// Fires ONLY from the existing Payment Verification / Accounts Approval
// workflow's own approval step — app/api/admin/payments/[id]/route.ts's
// PATCH handler, inside its existing `verificationStatus === 'verified'`
// block (Accounts approved the tracked payment proof). This file does not
// touch, gate, or duplicate that verification process in any way — it is
// purely additive, called once verification has already succeeded:
//
//   Existing Payment Verification → Accounts Approves → Payment Received
//     → sendPaymentReceiptAcknowledgment(payment.id)   [THIS FILE]
//     → (existing) auto-advance booking to 'confirmed'
//
// Never fires for: payment submitted, pending verification, customer
// merely claiming payment, or a rejected verification — none of those
// code paths call this function.
//
// Modeled directly on lib/lead-acknowledgment.ts's shape (fetch → guard →
// per-channel send → log outcome), but with per-CHANNEL idempotency state
// stored directly on the `payments` row (receipt_email_status /
// receipt_whatsapp_status — see supabase/migrations/
// 20260907_payment_receipt_acknowledgement.sql) rather than one combined
// flag. That is what satisfies both:
//   - "the customer does not receive duplicate acknowledgements or
//     receipts" — a channel already marked 'sent' is never re-sent, even
//     if this function is called again (e.g. a duplicate PATCH, or an
//     admin-triggered retry).
//   - "allow the admin to retry the failed notification" — calling this
//     function again (POST /api/admin/payments/[id]/send-receipt) only
//     ever attempts channels that are NOT already 'sent', so a failed
//     WhatsApp send can be retried without re-emailing a customer who
//     already got their receipt.
//
// Never throws — every failure is caught, logged to the payments row's
// own *_error column, and left visible for a human to retry. A
// notification failure must never reverse or affect the payment approval
// itself (spec requirement 6).

import { supabaseAdmin } from './supabase'
import { formatCustomerName } from './constants'
import { sendPaymentReceiptEmail, type EmailAttachment } from './email'
import { sendWhatsAppTemplate } from './notifications'
import { buildPaymentReceiptPdfBuffer, paymentReceiptPdfFilename, uploadPaymentReceiptPdf } from './payment-receipt-pdf'

interface PaymentRow {
  id:                 string
  payment_id:         string
  booking_id:         string | null
  title:              string | null
  customer_name:      string
  customer_phone:     string
  amount:             number
  payment_method:     string
  payment_status:     string
  payment_reference:  string | null
  payment_date:       string | null
  created_at:         string
  notes:              string | null
  receipt_pdf_url:        string | null
  receipt_email_status:   string | null
  receipt_whatsapp_status: string | null
}

interface BookingRow {
  id:              string
  tracking_id:     string
  customer_email:  string | null
  from_city:       string | null
  to_city:         string | null
  service_label:   string | null
  service_type:    string | null
  total_bags:      number | null
  pickup_date:     string | null
  pickup_address:  string | null
  is_test:         boolean | null
}

// '₹' is fine here — this fmtRs is only used for the WhatsApp template
// variables (real UTF-8 text rendered by WhatsApp's own font, not
// react-pdf), unlike PaymentReceiptPDF.tsx's own fmtRs, which must use
// 'Rs.' because react-pdf's built-in Helvetica has no Rupee glyph.
function fmtRs(n: number): string {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Plain "to" rather than "→" — these labels (and the route string built
// below) feed straight into the Payment Receipt PDF via PaymentReceiptPDF.tsx,
// whose react-pdf Helvetica font has no arrow glyph (confirmed via a
// rendered preview, 2026-09-07 — the arrow silently fell back to a
// mis-rendered character instead of throwing). Matches the same "-to-"
// convention already established in QuotePDF.tsx for the same reason.
const SERVICE_TYPE_LABELS: Record<string, string> = {
  'airport-to-doorstep': 'Airport to Doorstep',
  'airport-to-door':     'Airport to Doorstep',
  'doorstep-to-airport': 'Doorstep to Airport',
  'door-to-airport':     'Doorstep to Airport',
  'doorstep-to-doorstep':'Doorstep to Doorstep',
  'airport-to-airport':  'Airport to Airport',
  intercity:             'Intercity Baggage Delivery',
}

// Defensive backstop for booking.service_label — a free-text column set
// elsewhere in the app that may already contain a literal "→" (e.g. built
// by lib/lifecycle-notifications.ts's own route string, which is fine
// there since that's plain WhatsApp text, not a react-pdf document).
// Strips it before anything reaches the PDF, same reasoning as above.
function pdfSafe(text: string | null | undefined): string | null {
  if (!text) return null
  return text.replace(/→/g, ' to ')
}

/**
 * Sends the Payment Acknowledgement (email + PDF receipt attached) and the
 * WhatsApp receipt notification for a single, already-verified payment.
 * Safe to call more than once for the same payment — already-'sent'
 * channels are skipped, so this doubles as both the original trigger AND
 * the admin "Retry" action (POST /api/admin/payments/[id]/send-receipt).
 *
 * No-ops (logs and returns) if the payment isn't actually payment_status
 * 'paid' — this is a defensive guard, not the real gate; the real gate is
 * that callers only ever invoke this from the verified-payment code path.
 */
export async function sendPaymentReceiptAcknowledgment(paymentId: string): Promise<void> {
  try {
    const { data: payment, error: paymentErr } = await supabaseAdmin
      .from('payments')
      .select('id, payment_id, booking_id, title, customer_name, customer_phone, amount, payment_method, payment_status, payment_reference, payment_date, created_at, notes, receipt_pdf_url, receipt_email_status, receipt_whatsapp_status')
      .eq('id', paymentId)
      .maybeSingle<PaymentRow>()

    if (paymentErr) {
      console.error('[PaymentReceipt] Could not load payment (migration 20260907_payment_receipt_acknowledgement.sql run?):', paymentErr.message)
      return
    }
    if (!payment) {
      console.log(`[PaymentReceipt] Payment ${paymentId} not found — skipping`)
      return
    }
    if (payment.payment_status !== 'paid') {
      // Defensive only — see module comment. The real "only after
      // Accounts approves" gate is which code paths call this function.
      console.log(`[PaymentReceipt] Payment ${payment.payment_id} — skipped: payment_status is '${payment.payment_status}', not 'paid'`)
      return
    }

    const emailAlreadySent    = payment.receipt_email_status === 'sent'
    const whatsappAlreadySent = payment.receipt_whatsapp_status === 'sent'
    if (emailAlreadySent && whatsappAlreadySent) {
      console.log(`[PaymentReceipt] Payment ${payment.payment_id} — already fully acknowledged (email + WhatsApp both sent), no-op`)
      return
    }

    // Founder-reported 2026-09-08 (booking BDA-2026-0160 / receipt
    // BDP-2026-0016): a payment-proof upload correctly clamped to ₹0 by
    // app/api/admin/bookings/[id]/payment-proof/route.ts (the real amount
    // was already recorded via a different flow — e.g. "Mark Payment
    // Received" — and the outstanding-balance clamp there prevents
    // double-counting a second payments row for the same money) still goes
    // through Accounts Verification normally, which used to fire this same
    // customer-facing "Payment Received" WhatsApp message + receipt PDF —
    // technically correct for this one ledger row, but a nonsensical,
    // confusing "we received your payment of ₹0.00" message from the
    // customer's side. A ₹0 payment is never something to send a customer
    // a receipt for, so this is skipped entirely (not just left pending —
    // there is nothing to retry once genuinely nothing new was paid).
    if (Number(payment.amount) <= 0) {
      const updates: Record<string, unknown> = {}
      if (!emailAlreadySent)    { updates.receipt_email_status = 'skipped';    updates.receipt_email_error = 'Payment amount is ₹0 — verification-only record, no new amount to acknowledge' }
      if (!whatsappAlreadySent) { updates.receipt_whatsapp_status = 'skipped'; updates.receipt_whatsapp_error = 'Payment amount is ₹0 — verification-only record, no new amount to acknowledge' }
      if (Object.keys(updates).length) {
        await supabaseAdmin.from('payments').update(updates).eq('id', payment.id)
      }
      console.log(`[PaymentReceipt] Payment ${payment.payment_id} — skipped (amount is ₹0, likely a verification-only proof for money already recorded elsewhere)`)
      return
    }

    let booking: BookingRow | null = null
    if (payment.booking_id) {
      const { data: bk } = await supabaseAdmin
        .from('bookings')
        .select('id, tracking_id, customer_email, from_city, to_city, service_label, service_type, total_bags, pickup_date, pickup_address, is_test')
        .eq('id', payment.booking_id)
        .maybeSingle<BookingRow>()
      booking = bk ?? null
    }

    const trackingId  = booking?.tracking_id ?? payment.payment_id
    const displayName = formatCustomerName(payment.title, payment.customer_name) || payment.customer_name

    // Test Mode bookings must never trigger a real customer-facing send —
    // same rule as every other automated notifier in this codebase (see
    // lib/lifecycle-notifications.ts / lib/lead-acknowledgment.ts). Still
    // marks both channels 'skipped' so this doesn't look like an
    // unresolved failure needing retry, and so a later real approval on a
    // Test Mode booking that gets un-flagged can still send fresh.
    if (booking?.is_test) {
      const updates: Record<string, unknown> = {}
      if (!emailAlreadySent)    { updates.receipt_email_status = 'skipped';    updates.receipt_email_error = 'Test Mode booking — no real message sent' }
      if (!whatsappAlreadySent) { updates.receipt_whatsapp_status = 'skipped'; updates.receipt_whatsapp_error = 'Test Mode booking — no real message sent' }
      if (Object.keys(updates).length) {
        await supabaseAdmin.from('payments').update(updates).eq('id', payment.id)
      }
      console.log(`[PaymentReceipt] Payment ${payment.payment_id} — skipped (Test Mode booking)`)
      return
    }

    // ── Get / Generate Payment Receipt ──────────────────────────────
    // Reuses a previously-generated PDF if one already exists (cached on
    // receipt_pdf_url) rather than rebuilding + re-uploading on every
    // retry — a payment's own data never changes after Accounts approves
    // it. Built once here and reused for BOTH the email attachment and
    // the WhatsApp Document-header URL, matching the spec's Step 7
    // workflow ("Get / Generate Payment Receipt" happens once, upstream
    // of both send channels).
    let receiptUrl = payment.receipt_pdf_url
    let pdfBuffer: Buffer | null = null
    const filename = paymentReceiptPdfFilename(payment.payment_id)

    if (!receiptUrl || !emailAlreadySent) {
      // Need the raw buffer either to email it, or (if no cached URL yet)
      // to upload it. Building it once covers both needs.
      try {
        pdfBuffer = await buildPaymentReceiptPdfBuffer({
          receiptNumber:  payment.payment_id,
          receiptDate:    new Date().toISOString(),
          customerName:   displayName,
          customerPhone:  payment.customer_phone,
          customerAddress: pdfSafe(booking?.pickup_address),
          trackingId,
          amount:         Number(payment.amount),
          paymentDate:    payment.payment_date ?? payment.created_at,
          paymentMethod:  payment.payment_method,
          paymentReference: payment.payment_reference,
          route:          booking?.from_city && booking?.to_city ? `${booking.from_city} to ${booking.to_city}` : null,
          serviceLabel:   booking ? (SERVICE_TYPE_LABELS[booking.service_type ?? ''] ?? pdfSafe(booking.service_label) ?? booking.service_type ?? null) : null,
          bagsCount:      booking?.total_bags ?? null,
          pickupDate:     booking?.pickup_date ?? null,
          notes:          pdfSafe(payment.notes),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[PaymentReceipt] Payment ${payment.payment_id} — PDF generation failed:`, msg)
        const updates: Record<string, unknown> = {}
        if (!emailAlreadySent)    { updates.receipt_email_status = 'failed';    updates.receipt_email_error = 'Receipt PDF generation failed: ' + msg }
        if (!whatsappAlreadySent) { updates.receipt_whatsapp_status = 'failed'; updates.receipt_whatsapp_error = 'Receipt PDF generation failed: ' + msg }
        await supabaseAdmin.from('payments').update(updates).eq('id', payment.id)
        return
      }

      if (!receiptUrl) {
        try {
          const uploaded = await uploadPaymentReceiptPdf(payment.id, filename, pdfBuffer)
          receiptUrl = uploaded.url
          await supabaseAdmin.from('payments').update({
            receipt_pdf_url: receiptUrl,
            receipt_generated_at: new Date().toISOString(),
          }).eq('id', payment.id)
        } catch (err) {
          // Non-fatal for email (which uses the buffer directly, not the
          // URL) — only WhatsApp's Document header actually needs a
          // hosted URL. Logged and left null; WhatsApp send below handles
          // a missing receiptUrl explicitly.
          console.error(`[PaymentReceipt] Payment ${payment.payment_id} — Storage upload failed (non-fatal for email):`, err instanceof Error ? err.message : err)
        }
      }
    }

    const paymentUpdates: Record<string, unknown> = {}

    // ── Email — Payment Acknowledgement + Receipt PDF attached ───────
    if (!emailAlreadySent) {
      if (!booking?.customer_email) {
        paymentUpdates.receipt_email_status = 'skipped'
        paymentUpdates.receipt_email_error  = 'No customer email on file'
      } else if (!pdfBuffer) {
        paymentUpdates.receipt_email_status = 'failed'
        paymentUpdates.receipt_email_error  = 'Receipt PDF unavailable'
      } else {
        const attachment: EmailAttachment = { filename, content: pdfBuffer.toString('base64') }
        const result = await sendPaymentReceiptEmail(
          { customerTitle: payment.title, customerName: payment.customer_name, customerEmail: booking.customer_email, trackingId, amount: Number(payment.amount) },
          attachment,
        )
        paymentUpdates.receipt_email_status = result.success ? 'sent' : 'failed'
        paymentUpdates.receipt_email_error  = result.success ? null : (result.error ?? 'Unknown error')
        if (result.success) paymentUpdates.receipt_email_sent_at = new Date().toISOString()
      }
    }

    // ── WhatsApp — short acknowledgement + receipt (Document header) ──
    // Uses a NEW template, 'payment_verified_receipt' — see the migration
    // file's module comment for the exact body/variable order to submit
    // to Fast2SMS/Meta for approval. Until approved, sendWhatsAppTemplate
    // returns a clean failure (not a thrown error), which is recorded
    // below exactly like any other failure — same "no-op safely until the
    // template is approved" convention as every other WhatsApp template
    // in this codebase.
    if (!whatsappAlreadySent) {
      if (!payment.customer_phone) {
        paymentUpdates.receipt_whatsapp_status = 'skipped'
        paymentUpdates.receipt_whatsapp_error  = 'No phone number on file'
      } else if (!receiptUrl) {
        // The approved template has a Document header, which Meta requires
        // whenever the template defines one — can't send it without a
        // hosted PDF URL. Spec's "otherwise use the secure receipt link"
        // fallback isn't reachable here since the template's wording
        // already assumes an attached document; recorded as failed so the
        // admin can retry once the PDF upload issue (see log above) is
        // resolved.
        paymentUpdates.receipt_whatsapp_status = 'failed'
        paymentUpdates.receipt_whatsapp_error  = 'Receipt PDF link unavailable'
      } else {
        const variables = [displayName, fmtRs(Number(payment.amount)), trackingId]
        const result = await sendWhatsAppTemplate(
          payment.customer_phone,
          'payment_verified_receipt',
          variables,
          { type: 'document', url: receiptUrl, filename },
        )
        paymentUpdates.receipt_whatsapp_status = result.success ? 'sent' : 'failed'
        paymentUpdates.receipt_whatsapp_error  = result.success ? null : (result.error ?? 'Unknown error')
        if (result.success) paymentUpdates.receipt_whatsapp_sent_at = new Date().toISOString()
      }
    }

    if (Object.keys(paymentUpdates).length) {
      const { error: updateErr } = await supabaseAdmin.from('payments').update(paymentUpdates).eq('id', payment.id)
      if (updateErr) console.error('[PaymentReceipt] Failed to persist notification status (non-fatal):', updateErr.message)
    }

    console.log(`[PaymentReceipt] Payment ${payment.payment_id} — email: ${paymentUpdates.receipt_email_status ?? payment.receipt_email_status ?? 'n/a'}, whatsapp: ${paymentUpdates.receipt_whatsapp_status ?? payment.receipt_whatsapp_status ?? 'n/a'}`)
  } catch (err) {
    console.error('[PaymentReceipt] Unexpected error (non-fatal — payment approval itself is unaffected):', err)
  }
}
