// BAGDROP — lib/invoice-export.ts
//
// Server-only support for the Invoice tab's bulk export toolbar (founder
// spec, 2026-08-26): "Download All PDF / Download All Excel", plus
// This Month / Last Month / Select Month / Custom Date Range variants, and
// a single-invoice Excel export.
//
// ── Data protection (spec item 10) ──────────────────────────────────────
// Exports read ONLY real rows from the `invoices` table — never the
// synthetic "pending-<booking_id>" placeholder rows GET /api/admin/invoices
// merges in for the on-screen backlog view (see that route's comment).
// Exporting never creates, modifies, or duplicates an invoice row.
//
// ── PDF generation (spec item 6) ─────────────────────────────────────────
// Reuses generateInvoicePdfBuffer() from lib/invoice-pdf.ts UNCHANGED —
// the exact same function that already renders the individual-download
// route (app/api/admin/invoices/[id]/pdf/route.ts) and the email
// attachment. The bulk PDF export is never a separate/re-implemented
// invoice design; it is that same PDF, generated once per invoice, packed
// into one ZIP via jszip.

import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { supabaseAdmin } from './supabase'
import { formatCustomerName } from './constants'
import { generateInvoicePdfBuffer } from './invoice-pdf'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InvoiceRow = Record<string, any>

/**
 * Real invoice rows only, filtered by invoice_date (inclusive from/to, or
 * unfiltered when both are null — the "All" range). Ordered oldest → newest
 * so ZIP contents and Excel rows read chronologically.
 */
export async function fetchInvoicesForExport(from: string | null, to: string | null): Promise<InvoiceRow[]> {
  let query = supabaseAdmin.from('invoices').select('*').order('invoice_date', { ascending: true })
  if (from) query = query.gte('invoice_date', from)
  if (to)   query = query.lte('invoice_date', to)
  const { data, error } = await query
  if (error) throw new Error(`Failed to load invoices: ${error.message}`)
  return data ?? []
}

/**
 * Cheap `count`-only query (no rows fetched) powering the toolbar's live
 * "Download PDF — 24 Invoices" label — kept as its own function so the
 * count shown before the admin clicks download can be computed without
 * paying for a full row fetch, and without depending on whatever page/
 * filter state the on-screen table happens to be in (that table is paged
 * and search-filtered independently of the export's date-range filter).
 */
export async function countInvoicesForExport(from: string | null, to: string | null): Promise<number> {
  let query = supabaseAdmin.from('invoices').select('id', { count: 'exact', head: true })
  if (from) query = query.gte('invoice_date', from)
  if (to)   query = query.lte('invoice_date', to)
  const { count, error } = await query
  if (error) throw new Error(`Failed to count invoices: ${error.message}`)
  return count ?? 0
}

