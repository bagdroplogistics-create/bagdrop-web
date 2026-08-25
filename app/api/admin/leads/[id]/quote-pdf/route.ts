import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { getQuotePdfUrl, type LeadRowForPdf } from '@/lib/quote-pdf'

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

  try {
    // getQuotePdfUrl (lib/quote-pdf.ts) always regenerates the PDF fresh off
    // this lead's CURRENT row and re-uploads (upsert) to the same
    // deterministic storage path, so the URL returned here can never be an
    // old/previous version of the quote — see its own doc comment.
    const { url, filename } = await getQuotePdfUrl(lead as LeadRowForPdf)
    return NextResponse.json({ url, filename })
  } catch (err) {
    console.error('[leads/quote-pdf] PDF generation/upload error:', err)
    return NextResponse.json({ error: 'Unable to attach Quote PDF. Please try again.' }, { status: 500 })
  }
}
