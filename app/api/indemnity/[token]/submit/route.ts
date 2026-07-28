import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { resolveIndemnityToken } from '@/lib/indemnity-token'
import { fillIndemnityBondPdf } from '@/lib/indemnity-pdf'
import { sendIndemnityWhatsApp } from '@/lib/indemnity-notifications'
import { sendIndemnityBondStatusEmail, sendIndemnityBondAdminNotification, type EmailAttachment } from '@/lib/email'

export const runtime = 'nodejs'

const BUCKET = 'indemnity-documents'
const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_DOC_BYTES = 10 * 1024 * 1024

// Conservative combined-size cap for the admin notification's attachments —
// base64 inflates raw bytes by ~1.37x, and Resend's request body limit is
// documented at 40MB, so this keeps the encoded payload well under that
// even with a signed bond + all 4 possible document uploads attached.
// Over the cap, the admin email is still sent (with the "Review in Admin
// Panel" link) — it just skips the attachments rather than failing outright.
const ADMIN_ATTACHMENT_SIZE_LIMIT_BYTES = 15 * 1024 * 1024

function extFor(file: File): string {
  return file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
}

async function uploadDoc(bookingId: string, field: string, file: File): Promise<{ path: string | null; error?: string }> {
  if (!ALLOWED_DOC_TYPES.includes(file.type)) {
    return { path: null, error: `${field}: only PDF, JPG, or PNG files are accepted` }
  }
  if (file.size > MAX_DOC_BYTES) {
    return { path: null, error: `${field}: file is too large (max 10 MB)` }
  }
  const path = `${bookingId}/${field}-${Date.now()}.${extFor(file)}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  })
  return error ? { path: null, error: error.message } : { path }
}

// ── POST /api/indemnity/[token]/submit ────────────────────────────────
// Steps 4-7. multipart/form-data body:
//   aadhaar_number, passport_number, licence_number (text, at least one required)
//   bond_date, bond_place (text, required)
//   signature (file — PNG blob from the signing canvas, required)
//   aadhaar_doc (file, required)
//   passport_doc (file, optional)
//   flight_ticket_doc (file, required only for airport-delivery bookings)
//   extra_doc (file, optional)
// Requires the bond's OTP to already be verified (Step 3) — the identity
// check happens once, up front, not re-checked per field.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  const result = await resolveIndemnityToken(token)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const { bond, booking } = result

  if (!bond.otp_verified) {
    return NextResponse.json({ error: 'Please verify your identity with the OTP before submitting.' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid submission' }, { status: 400 })

  const aadhaarNumber  = String(form.get('aadhaar_number')  ?? '').trim()
  const passportNumber = String(form.get('passport_number') ?? '').trim()
  const licenceNumber  = String(form.get('licence_number')  ?? '').trim()
  const bondDate        = String(form.get('bond_date')  ?? '').trim()
  const bondPlace       = String(form.get('bond_place') ?? '').trim()

  if (!aadhaarNumber && !passportNumber && !licenceNumber) {
    return NextResponse.json({ error: 'Please provide at least one of Aadhaar, Passport, or Driving Licence number.' }, { status: 400 })
  }
  if (!bondDate || !bondPlace) {
    return NextResponse.json({ error: 'Date and Place are required.' }, { status: 400 })
  }

  const signatureFile = form.get('signature')
  if (!(signatureFile instanceof File) || signatureFile.size === 0) {
    return NextResponse.json({ error: 'Please draw your signature before submitting.' }, { status: 400 })
  }

  const aadhaarDocFile      = form.get('aadhaar_doc')
  const passportDocFile     = form.get('passport_doc')
  const flightTicketDocFile = form.get('flight_ticket_doc')
  const extraDocFile        = form.get('extra_doc')

  const isAirportDelivery = /airport/i.test(booking.service_type ?? '')

  if (!(aadhaarDocFile instanceof File) || aadhaarDocFile.size === 0) {
    return NextResponse.json({ error: 'Aadhaar Card upload is required.' }, { status: 400 })
  }
  if (isAirportDelivery && (!(flightTicketDocFile instanceof File) || flightTicketDocFile.size === 0)) {
    return NextResponse.json({ error: 'Flight Ticket / Boarding Pass upload is required for airport bookings.' }, { status: 400 })
  }

  // ── Upload documents ──────────────────────────────────────────────
  const uploads: Record<string, string | null> = {}

  const aadhaarUp = await uploadDoc(booking.id, 'aadhaar', aadhaarDocFile)
  if (aadhaarUp.error) return NextResponse.json({ error: aadhaarUp.error }, { status: 400 })
  uploads.aadhaar_doc_path = aadhaarUp.path

  if (passportDocFile instanceof File && passportDocFile.size > 0) {
    const up = await uploadDoc(booking.id, 'passport', passportDocFile)
    if (up.error) return NextResponse.json({ error: up.error }, { status: 400 })
    uploads.passport_doc_path = up.path
  }

  if (flightTicketDocFile instanceof File && flightTicketDocFile.size > 0) {
    const up = await uploadDoc(booking.id, 'flight-ticket', flightTicketDocFile)
    if (up.error) return NextResponse.json({ error: up.error }, { status: 400 })
    uploads.flight_ticket_doc_path = up.path
  }

  if (extraDocFile instanceof File && extraDocFile.size > 0) {
    const up = await uploadDoc(booking.id, 'extra', extraDocFile)
    if (up.error) return NextResponse.json({ error: up.error }, { status: 400 })
    uploads.extra_doc_path = up.path
  }

  // ── Fill + sign the original PDF (Step 5/6) ────────────────────────
  const signatureBytes = new Uint8Array(await signatureFile.arrayBuffer())
  let signedPdfBytes: Uint8Array
  try {
    signedPdfBytes = await fillIndemnityBondPdf({
      customerName:    booking.customer_name ?? '',
      aadhaarNumber,
      passportNumber,
      licenceNumber,
      bondDate,
      bondPlace,
      signaturePng: signatureBytes,
    })
  } catch (err) {
    console.error('[indemnity submit] PDF fill failed:', err)
    return NextResponse.json({ error: 'Could not generate the signed bond. Please try again or contact support.' }, { status: 500 })
  }

  const signedPdfPath = `${booking.id}/signed-indemnity-bond-${Date.now()}.pdf`
  const { error: pdfUploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(signedPdfPath, signedPdfBytes, { contentType: 'application/pdf', upsert: true })

  if (pdfUploadErr) {
    return NextResponse.json({ error: pdfUploadErr.message }, { status: 500 })
  }

  // ── Persist (Step 7) ────────────────────────────────────────────────
  const now = new Date().toISOString()
  const { error: bondUpdateErr } = await supabaseAdmin
    .from('indemnity_bonds')
    .update({
      aadhaar_number:  aadhaarNumber  || null,
      passport_number: passportNumber || null,
      licence_number:  licenceNumber  || null,
      bond_date:       bondDate,
      bond_place:      bondPlace,
      signed_at:       now,
      signed_pdf_path: signedPdfPath,
      ...uploads,
      document_status: 'pending',
      submitted_at:    now,
      status_history: [
        ...(Array.isArray(bond.status_history) ? bond.status_history : []),
        { event: 'submitted', timestamp: now },
      ],
    })
    .eq('id', bond.id)

  if (bondUpdateErr) {
    return NextResponse.json({ error: bondUpdateErr.message }, { status: 500 })
  }

  // ── Advance booking status ───────────────────────────────────────
  const history = (booking.status_history ?? []) as object[]
  history.push({
    from:       booking.status,
    to:         'indemnity_bond_signed',
    timestamp:  now,
    changed_by: 'customer',
    note:       'Indemnity bond signed and submitted by customer',
  })

  const { error: statusErr } = await supabaseAdmin
    .from('bookings')
    .update({ status: 'indemnity_bond_signed', status_history: history })
    .eq('id', booking.id)

  if (statusErr) {
    return NextResponse.json({ error: statusErr.message }, { status: 500 })
  }

  // ── Notify (Step 9) — best-effort, never blocks the response ───────
  sendIndemnityWhatsApp('documents_submitted', {
    customerPhone: booking.customer_phone,
    customerName:  booking.customer_name,
    trackingId:    booking.tracking_id,
  }, [booking.customer_name ?? 'Customer', booking.tracking_id]).catch(() => {})

  if (booking.customer_email) {
    sendIndemnityBondStatusEmail({
      customerName:  booking.customer_name ?? 'Customer',
      customerEmail: booking.customer_email,
      trackingId:    booking.tracking_id,
      headline:      'Indemnity Bond Received',
      message:       'we\'ve received your signed indemnity bond and documents. Our team will review them shortly — you\'ll be notified once approved.',
    }).catch(() => {})
  }

  // Admin (info@bagdrop.co / aditya@bagdrop.co) needs to know a submission
  // is waiting for review — the customer-facing email above doesn't reach
  // them. The signed bond + every uploaded document are attached directly
  // (built from the same bytes already in memory from this request, so no
  // extra storage round-trip), with a size guard that falls back to
  // link-only if the combined files are too large for one email.
  const attachmentParts: { filename: string; bytes: Uint8Array }[] = [
    { filename: `signed-indemnity-bond-${booking.tracking_id}.pdf`, bytes: signedPdfBytes },
    { filename: `aadhaar-${booking.tracking_id}.${extFor(aadhaarDocFile)}`, bytes: new Uint8Array(await aadhaarDocFile.arrayBuffer()) },
  ]
  if (passportDocFile instanceof File && passportDocFile.size > 0) {
    attachmentParts.push({ filename: `passport-${booking.tracking_id}.${extFor(passportDocFile)}`, bytes: new Uint8Array(await passportDocFile.arrayBuffer()) })
  }
  if (flightTicketDocFile instanceof File && flightTicketDocFile.size > 0) {
    attachmentParts.push({ filename: `flight-ticket-${booking.tracking_id}.${extFor(flightTicketDocFile)}`, bytes: new Uint8Array(await flightTicketDocFile.arrayBuffer()) })
  }
  if (extraDocFile instanceof File && extraDocFile.size > 0) {
    attachmentParts.push({ filename: `extra-doc-${booking.tracking_id}.${extFor(extraDocFile)}`, bytes: new Uint8Array(await extraDocFile.arrayBuffer()) })
  }

  const totalBytes = attachmentParts.reduce((sum, p) => sum + p.bytes.length, 0)
  const attachmentsIncluded = totalBytes <= ADMIN_ATTACHMENT_SIZE_LIMIT_BYTES
  const emailAttachments: EmailAttachment[] | undefined = attachmentsIncluded
    ? attachmentParts.map(p => ({ filename: p.filename, content: Buffer.from(p.bytes).toString('base64') }))
    : undefined

  if (!attachmentsIncluded) {
    console.warn(`[indemnity submit] Booking ${booking.tracking_id} — admin email attachments skipped, combined size ${totalBytes} bytes exceeds ${ADMIN_ATTACHMENT_SIZE_LIMIT_BYTES}`)
  }

  sendIndemnityBondAdminNotification({
    trackingId:      booking.tracking_id,
    // bookings.lead_id does not exist as a column in production (confirmed
    // via Vercel logs) despite being referenced by a couple of admin UI
    // links elsewhere — see the note in lib/indemnity-token.ts. Passing
    // null here just means the notification email's button falls back to
    // the generic /admin/leads page instead of a direct deep link.
    leadId:          null,
    customerName:    booking.customer_name,
    customerPhone:   booking.customer_phone,
    documentStatus:  'pending',
    aadhaarNumber:   aadhaarNumber  || null,
    passportNumber:  passportNumber || null,
    licenceNumber:   licenceNumber  || null,
    submittedAt:     now,
    attachmentsIncluded,
  }, emailAttachments).catch(() => {})

  return NextResponse.json({ success: true })
}