export async function fetchInvoiceById(id: string): Promise<InvoiceRow | null> {
  const { data, error } = await supabaseAdmin.from('invoices').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load invoice: ${error.message}`)
  return data ?? null
}

/**
 * Most recent CONFIRMED payment date per booking_id, batched (one query for
 * every invoice in the export, not N+1) — mirrors the batched
 * fetchInquiryIdsByBooking() pattern from lib/confirmed-ongoing-summary.ts.
 * Only `payments.payment_status === 'paid'` rows count, matching the exact
 * rule lib/payment-status.ts already uses for "Total Paid" — an invoice
 * with only a pending/failed payment attempt logged shows no Payment Date,
 * not a misleading one. Real data via the existing booking_id relationship
 * (the same one InvoiceDetailPanel's "Payments Received" count already
 * relies on) — never fabricated.
 */
async function fetchPaymentDatesByBooking(bookingIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(bookingIds.filter(Boolean))]
  if (ids.length === 0) return {}
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('booking_id, payment_date, created_at')
    .in('booking_id', ids)
    .eq('payment_status', 'paid')
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('[invoice-export] payments lookup failed (non-fatal, Payment Date will show as —):', error.message)
    return {}
  }
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as { booking_id: string | null; payment_date: string | null; created_at: string }[]) {
    if (!row.booking_id || map[row.booking_id]) continue // already have the newest for this booking (query is newest-first)
    map[row.booking_id] = row.payment_date || row.created_at
  }
  return map
}

// ── Filenames ──────────────────────────────────────────────────────────
function sanitizeFilenamePart(s: string): string {
  return (s || '').trim().replace(/[^a-zA-Z0-9\- ]+/g, '').trim().replace(/\s+/g, '-') || 'Unknown'
}

/** e.g. "BLS2600125_Raj-Patel.pdf" — matches the founder spec's suggested pattern. Falls back cleanly when a field is missing. */
export function buildInvoicePdfFilename(inv: InvoiceRow): string {
  const number = inv.invoice_number ? sanitizeFilenamePart(inv.invoice_number) : 'Invoice'
  const name   = sanitizeFilenamePart(formatCustomerName(inv.title, inv.customer_name) || inv.customer_name || '')
  return `${number}_${name}.pdf`
}

export function buildExportBaseFilename(kind: 'PDF' | 'Excel', label: string): string {
  const stamp = label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `Bagdrop_Invoices_${stamp || 'Export'}_${kind}`
}

// ── ZIP (PDF) export ─────────────────────────────────────────────────────
export interface BuildZipResult {
  buffer: Buffer
  totalCount: number
  successCount: number
  failedInvoiceNumbers: string[]
}

/**
 * Builds one ZIP containing every invoice's PDF (existing design,
 * untouched — see file-header comment). If an individual invoice's PDF
 * generation fails, it's skipped (logged) rather than aborting the whole
 * export — the admin still gets everything that succeeded, and the route
 * layer reports the skipped count back so nothing fails silently (spec
 * item 9: "do not generate a corrupted/partial file without informing the
 * admin").
 */
export async function buildInvoiceZipBuffer(invoices: InvoiceRow[]): Promise<BuildZipResult> {
  const zip = new JSZip()
  const usedNames = new Set<string>()
  const failedInvoiceNumbers: string[] = []

  for (const inv of invoices) {
    const buf = await generateInvoicePdfBuffer(inv)
    if (!buf) {
      failedInvoiceNumbers.push(inv.invoice_number ?? inv.id)
      continue
    }
    let filename = buildInvoicePdfFilename(inv)
    // Defensive de-dupe — invoice numbers are unique in practice (assigned
    // via lib/invoice-numbering.ts's atomic sequence), but never let a
    // filename collision silently overwrite an entry inside the zip.
    if (usedNames.has(filename)) {
      const base = filename.replace(/\.pdf$/, '')
      let n = 2
      while (usedNames.has(`${base}_${n}.pdf`)) n++
      filename = `${base}_${n}.pdf`
    }
    usedNames.add(filename)
    zip.file(filename, buf)
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return {
    buffer,
    totalCount: invoices.length,
    successCount: invoices.length - failedInvoiceNumbers.length,
    failedInvoiceNumbers,
  }
}

// ── Excel export ──────────────────────────────────────────────────────────
// One invoice = one row. Real Date objects and numeric values (not
// strings) so Excel treats them as actual dates/numbers — spec item 7.
// Column order follows the founder's own listed priority, then a handful
// of additional existing fields ("Any other existing invoice fields").
const EXCEL_COLUMNS: { header: string; width: number }[] = [
  { header: 'Invoice Number',   width: 16 },
  { header: 'Invoice Date',     width: 13 },
  { header: 'Tracking ID',      width: 16 },
  { header: 'Customer Name',    width: 24 },
  { header: 'Customer Contact', width: 15 },
  { header: 'Customer Email',   width: 24 },
  { header: 'Pickup Location',  width: 20 },
  { header: 'Delivery Location',width: 20 },
  { header: 'Pickup Date',      width: 13 },
  { header: 'Delivery Date',    width: 13 },
  { header: 'Service Type',     width: 20 },
  { header: 'Number of Bags',   width: 14 },
  { header: 'Taxable Amount',   width: 15 },
  { header: 'CGST',             width: 12 },
  { header: 'SGST',             width: 12 },
  { header: 'IGST',             width: 12 },
  { header: 'Tax / GST',        width: 12 },
  { header: 'Total Amount',     width: 15 },
  { header: 'Payment Status',   width: 15 },
  { header: 'Payment Method',   width: 15 },
  { header: 'Payment Date',     width: 13 },
  // Derived from payment_status + sent_email/sent_whatsapp (no dedicated
  // "invoice status" column exists in the schema) — documented here so
  // this is understood as computed, not a stored field. See the spec's
  // "Invoice Status" line item.
  { header: 'Invoice Status',   width: 16 },
  { header: 'Sent Email',       width: 11 },
  { header: 'Sent WhatsApp',    width: 13 },
  { header: 'Business Name',    width: 22 },
  { header: 'GST Number',       width: 17 },
  { header: 'Remark',           width: 28 },
]

function dateOrBlank(d: string | null | undefined): Date | string {
  if (!d) return ''
  const dt = new Date(d.includes('T') ? d : `${d}T00:00:00Z`)
  return isNaN(dt.getTime()) ? '' : dt
}

function invoiceStatusLabel(inv: InvoiceRow): string {
  if (inv.payment_status === 'paid') return 'Paid'
  if (inv.sent_email || inv.sent_whatsapp) return 'Sent - Pending Payment'
  return 'Generated - Not Sent'
}

async function buildInvoiceExcelWorkbook(invoices: InvoiceRow[]): Promise<XLSX.WorkBook> {
  const paymentDates = await fetchPaymentDatesByBooking(invoices.map(i => i.booking_id).filter(Boolean))

  const rows = invoices.map(inv => ([
    inv.invoice_number ?? '',
    dateOrBlank(inv.invoice_date),
    inv.consignment_no ?? '',
    formatCustomerName(inv.title, inv.customer_name) || inv.customer_name || '',
    inv.customer_phone ?? '',
    inv.customer_email ?? '',
    inv.pickup_address || inv.from_city || '',
    inv.delivery_address || inv.to_city || '',
    dateOrBlank(inv.pickup_date),
    dateOrBlank(inv.delivery_date),
    inv.service_type ?? '',
    Number(inv.total_bags ?? 0),
    Number(inv.base_amount ?? 0),
    Number(inv.cgst ?? 0),
    Number(inv.sgst ?? 0),
    Number(inv.igst ?? 0),
    Number(inv.cgst ?? 0) + Number(inv.sgst ?? 0) + Number(inv.igst ?? 0),
    Number(inv.total_amount ?? 0),
    inv.payment_status ?? '',
    inv.payment_method ?? '',
    dateOrBlank(inv.booking_id ? paymentDates[inv.booking_id] : null),
    invoiceStatusLabel(inv),
    inv.sent_email ? 'Yes' : 'No',
    inv.sent_whatsapp ? 'Yes' : 'No',
    inv.business_name ?? '',
    inv.gst_number ?? '',
    inv.notes ?? '',
  ]))

  const aoa = [EXCEL_COLUMNS.map(c => c.header), ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = EXCEL_COLUMNS.map(c => ({ wch: c.width }))
  // Auto-filter across the full header + data range (spec item 7).
  const lastCol = XLSX.utils.encode_col(EXCEL_COLUMNS.length - 1)
  const lastRow = rows.length + 1
  ws['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
  return wb
}

export async function buildInvoiceExcelBuffer(invoices: InvoiceRow[]): Promise<Buffer> {
  const wb = await buildInvoiceExcelWorkbook(invoices)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true })
  return buf as Buffer
}
