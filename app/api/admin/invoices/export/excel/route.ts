import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { resolveInvoiceDateRange, isInvoiceDateRangeError, type InvoiceDateRangeKind } from '@/lib/invoice-export-dates'
import { fetchInvoicesForExport, fetchInvoiceById, buildInvoiceExcelBuffer, buildExportBaseFilename } from '@/lib/invoice-export'

// GET /api/admin/invoices/export/excel?range=all|this_month|last_month|month|custom&month=YYYY-MM&from=YYYY-MM-DD&to=YYYY-MM-DD
// GET /api/admin/invoices/export/excel?invoice_id=<id>   — single-invoice export (spec item 4, "optionally: Excel ↓" per row)
//
// Bulk (or single-row) Excel export — see lib/invoice-export.ts for column
// list and the real-Date/real-number formatting rationale (spec item 7).
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const invoiceId = searchParams.get('invoice_id')

  if (invoiceId) {
    let invoice
    try {
      invoice = await fetchInvoiceById(invoiceId)
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const buffer = await buildInvoiceExcelBuffer([invoice])
    const filename = `${invoice.invoice_number ?? 'Invoice'}.xlsx`
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  }

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

  const buffer = await buildInvoiceExcelBuffer(invoices)
  const filename = `${buildExportBaseFilename('Excel', resolved.label)}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'X-Invoice-Export-Total': String(invoices.length),
    },
  })
}
