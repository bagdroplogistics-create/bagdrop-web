'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, FileSpreadsheet, FileText, Printer, RefreshCw, Filter as FilterIcon } from 'lucide-react'
import { downloadCSV, downloadExcel, downloadPDF, printReport, type ReportColumn, type ReportRow } from '@/lib/report-export'

// Generic filterable, exportable report table — shared by all 9 "detailed
// report" tabs on /admin/reports (Inquiry Source, Booking Status, Route
// Performance, Partner, Customer, Payment, Driver & Operations, Document,
// Cancellation). Talks to the single generic backend at
// app/api/admin/reports/detailed/route.ts. The existing Revenue tab keeps
// its own bespoke UI (charts) and is not routed through this component.

export interface FilterConfig {
  showService?: boolean
  showSource?: boolean
  showStatus?: boolean
  showPartner?: boolean
  showCity?: boolean
  statusOptions?: string[]
  sourceOptions?: string[]
}

interface Props {
  adminKey:  string
  type:      string
  title:     string
  subtitle?: string
  filters?:  FilterConfig
  emptyRowLinkKey?: string   // row key (e.g. 'lead_id') used to make rows clickable
  emptyRowLinkBase?: string  // href prefix, e.g. '/admin/quotes/view/'
}

interface ReportResponse { columns: ReportColumn[]; rows: ReportRow[]; summary: { label: string; value: string }[] }

export default function DetailedReportView({ adminKey, type, title, subtitle, filters, emptyRowLinkKey, emptyRowLinkBase }: Props) {
  const router = useRouter()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [service, setService] = useState('')
  const [source, setSource] = useState('')
  const [status, setStatus] = useState('')
  const [partner, setPartner] = useState('')
  const [city, setCity] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [data, setData] = useState<ReportResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = new URLSearchParams({ type, key: adminKey })
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    if (service) qs.set('service', service)
    if (source) qs.set('source', source)
    if (status) qs.set('status', status)
    if (partner) qs.set('partner', partner)
    if (city) qs.set('city', city)
    try {
      const res = await fetch('/api/admin/reports/detailed?' + qs.toString())
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [adminKey, type, from, to, service, source, status, partner, city])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleExport(format: 'csv' | 'excel' | 'pdf' | 'print') {
    if (!data) return
    setExporting(format)
    try {
      const base = title.toLowerCase().replace(/\s+/g, '_')
      if (format === 'csv') downloadCSV(data.columns, data.rows, base)
      else if (format === 'excel') await downloadExcel(data.columns, data.rows, base, title)
      else if (format === 'pdf') await downloadPDF(data.columns, data.rows, base, title, data.summary)
      else printReport(data.columns, data.rows, title, data.summary)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowFilters(s => !s)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${showFilters ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
            <FilterIcon className="h-3 w-3" /> Filters
          </button>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <div className="mx-1 h-4 w-px bg-gray-200" />
          <button onClick={() => handleExport('csv')} disabled={!data || exporting !== null}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <Download className="h-3 w-3" /> CSV
          </button>
          <button onClick={() => handleExport('excel')} disabled={!data || exporting !== null}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </button>
          <button onClick={() => handleExport('pdf')} disabled={!data || exporting !== null}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <FileText className="h-3 w-3" /> PDF
          </button>
          <button onClick={() => handleExport('print')} disabled={!data || exporting !== null}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <Printer className="h-3 w-3" /> Print
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none" />
          </div>
          {filters?.showService && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Service Type</label>
              <input type="text" placeholder="e.g. airport-to-home" value={service} onChange={e => setService(e.target.value)}
                className="w-44 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none" />
            </div>
          )}
          {filters?.showSource && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Source</label>
              {filters.sourceOptions ? (
                <select value={source} onChange={e => setSource(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none">
                  <option value="">All</option>
                  {filters.sourceOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type="text" value={source} onChange={e => setSource(e.target.value)}
                  className="w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none" />
              )}
            </div>
          )}
          {filters?.showStatus && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Status</label>
              {filters.statusOptions ? (
                <select value={status} onChange={e => setStatus(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none">
                  <option value="">All</option>
                  {filters.statusOptions.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              ) : (
                <input type="text" value={status} onChange={e => setStatus(e.target.value)}
                  className="w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none" />
              )}
            </div>
          )}
          {filters?.showPartner && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Partner</label>
              <input type="text" value={partner} onChange={e => setPartner(e.target.value)}
                className="w-36 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none" />
            </div>
          )}
          {filters?.showCity && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">City (From or To)</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                className="w-36 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none" />
            </div>
          )}
          <button onClick={fetchData}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">
            Apply
          </button>
          {(from || to || service || source || status || partner || city) && (
            <button onClick={() => { setFrom(''); setTo(''); setService(''); setSource(''); setStatus(''); setPartner(''); setCity('') }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50">
              Clear
            </button>
          )}
        </div>
      )}

      {data?.summary && data.summary.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data.summary.map((s, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <p className="truncate text-[11px] font-medium capitalize text-gray-500">{s.label}</p>
              <p className="mt-1 truncate text-base font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-400">Loading…</div>
        ) : !data || data.rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">No data for the selected filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {data.columns.map(c => (
                  <th key={c.key} className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold text-gray-500">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.rows.map((row, i) => {
                const linkTarget = emptyRowLinkKey && emptyRowLinkBase && row[emptyRowLinkKey]
                  ? `${emptyRowLinkBase}${row[emptyRowLinkKey]}` : null
                const cells = data.columns.map(c => {
                  const v = row[c.key]
                  const display = v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)
                  return (
                    <td key={c.key} className="whitespace-nowrap px-4 py-2.5 text-gray-700">{display}</td>
                  )
                })
                return (
                  <tr key={i}
                    onClick={linkTarget ? () => router.push(linkTarget) : undefined}
                    className={linkTarget ? 'cursor-pointer hover:bg-orange-50/40' : 'hover:bg-gray-50'}>
                    {cells}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
