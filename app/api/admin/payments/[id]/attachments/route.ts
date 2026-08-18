import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// Attachments for the Record Payment form (Zoho Books parity — see
// app/(admin)/admin/payments/page.tsx's RecordPaymentModal). A payment can
// have several files (bank statement, cheque photo, receipt scan); each
// upload here appends one entry to payments.attachments (jsonb array; see
// supabase/migrations/20260818c_payment_attachments.sql) rather than
// replacing it, since payment-proof upload (a separate, older flow at
// app/api/admin/bookings/[id]/payment-proof/route.ts) uses a single
// proof_url column instead — this is deliberately independent of that.
//
// Same allowed-type/size policy as the existing payment-proof upload route,
// reused rather than inventing a new one: images or PDF, 10MB per file.

export const runtime = 'nodejs'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_ATTACHMENTS = 5

interface Attachment {
  url: string; filename: string; size: number; type: string; uploaded_at: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: paymentId } = await params

  const { data: payment, error: paymentErr } = await supabaseAdmin
    .from('payments')
    .select('id, attachments')
    .eq('id', paymentId)
    .single()
  if (paymentErr || !payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type. Upload an image (JPG/PNG/WEBP/HEIC) or a PDF.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 10MB).' }, { status: 400 })

  const existing: Attachment[] = Array.isArray(payment.attachments) ? payment.attachments : []
  if (existing.length >= MAX_ATTACHMENTS) {
    return NextResponse.json({ error: `Maximum ${MAX_ATTACHMENTS} attachments per payment.` }, { status: 400 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${paymentId}/${Date.now()}-${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabaseAdmin.storage
    .from('payment-attachments')
    .upload(storagePath, Buffer.from(arrayBuffer), { contentType: file.type, upsert: false })
  if (uploadError) {
    console.error('[payments/attachments] Storage upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabaseAdmin.storage.from('payment-attachments').getPublicUrl(storagePath)

  const newAttachment: Attachment = {
    url: urlData.publicUrl, filename: file.name, size: file.size, type: file.type,
    uploaded_at: new Date().toISOString(),
  }
  const attachments = [...existing, newAttachment]

  const { error: updateErr } = await supabaseAdmin.from('payments').update({ attachments }).eq('id', paymentId)
  if (updateErr) return NextResponse.json({ error: 'Uploaded, but failed to save attachment record: ' + updateErr.message }, { status: 500 })

  return NextResponse.json({ attachment: newAttachment, attachments })
}

// Removes one attachment by URL. Best-effort storage delete — even if the
// underlying file removal fails (e.g. already gone), the metadata is still
// removed from the payments row so the UI doesn't show a dead link.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: paymentId } = await params

  const body = await req.json().catch(() => null) as { url?: string } | null
  if (!body?.url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const { data: payment, error: paymentErr } = await supabaseAdmin
    .from('payments')
    .select('id, attachments')
    .eq('id', paymentId)
    .single()
  if (paymentErr || !payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  const existing: Attachment[] = Array.isArray(payment.attachments) ? payment.attachments : []
  const attachments = existing.filter(a => a.url !== body.url)

  const removed = existing.find(a => a.url === body.url)
  if (removed) {
    const storagePath = removed.url.split('/payment-attachments/')[1]
    if (storagePath) {
      const { error: removeErr } = await supabaseAdmin.storage.from('payment-attachments').remove([storagePath])
      if (removeErr) console.warn('[payments/attachments] storage remove failed (non-fatal):', removeErr.message)
    }
  }

  const { error: updateErr } = await supabaseAdmin.from('payments').update({ attachments }).eq('id', paymentId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ attachments })
}
