// BAGDROP — lib/invoice-export-dates.ts
//
// Shared date-range resolution for the Invoice tab's bulk export toolbar
// (founder spec, 2026-08-26). Deliberately dependency-free (no
// supabaseAdmin import) — same pattern established this session for
// lib/booking-status.ts — so it can be imported from BOTH:
//   - the client component (app/(admin)/admin/invoices/page.tsx), to
//     compute the "Download PDF — 24 Invoices" live count from the
//     already-loaded invoice list, and
//   - the server export routes (app/api/admin/invoices/export/*), to
//     filter the real database query.
// One implementation, so the count shown to the admin before they click
// download can never drift from what the export route actually returns.
//
// ── Mandatory date logic (founder spec item 8) ──────────────────────────
// All range filters below operate on invoice_date (which itself always
// equals the booking's Delivery Date — see the invoice_date resolution
// comment in app/api/admin/invoices/route.ts's POST handler). Never
// inquiry date, quote date, payment date, or booking creation date.

export type InvoiceDateRangeKind = 'all' | 'this_month' | 'last_month' | 'month' | 'custom'

export interface InvoiceDateRangeParams {
  range: InvoiceDateRangeKind
  /** Required when range === 'month'. 'YYYY-MM'. */
  month?: string | null
  /** Required when range === 'custom'. 'YYYY-MM-DD'. */
  from?: string | null
  /** Required when range === 'custom'. 'YYYY-MM-DD'. */
  to?: string | null
}

export interface ResolvedInvoiceDateRange {
  /** Inclusive lower bound, 'YYYY-MM-DD', or null for range === 'all'. */
  from: string | null
  /** Inclusive upper bound, 'YYYY-MM-DD', or null for range === 'all'. */
  to: string | null
  /** Short human label for filenames/UI, e.g. "August 2026", "1 Aug 2026 - 15 Aug 2026", "All Invoices". */
  label: string
}

export const INVOICE_DATE_RANGE_OPTIONS: { value: InvoiceDateRangeKind; label: string }[] = [
  { value: 'all',        label: 'All' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'month',      label: 'Select Month' },
  { value: 'custom',     label: 'Custom Date Range' },
]

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

/** IST 'today' as {year, month(1-12)} — independent of server/browser TZ, same Intl-based approach as istDateStr() in lib/confirmed-ongoing-summary.ts. */
function istYearMonth(now: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
  }).formatToParts(now)
  const year  = Number(parts.find(p => p.type === 'year')?.value ?? now.getFullYear())
  const month = Number(parts.find(p => p.type === 'month')?.value ?? now.getMonth() + 1)
  return { year, month }
}

function pad2(n: number): string { return String(n).padStart(2, '0') }

/** Last calendar day of a given year/month(1-12), as 'YYYY-MM-DD'. */
function monthEnd(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate() // day 0 of next month = last day of this month
  return `${year}-${pad2(month)}-${pad2(lastDay)}`
}
function monthStart(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`
}
function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}
function fmtLabelDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`
}

/**
 * Resolves a range kind + params into concrete from/to bounds (or 'all').
 * Returns { error } instead of throwing when a required param is missing
 * or malformed, so both callers (UI count + export route) can surface a
 * clear message rather than silently exporting the wrong thing.
 */
export function resolveInvoiceDateRange(
  params: InvoiceDateRangeParams,
  now: Date = new Date()
): ResolvedInvoiceDateRange | { error: string } {
  const { range } = params

  if (range === 'all') {
    return { from: null, to: null, label: 'All Invoices' }
  }

  if (range === 'this_month' || range === 'last_month') {
    const { year, month } = istYearMonth(now)
    const targetMonth = range === 'this_month' ? month : month - 1
    const targetYear  = targetMonth < 1 ? year - 1 : year
    const normMonth   = targetMonth < 1 ? 12 : targetMonth
    return {
      from: monthStart(targetYear, normMonth),
      to:   monthEnd(targetYear, normMonth),
      label: monthLabel(targetYear, normMonth),
    }
  }

  if (range === 'month') {
    const m = (params.month ?? '').trim()
    if (!/^\d{4}-\d{2}$/.test(m)) return { error: 'Select a month to export.' }
    const [yStr, moStr] = m.split('-')
    const year = Number(yStr), month = Number(moStr)
    if (month < 1 || month > 12) return { error: 'Invalid month.' }
    return { from: monthStart(year, month), to: monthEnd(year, month), label: monthLabel(year, month) }
  }

  if (range === 'custom') {
    const from = (params.from ?? '').trim()
    const to   = (params.to ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { error: 'Select both a From Date and a To Date.' }
    }
    if (from > to) return { error: 'From Date must be on or before To Date.' }
    return { from, to, label: `${fmtLabelDate(from)} - ${fmtLabelDate(to)}` }
  }

  return { error: 'Unknown date range.' }
}

export function isInvoiceDateRangeError(r: ResolvedInvoiceDateRange | { error: string }): r is { error: string } {
  return 'error' in r
}
