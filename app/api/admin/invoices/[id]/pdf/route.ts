import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { generateInvoicePdfBuffer } from '@/lib/invoice-pdf'

// Real PDF bytes for a saved invoice — added for the mobile app's
// "Download/share invoice PDF" requirement. The website itself never
// needed this: its Download PDF button generates the file entirely
// client-side via @react-pdf/renderer's browser-only pdf().toBlob() (see
// app/(admin)/admin/invoices/[id]/print/page.tsx). React Native has no
// such browser PDF renderer, so mobile needs actual bytes from the server
// to save via expo-file-system + share via expo-sharing — this endpoint
// reuses the exact same generateInvoicePdfBuffer() the email-attachment
// path already relies on (lib/invoice-pdf.ts), so the mobile-downloaded
// PDF, the emailed PDF, and the website's on-screen preview can never
// visually drift apart from each other.

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data: invoice, error } = await supabaseAdmin.from('invoices').select('*').eq('id', id).single()
  if (error || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const buf = await generateInvoicePdfBuffer(invoice)
  if (!buf) return NextResponse.json({ error: 'Could not generate PDF for this invoice.' }, { status: 500 })

  const filename = `${invoice.invoice_number ?? 'invoice'}.pdf`
  // Buffer satisfies BodyInit at runtime (it IS a Uint8Array), but TS's
  // DOM lib types don't recognize Node's Buffer<ArrayBufferLike> as one —
  // wrap in a plain Uint8Array to satisfy the type checker.
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.length),
    },
  })
}
