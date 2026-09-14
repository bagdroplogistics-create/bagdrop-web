import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { SITE, resolveCustomerTitle } from '@/lib/constants'
import { sendPaymentVerificationRequest } from '@/lib/payment-verification-notification'
import { generateVerificationToken, VERIFICATION_TOKEN_VALID_DAYS } from '@/lib/payment-verification-token'
import { recomputeBookingPaymentStatus } from '@/lib/payment-status'
import { nextPaymentId } from '@/lib/number-series'

// Payment Screenshot / PDF Upload + Payment Verification Request
// (Booking Workflow spec items 1 & 2).
//
// Uploads the customer's payment proof for an existing booking, creates a
// `payments` row tagged 'pending_verification' (never 'paid' — uploading
// proof must never itself count as approval), links it back onto the
// booking via bookings.payment_verification_status /
// payment_verification_payment_id, and notifies the Account Department.
//
// This never creates a new booking or lead — booking_id (the path param)
// is the single source of truth throughout.

export const runtime = 'nodejs'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BYTES = 10 * 1024 * 1024 // 10MB


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: bookingId } = await params

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, title, customer_name, customer_phone, total_amount, from_city, to_city')
    .eq('id', bookingId)
    .single()

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 })
  }

  // Multiple files per submission (founder-reported 2026-09-14 — only one
  // screenshot was ever being saved). FormData.getAll returns every entry
  // under the 'file' field name — the frontend now appends one per selected
  // file (see doUploadPaymentProof) instead of the old single form.get('file').
  // getAll still works correctly for a single legacy file too, so this is
  // fully backward compatible with any older caller sending just one.
  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  for (const f of files) {
    if (!ALLOWED_MIME.has(f.type)) {
      return NextResponse.json({ error: `Unsupported file type (${f.name}). Upload a payment screenshot (JPG/PNG/WEBP/HEIC) or a PDF receipt.` }, { status: 400 })
    }
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (${f.name}, max 10MB).` }, { status: 400 })
    }
  }

  // Root-cause fix for the "Payment Amount: ₹0.00" WhatsApp bug
  // (founder-reported 2026-09-14, live example BDA-2026-0179). Previously
  // this silently fell back to `Number(booking.total_amount) || 0` whenever
  // `amount` was missing OR falsy (including the string "0"), and — worse —
  // was then always clamped down to `outstanding` below, which is exactly 0
  // whenever the ledger already shows the booking's total_amount as fully
  // 'paid' (e.g. total_amount was revised upward after an earlier payment,
  // or a genuine additional/extra payment is being recorded). That clamp
  // silently zeroed out a real, non-zero amount the customer actually paid.
  //
  // The Booking Workflow page now always sends an explicit, validated
  // positive `amount` (see doUploadPaymentProof) — when it's present, it
  // must be a real positive number or the request is rejected outright,
  // rather than silently coerced to 0/total. When `amount` is absent
  // entirely (the admin-app mobile client — admin-app/src/lib/api.ts's
  // uploadPaymentProof — never sends one, and that upload flow is
  // unchanged/out of scope here), the original total_amount fallback is
  // preserved exactly as before, so that existing caller keeps working
  // unmodified.
  const amountRaw      = form.get('amount')
  const paymentDateRaw = form.get('payment_date')
  let requestedAmount: number
  if (amountRaw !== null && String(amountRaw).trim() !== '') {
    requestedAmount = Number(amountRaw)
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return NextResponse.json({ error: 'A valid payment amount greater than ₹0 is required.' }, { status: 400 })
    }
  } else {
    requestedAmount = Number(booking.total_amount) || 0
  }
  const paymentDate = (typeof paymentDateRaw === 'string' && paymentDateRaw) ? paymentDateRaw : new Date().toISOString()

  // Defense-in-depth clamp (2026-08-24 fix — see the matching comment in
  // doUploadPaymentProof, app/(admin)/admin/quotes/view/[lead_id]/page.tsx):
  // never let a proof upload record more than what's actually still
  // outstanding, so a caller that still sends the booking's full
  // total_amount — even though some or all of it was already recorded as
  // 'paid' via Mark Payment Received or an earlier approved proof — can't
  // create a second payments row that double-counts once Accounts approves
  // it. Recomputed live from the ledger rather than trusting any
  // client-supplied figure.
  //
  // 2026-09-14 fix: only apply that clamp when there's actually outstanding
  // balance to clamp against. When the ledger already shows the full
  // total_amount as 'paid', `outstanding` is correctly 0 — but that no
  // longer means THIS submission's amount gets forced to 0 too. A payment
  // proof uploaded at that point is real evidence of an additional payment
  // the ledger doesn't yet know about (revised total, extra service, etc.)
  // and must be recorded as what it actually is, not silently erased to
  // ₹0.00. The double-count protection is unchanged for the normal
  // (outstanding > 0) case this was originally built for.
  const { data: paidRows } = await supabaseAdmin
    .from('payments')
    .select('amount')
    .eq('booking_id', bookingId)
    .eq('payment_status', 'paid')
  const alreadyPaid = (paidRows ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const outstanding = Math.max(0, (Number(booking.total_amount) || 0) - alreadyPaid)
  const amount = outstanding > 0
    ? Math.max(0, Math.min(requestedAmount, outstanding))
    : requestedAmount

  const proofEntries: { url: string; type: 'image' | 'pdf'; name: string }[] = []
  for (const [i, f] of files.entries()) {
    const proofType: 'image' | 'pdf' = f.type === 'application/pdf' ? 'pdf' : 'image'
    const ext = f.type === 'application/pdf' ? 'pdf' : (f.name.split('.').pop() || 'jpg')
    const storagePath = `${bookingId}/${Date.now()}-${i}-proof.${ext}`

    const arrayBuffer = await f.arrayBuffer()
    const { error: uploadError } = await supabaseAdmin.storage
      .from('payment-proofs')
      .upload(storagePath, Buffer.from(arrayBuffer), { contentType: f.type, upsert: false })

    if (uploadError) {
      console.error('[payment-proof] Storage upload error:', uploadError)
      return NextResponse.json({ error: `Upload failed (${f.name}): ` + uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage.from('payment-proofs').getPublicUrl(storagePath)
    proofEntries.push({ url: urlData.publicUrl, type: proofType, name: f.name })
  }

  // proof_url/proof_type keep pointing at the FIRST file — every existing
  // reader of those two single-value columns (email/WhatsApp template,
  // older rows) keeps working unchanged. proof_urls carries the complete
  // list for every reader that's been updated to show all of them.
  const proofUrl  = proofEntries[0].url
  const proofType = proofEntries[0].type

  // ── Create the payment record (pending_verification, never auto-'paid') ──
  // verification_token lets Accounts approve/reject straight from the
  // email (see app/api/payment-verification/[token]/route.ts) without an
  // admin dashboard login — same random-token model as the indemnity bond
  // signing links (lib/indemnity-token.ts).
  // Resolve a real title from the booking instead of letting payments.title
  // fall back to its DB default ('Mr.') — see lib/constants.ts's
  // resolveCustomerTitle. M/S is clamped since payments_title_check only
  // allows Mr./Mrs./Ms.
  const resolvedTitleRaw = resolveCustomerTitle(booking.title, booking.customer_name)
  const resolvedTitle = resolvedTitleRaw === 'M/S' ? 'Mr.' : resolvedTitleRaw

  const paymentId = await nextPaymentId()
  const verificationToken = generateVerificationToken()
  const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString()
  // Persist the Payment Date the caller supplied (form field 'payment_date',
  // already parsed into paymentDate above for the Accounts notification) --
  // previously computed but never actually written onto the row, so every
  // proof-upload payment's created_at silently defaulted to upload time
  // instead of the real payment date, and it could land in the wrong
  // month's bucket on the Payments tab (founder-reported 2026-09-05, same
  // root cause as the fix to POST /api/admin/payments and the new date-edit
  // control on the Payments page). Only overrides created_at when the
  // caller actually supplied a date (paymentDateRaw), not the "now()"
  // fallback the notification uses -- an admin/customer who didn't specify
  // one should still get today's actual upload time, same as before.
  const explicitPaymentDate = typeof paymentDateRaw === 'string' && paymentDateRaw ? paymentDateRaw.slice(0, 10) : null
  const { data: payment, error: paymentErr } = await supabaseAdmin
    .from('payments')
    .insert({
      payment_id:     paymentId,
      booking_id:     bookingId,
      title:          resolvedTitle,
      customer_name:  booking.customer_name,
      customer_phone: booking.customer_phone,
      amount,
      payment_method: 'upload',
      payment_status: 'pending_verification',
      proof_url:      proofUrl,
      proof_type:     proofType,
      proof_urls:     proofEntries,
      notes:          `Payment proof uploaded ${new Date().toLocaleString('en-IN')}${proofEntries.length > 1 ? ` (${proofEntries.length} files)` : ''}`,
      verification_token:            verificationToken,
      verification_token_expires_at: verificationTokenExpiresAt,
      ...(explicitPaymentDate ? { payment_date: explicitPaymentDate, created_at: new Date(explicitPaymentDate + 'T12:00:00').toISOString() } : {}),
    })
    .select()
    .single()

  if (paymentErr || !payment) {
    console.error('[payment-proof] payments insert error:', paymentErr)
    return NextResponse.json({ error: 'Uploaded, but failed to create payment record: ' + paymentErr?.message }, { status: 500 })
  }

  // ── Link back onto the booking — source of truth for the UI banner ──
  const { error: bookingUpdateErr } = await supabaseAdmin
    .from('bookings')
    .update({
      payment_verification_status:     'pending_verification',
      payment_verification_payment_id: payment.id,
    })
    .eq('id', bookingId)

  if (bookingUpdateErr) {
    console.error('[payment-proof] booking update error (non-fatal, payment record still saved):', bookingUpdateErr)
  }

  // Surface "Under Verification" as the booking's payment status right away
  // (spec §1/§7) — only takes effect if there's no already-approved payment
  // covering some/all of the total, in which case the derived status
  // correctly stays 'paid'/'partially_paid' instead (recomputeBookingPaymentStatus
  // precedence). Best-effort, never blocks the upload response.
  try {
    await recomputeBookingPaymentStatus(bookingId)
  } catch (err) {
    console.error('[payment-proof] payment-status recompute failed (non-fatal):', err)
  }

  // ── Notify Accounts — best-effort, never blocks the upload response ──
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('lead_number')
    .eq('booking_id', bookingId)
    .maybeSingle()

  try {
    // Same [from_city, to_city] → "City A → City B" convention used by
    // lib/lifecycle-notifications.ts, lib/ops-reminders.ts and
    // lib/google-calendar.ts, reused here for the WhatsApp/email Route field.
    const route = [booking.from_city, booking.to_city].filter(Boolean).join(' → ') || '—'
    await sendPaymentVerificationRequest({
      bookingId,
      trackingId:   booking.tracking_id,
      inquiryId:    lead?.lead_number ?? null,
      customerName: booking.customer_name,
      route,
      amount,
      paymentDate,
      proofUrl,
      proofType,
      proofUrls:   proofEntries,
      adminUrl:    `${SITE.url}/admin?highlight=${bookingId}`,
      reviewUrl:   `${SITE.url}/payment-verification/${verificationToken}`,
      reviewToken: verificationToken,
    })
  } catch (err) {
    console.error('[payment-proof] verification-request notification failed (non-fatal):', err)
  }

  return NextResponse.json({ success: true, payment, proofUrl, proofUrls: proofEntries })
}
