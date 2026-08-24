import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { SITE } from '@/lib/constants'
import { sendPaymentVerificationRequest } from '@/lib/payment-verification-notification'
import { generateVerificationToken, VERIFICATION_TOKEN_VALID_DAYS } from '@/lib/payment-verification-token'
import { recomputeBookingPaymentStatus } from '@/lib/payment-status'

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

async function nextPaymentId(): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('payments')
    .select('*', { count: 'exact', head: true })
    .like('payment_id', `BDP-${year}-%`)
  return `BDP-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: bookingId } = await params

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, customer_name, customer_phone, total_amount, from_city, to_city')
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

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type. Upload a payment screenshot (JPG/PNG/WEBP/HEIC) or a PDF receipt.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 10MB).' }, { status: 400 })
  }

  // Optional overrides — falls back to the booking's own total_amount /
  // now() so this works even if the admin doesn't fill anything in.
  const amountRaw      = form.get('amount')
  const paymentDateRaw = form.get('payment_date')
  const requestedAmount = amountRaw ? Number(amountRaw) : Number(booking.total_amount) || 0
  const paymentDate  = (typeof paymentDateRaw === 'string' && paymentDateRaw) ? paymentDateRaw : new Date().toISOString()

  // Defense-in-depth clamp (2026-08-24 fix — see the matching comment in
  // doUploadPaymentProof, app/(admin)/admin/quotes/view/[lead_id]/page.tsx):
  // never let a proof upload record more than what's actually still
  // outstanding. Without this, a caller that (still) sends the booking's
  // full total_amount — even though some or all of it was already recorded
  // as 'paid' via Mark Payment Received or an earlier approved proof —
  // creates a second payments row that double-counts once Accounts
  // approves it. Recomputed live from the ledger rather than trusting any
  // client-supplied figure.
  const { data: paidRows } = await supabaseAdmin
    .from('payments')
    .select('amount')
    .eq('booking_id', bookingId)
    .eq('payment_status', 'paid')
  const alreadyPaid = (paidRows ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const outstanding = Math.max(0, (Number(booking.total_amount) || 0) - alreadyPaid)
  const amount = Math.max(0, Math.min(requestedAmount, outstanding))

  const proofType: 'image' | 'pdf' = file.type === 'application/pdf' ? 'pdf' : 'image'
  const ext = file.type === 'application/pdf' ? 'pdf' : (file.name.split('.').pop() || 'jpg')
  const storagePath = `${bookingId}/${Date.now()}-proof.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabaseAdmin.storage
    .from('payment-proofs')
    .upload(storagePath, Buffer.from(arrayBuffer), { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[payment-proof] Storage upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabaseAdmin.storage.from('payment-proofs').getPublicUrl(storagePath)
  const proofUrl = urlData.publicUrl

  // ── Create the payment record (pending_verification, never auto-'paid') ──
  // verification_token lets Accounts approve/reject straight from the
  // email (see app/api/payment-verification/[token]/route.ts) without an
  // admin dashboard login — same random-token model as the indemnity bond
  // signing links (lib/indemnity-token.ts).
  const paymentId = await nextPaymentId()
  const verificationToken = generateVerificationToken()
  const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: payment, error: paymentErr } = await supabaseAdmin
    .from('payments')
    .insert({
      payment_id:     paymentId,
      booking_id:     bookingId,
      customer_name:  booking.customer_name,
      customer_phone: booking.customer_phone,
      amount,
      payment_method: 'upload',
      payment_status: 'pending_verification',
      proof_url:      proofUrl,
      proof_type:     proofType,
      notes:          `Payment proof uploaded ${new Date().toLocaleString('en-IN')}`,
      verification_token:            verificationToken,
      verification_token_expires_at: verificationTokenExpiresAt,
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
      adminUrl:  `${SITE.url}/admin?highlight=${bookingId}`,
      reviewUrl: `${SITE.url}/payment-verification/${verificationToken}`,
    })
  } catch (err) {
    console.error('[payment-proof] verification-request notification failed (non-fatal):', err)
  }

  return NextResponse.json({ success: true, payment, proofUrl })
}
