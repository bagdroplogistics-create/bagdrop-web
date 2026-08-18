import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// Attachments for the New Invoice form (Zoho Books parity — see
// app/(admin)/admin/invoices/new/page.tsx). Same "create row, then attach"
// pattern and same allowed-type/size/count policy as
// app/api/admin/payments/[id]/attachments/route.ts — duplicated rather
// than shared since each table's row shape/bucket differ, matching this
// codebase's existing preference for small duplication over cross-cutting
// abstraction (see lib/number-to-words.ts's comment for the same call).

export const runtime = 'nodejs'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_ATTACHMENTS = 10 // matches Zoho's own "maximum 10 files" copy on the New Invoice form

interface Attachment {
  url: string; filename: string; size: number; type: string; uploaded_at: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: invoiceId } = await params

  const { data: invoice, error: invErr } = await supabaseAdmin
    .from('invoices')
    .select('id, attachments')
    .eq('id', invoiceId)
    .single()
  if (invErr || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

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

  const existing: Attachment[] = Array.isArray(invoice.attachments) ? invoice.attachments : []
  if (existing.length >= MAX_ATTACHMENTS) {
    return NextResponse.json({ error: `Maximum ${MAX_ATTACHMENTS} attachments per invoice.` }, { status: 400 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${invoiceId}/${Date.now()}-${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabaseAdmin.storage
    .from('invoice-attachments')
    .upload(storagePath, Buffer.from(arrayBuffer), { contentType: file.type, upsert: false })
  if (uploadError) {
    console.error('[invoices/attachments] Storage upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabaseAdmin.storage.from('invoice-attachments').getPublicUrl(storagePath)

  const newAttachment: Attachment = {
    url: urlData.publicUrl, filename: file.name, size: file.size, type: file.type,
    uploaded_at: new Date().toISOString(),
  }
  const attachments = [...existing, newAttachment]

  const { error: updateErr } = await supabaseAdmin.from('invoices').update({ attachments }).eq('id', invoiceId)
  if (updateErr) return NextResponse.json({ error: 'Uploaded, but failed to save attachment record: ' + updateErr.message }, { status: 500 })

  return NextResponse.json({ attachment: newAttachment, attachments })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: invoiceId } = await params

  const body = await req.json().catch(() => null) as { url?: string } | null
  if (!body?.url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const { data: invoice, error: invErr } = await supabaseAdmin
    .from('invoices')
    .select('id, attachments')
    .eq('id', invoiceId)
    .single()
  if (invErr || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const existing: Attachment[] = Array.isArray(invoice.attachments) ? invoice.attachments : []
  const attachments = existing.filter(a => a.url !== body.url)

  const removed = existing.find(a => a.url === body.url)
  if (removed) {
    const storagePath = removed.url.split('/invoice-attachments/')[1]
    if (storagePath) {
      const { error: removeErr } = await supabaseAdmin.storage.from('invoice-attachments').remove([storagePath])
      if (removeErr) console.warn('[invoices/attachments] storage remove failed (non-fatal):', removeErr.message)
    }
  }

  const { error: updateErr } = await supabaseAdmin.from('invoices').update({ attachments }).eq('id', invoiceId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ attachments })
}
