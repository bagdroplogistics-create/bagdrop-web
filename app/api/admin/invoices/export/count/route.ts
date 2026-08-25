import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { resolveInvoiceDateRange, isInvoiceDateRangeError, type InvoiceDateRangeKind } from '@/lib/invoice-export-dates'
import { countInvoicesForExport } from '@/lib/invoice-export'

// GET /api/admin/invoices/export/count?range=...&month=...&from=...&to=...
//
// Read-only — powers the toolbar's live "Download PDF — 24 Invoices" /
// "Download Excel — 24 Invoices" labels (spec item 5) before the admin
// commits to an actual export. Cheap count-only query, safe to call on
// every filter change.
export const runtime = 'nodejs'

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

  try {
    const count = await countInvoicesForExport(resolved.from, resolved.to)
    return NextResponse.json({ count, label: resolved.label })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
