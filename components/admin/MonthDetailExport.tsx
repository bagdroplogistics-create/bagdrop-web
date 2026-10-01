'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { downloadCSV, downloadExcel, downloadExcelMultiSheet, downloadPDF, type ReportColumn, type ReportRow } from '@/lib/report-export'

// BAGDROP — Month-wise record-level detail export.
//
// Founder request, 2026-10-01: "i want to download separate month wise
// with all the inquiry data coming in that particular month for all the
// Confirmed Bookings, Payments Received, Total Inquiries" — distinct from
// the Monthly Summary report's one-row-per-month COUNTS table (built
// moments earlier): this is the individual record list behind each of
// those three categories, for one selected month, downloadable together.
//
// Reuses the EXISTING /api/admin/dashboard-v2 endpoint's drilldown feature
// (built 2026-09-16 for the Business Overview cards' click-through) rather
// than a new backend route — same 'custom' range + drilldown=<key> request
// shape the Dashboard's own cards already use, so these record lists can
// never disagree with what the Dashboard shows for that month. See lib/
// dashboard-analytics-v2.ts's buildDrilldownRecords for the exact
// definitions (confirmed_bookings in particular was corrected three times
// earlier today — cancelled/refunded exclusion, FOC inclusion, operational-
// month bucketing — this inherits all of that for free by calling the same
// code path).

interface DrilldownRecord {
  id: string
  date: string | null
  customer_name: string | null
  tracking_id: string | null
  route: string | null
  status: string | null
  amount: number | null
}

const CATEGORIES = [
  { key: 'total_inquiries',    label: 'Total Inquiries',    sheet: 'Total Inquiries' },
  { key: 'confirmed_bookings', label: 'Confirmed Bookings', sheet: 'Confirmed Bookings' },
  { key: 'payments_received',  label: 'Payments Received',  sheet: 'Payments Received' },
] as const

const EXPORT_COLUMNS: ReportColumn[] = [
  { key: 'date', label: 'Date' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'tracking_id', label: 'Tracking ID' },
  { key: 'route', label: 'Route' },
  { key: 'status', label: 'Status' },
  { key: 'amount', label: 'Amount' },
]

function fmtRs(n: number | null) { return n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }) }

function pad2(n: number) { return String(n).padStart(2, '0') }

// Software go-live — matches EARLIEST_REPORT_YEAR/MONTH in
// lib/dashboard-analytics-v2.ts's getMonthlySummaryReport (founder-
// confirmed 2026-10-01: "we have started using this software from june
// 2026"). Keep these two in sync if that ever changes.
const EARLIEST_YEAR = 2026
const EARLIEST_MONTH = 5 // June, 0-indexed

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function monthOptions(): { value: string; label: string }[] {
  const now = new Date()
  const curY = now.getFullYear(), curM = now.getMonth()
  const opts: { value: string; label: string }[] = []
  for (let y = EARLIEST_YEAR; y <= curY; y++) {
    const startM = y === EARLIEST_YEAR ? EARLIEST_MONTH : 0
    const endM = y === curY ? curM : 11
    for (let m = startM; m <= endM; m++) {
      opts.push({ value: `${y}-${pad2(m + 1)}`, label: `${MONTH_NAMES[m]} ${y}` })
    }
  }
  return opts.reverse() // newest first
}

export default function MonthDetailExport({ adminKey }: { adminKey: string }) {
  const options = useMemo(() => monthOptions(), [])
  const [month, setMonth] = useState(options[0]?.value ?? '')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Record<string, DrilldownRecord[]>>({})
  const [activeCat, setActiveCat] = useState<typeof CATEGORIES[number]['key']>('total_inquiries')

  useEffect(() => {
    if (!adminKey || !month) return
    let cancelled = false
    setLoading(true)
    const [y, m] = month.split('-').map(Number)
    const from = `${y}-${pad2(m)}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const to = `${y}-${pad2(m)}-${pad2(lastDay)}`

    Promise.all(CATEGORIES.map(async c => {
      const qs = `?key=${adminKey}&range=custom&date_from=${from}&date_to=${to}&drilldown=${c.key}`
      const res = await fetch('/api/admin/dashboard-v2' + qs)
      if (!res.ok) return [c.key, []] as const
      const json = await res.json()
      return [c.key, (json.drilldown_records ?? []) as DrilldownRecord[]] as const
    })).then(results => {
      if (cancelled) return
      setData(Object.fromEntries(results))
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [adminKey, month])

  const rowsFor = (key: string): ReportRow[] =>
    (data[key] ?? []).map(r => ({
      date: r.date ? r.date.slice(0, 10) : '—',
      customer_name: r.customer_name ?? '—',
      tracking_id: r.tracking_id ?? '—',
      route: r.route ?? '—',
      status: r.status ?? '—',
      amount: fmtRs(r.amount),
    }))

  const monthLabel = options.find(o => o.value === month)?.label ?? month

  async function downloadAllExcel() {
    await downloadExcelMultiSheet(
      CATEGORIES.map(c => ({ name: c.sheet, columns: EXPORT_COLUMNS, rows: rowsFor(c.key) })),
      `bagdrop_month_detail_${month}`,
    )
  }

  const activeRows = rowsFor(activeCat)
  const activeLabel = CATEGORIES.find(c => c.key === activeCat)?.label ?? ''

  return (
    <div className="mt-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Month-wise Record Detail</h2>
          <p className="mt-0.5 text-xs text-gray-400">Every individual inquiry, confirmed booking, and payment for one month — select a month and download</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 focus:border-orange-400 focus:outline-none">
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={downloadAllExcel} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <FileSpreadsheet className="h-3 w-3" /> Download All (Excel, 3 sheets)
          </button>
        </div>
      </div>

      {/* Category sub-tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setActiveCat(c.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeCat === c.key ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
            {c.label} ({(data[c.key] ?? []).length})
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => downloadCSV(EXPORT_COLUMNS, activeRows, `bagdrop_${activeCat}_${month}`)} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <Download className="h-3 w-3" /> CSV
        </button>
        <button onClick={() => downloadExcel(EXPORT_COLUMNS, activeRows, `bagdrop_${activeCat}_${month}`, activeLabel)} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <FileSpreadsheet className="h-3 w-3" /> Excel
        </button>
        <button onClick={() => downloadPDF(EXPORT_COLUMNS, activeRows, `bagdrop_${activeCat}_${month}`, `${activeLabel} — ${monthLabel}`)} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <FileText className="h-3 w-3" /> PDF
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-xs text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading {monthLabel}…
          </div>
        ) : activeRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">No {activeLabel.toLowerCase()} for {monthLabel}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {EXPORT_COLUMNS.map(c => (
                  <th key={c.key} className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold text-gray-500">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activeRows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {EXPORT_COLUMNS.map(c => (
                    <td key={c.key} className="whitespace-nowrap px-4 py-2.5 text-gray-700">{String(row[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
