import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { resolveInvoiceDateRange, isInvoiceDateRangeError, type InvoiceDateRangeKind } from '@/lib/invoice-export-dates'
import { fetchInvoicesForExport, buildInvoiceZipBuffer, buildExportBaseFilename } from '@/lib/invoice-export'

// GET /api/admin/invoices/export/pdf?range=all|this_month|last_month|month|custom&month=YYYY-MM&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Bulk PDF export (founder spec, 2026-08-26): every real invoice matching
// the selected date range, packaged into one ZIP — see lib/invoice-export.ts
// for the full design rationale (reuses the existing invoice PDF design
// unchanged, real invoice_date filtering only, real rows only).
//
// Runs server-side (Node runtime, not Edge) since @react-pdf/renderer's
// pdf().toBlob() and jszip both need Node APIs. maxDuration matches the
// other longer-running admin/cron routes in this app (60s) — generating
// N PDFs sequentially is the bottleneck for a large date range; if this
// app's invoice volume grows enough to need more, the fix is batching
// generateInvoicePdfBuffer() calls concurrently, not raising the timeout
// alone.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const range = (searchParams.get('range') ?? 'all') as InvoiceDateRangeKind
  const month = searchParams.get('month')
  const from  = searchParams.get('from')
  const to    = searchParams.get('to')

  const resolved = resolveInvoiceDateRange({ range, month, from, to })
  if (isInvoiceDateRangeError(resolved)) {
    return NextResponse.json({ error: resolved.error }, { status: 400 })
  }

  let invoices
  try {
    invoices = await fetchInvoicesForExport(resolved.from, resolved.to)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  if (invoices.length === 0) {
    return NextResponse.json({ error: `No invoices found for ${resolved.label}.` }, { status: 404 })
  }

  const { buffer, totalCount, successCount, failedInvoiceNumbers } = await buildInvoiceZipBuffer(invoices)

  if (successCount === 0) {
    return NextResponse.json({
      error: `Could not generate any invoice PDFs for ${resolved.label}. Please try again or contact support.`,
    }, { status: 500 })
  }

  const filename = `${buildExportBaseFilename('PDF', resolved.label)}.zip`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      // Custom headers so the client can show "24 exported, 1 skipped"
      // even though the response body itself is the binary zip — never
      // silently short the admin a file without telling them (spec item 9).
      'X-Invoice-Export-Total':   String(totalCount),
      'X-Invoice-Export-Success': String(successCount),
      'X-Invoice-Export-Failed':  String(failedInvoiceNumbers.length),
    },
  })
}
