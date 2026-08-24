import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { buildQuotePdfBuffer, quotePdfFilename, type LeadRowForPdf } from '@/lib/quote-pdf'

// POST /api/admin/leads/[id]/quote-pdf
//
// Generates the Quote PDF for this lead (same layout as the "Download PDF"
// button on the Booking Workflow page — see lib/quote-pdf.ts) and uploads
// it to Supabase Storage, returning a public URL. Built for the "Send Quote
// via WhatsApp" button (app/(admin)/admin/quotes/view/[lead_id]/page.tsx):
// WhatsApp Web's compose-link (web.whatsapp.com/send?text=...) can only
// pre-fill text, never attach a real file, so a downloadable link in the
// message is the only way to get the PDF into that chat — same approach
// already used by the older quotes-table flow (app/(admin)/admin/quotes/
// page.tsx's sendToCustomer('whatsapp')). Re-uploads (upsert) each time
// this is called, so it always reflects the latest quote edits.
export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  if (!lead.quote_number && !lead.zoho_estimate_number) {
    return NextResponse.json({ error: 'This lead has no quote yet — generate a quote first.' }, { status: 400 })
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await buildQuotePdfBuffer(lead as LeadRowForPdf)
  } catch (err) {
    console.error('[leads/quote-pdf] PDF generation error:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }

  const filename    = quotePdfFilename(lead as LeadRowForPdf)
  // Namespaced under leads/ in the same 'quotes' bucket the older
  // quotes-table PDF flow (app/api/admin/quotes/[id]/upload-pdf/route.ts)
  // already uses — different ID space (lead id, not a quotes-table row id),
  // so paths can never collide between the two.
  const storagePath = `leads/${id}/${filename}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('quotes')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    console.error('[leads/quote-pdf] Storage upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabaseAdmin.storage.from('quotes').getPublicUrl(storagePath)

  return NextResponse.json({ url: urlData.publicUrl, filename })
}
