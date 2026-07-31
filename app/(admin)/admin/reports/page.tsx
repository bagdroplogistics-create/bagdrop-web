'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart2, TrendingUp, RefreshCw, Calendar, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import DetailedReportView from '@/components/admin/DetailedReportView'
import { downloadCSV, downloadExcel, downloadPDF, printReport } from '@/lib/report-export'

// Report tabs — Revenue (below) is the original, unchanged report. The other
// 9 are additive "detailed report" tabs backed by the generic
// app/api/admin/reports/detailed/route.ts endpoint, each with cross-cutting
// filters and CSV/Excel/PDF/Print export (Phase 2/3 of the Reports &
// Dashboard Enhancements request — Phase 1 was the Operations Center at
// /admin/reports/operations).
const REPORT_TABS = [
  { key: 'revenue',           label: 'Revenue' },
  { key: 'inquiry_source',    label: 'Inquiry Source' },
  { key: 'booking_status',    label: 'Booking Status' },
  { key: 'route_performance', label: 'Route Performance' },
  { key: 'partner',           label: 'Partner' },
  { key: 'customer',          label: 'Customer' },
  { key: 'payment',           label: 'Payment' },
  { key: 'driver_ops',        label: 'Driver & Operations' },
  { key: 'document',          label: 'Document' },
  { key: 'cancellation',      label: 'Cancellation' },
] as const

type ReportTabKey = typeof REPORT_TABS[number]['key']

const BOOKING_STATUS_OPTIONS = [
  'inquiry', 'quote_created', 'quote_sent', 'accepted', 'payment_pending', 'payment_received',
  'payment_approved', 'confirmed', 'indemnity_bond_sent', 'indemnity_bond_signed',
  'invoice_generated', 'invoice_sent', 'pickup_scheduled', 'picked_up', 'in_transit',
  'out_for_delivery', 'driver_details_shared', 'delivered', 'trip_created', 'completed',
  'cancelled', 'rejected',
]
const PAYMENT_STATUS_OPTIONS = ['pending', 'paid', 'refunded']
const DOCUMENT_STATUS_OPTIONS = ['pending', 'approved', 'rejected', 'resubmission_requested']
const LEAD_SOURCE_OPTIONS = ['manual', 'website', 'mobile-app', 'contact-form', 'referral', 'b2b', 'walk-in', 'skybird']

interface Summary {
  totalBookings:   number
  totalRevenue:    number
  pendingPayments: number
  deliveredCount:  number
  cancelledCount:  number
  avgOrderValue:   number
}
interface TrendPoint   { date: string; bookings: number; revenue: number }
interface RouteRevenue { route: string; bookings: number; revenue: number }

const PERIOD_OPTS = [
  { value: 'daily',   label: 'Today' },
  { value: 'weekly',  label: 'Last 7 days' },
  { value: 'monthly', label: 'This Month' },
  { value: 'custom',  label: 'Custom' },
]

function fmtRs(n: number) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }) }
function fmtShort(d: string) { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }

// Simple bar drawn with divs — no chart lib needed
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: pct + '%', background: color }} />
    </div>
  )
}

// Trend chart — pure SVG
function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <div className="flex h-40 items-center justify-center text-xs text-gray-400">No trend data</div>

  const W = 700, H = 160, PAD = { t: 12, r: 12, b: 28, l: 52 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const maxRev = Math.max(...data.map(d => d.revenue), 1)
  const maxBks = Math.max(...data.map(d => d.bookings), 1)

  const xScale = (i: number) => PAD.l + (i / (data.length - 1 || 1)) * innerW
  const yRevScale = (v: number) => PAD.t + innerH - (v / maxRev) * innerH
  const yBksScale = (v: number) => PAD.t + innerH - (v / maxBks) * innerH

  const revPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yRevScale(d.revenue)}`).join(' ')
  const bksPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yBksScale(d.bookings)}`).join(' ')

  // Show max 8 x-axis labels
  const step = Math.max(1, Math.floor(data.length / 8))
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '160px' }}>
      {/* Y-axis grid */}
      {[0.25, 0.5, 0.75, 1].map(t => {
        const y = PAD.t + innerH - t * innerH
        return (
          <g key={t}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PAD.l - 6} y={y + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">
              {fmtRs(maxRev * t)}
            </text>
          </g>
        )
      })}
      {/* X axis labels */}
      {xLabels.map((d, i) => {
        const origIdx = data.indexOf(d)
        return (
          <text key={i} x={xScale(origIdx)} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">
            {fmtShort(d.date)}
          </text>
        )
      })}
      {/* Revenue area fill */}
      <path d={revPath + ` L${xScale(data.length - 1)},${PAD.t + innerH} L${xScale(0)},${PAD.t + innerH} Z`}
        fill="#FF630020" />
      {/* Revenue line */}
      <path d={revPath} fill="none" stroke="#FF6300" strokeWidth="2" strokeLinejoin="round" />
      {/* Bookings line */}
      <path d={bksPath} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />
      {/* Legend */}
      <rect x={W - PAD.r - 110} y={PAD.t} width="10" height="3" fill="#FF6300" rx="1" />
      <text x={W - PAD.r - 96} y={PAD.t + 3.5} fontSize="9" fill="#6b7280">Revenue</text>
      <rect x={W - PAD.r - 60} y={PAD.t} width="10" height="3" fill="#3b82f6" rx="1" />
      <text x={W - PAD.r - 46} y={PAD.t + 3.5} fontSize="9" fill="#6b7280">Bookings</text>
    </svg>
  )
}

export default function ReportsPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [activeTab, setActiveTab] = useState<ReportTabKey>('revenue')

  const [period,    setPeriod]    = useState('monthly')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const [summary,        setSummary]        = useState<Summary | null>(null)
  const [trend,          setTrend]          = useState<TrendPoint[]>([])
  const [routeRevenue,   setRouteRevenue]   = useState<RouteRevenue[]>([])
  const [statusBreakdown, setStatusBreakdown] = useState<Record<string, number>>({})

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchReports = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    let qs = `?key=${adminKey}&period=${period}`
    if (period === 'custom' && customFrom && customTo) qs += `&from=${customFrom}&to=${customTo}`
    const res = await fetch('/api/admin/reports' + qs)
    if (res.ok) {
      const d = await res.json()
      setSummary(d.summary)
      setTrend(d.trend ?? [])
      setRouteRevenue(d.routeRevenue ?? [])
      setStatusBreakdown(d.statusBreakdown ?? {})
    }
    setLoading(false)
  }, [adminKey, period, customFrom, customTo])

  useEffect(() => { if (authed) fetchReports() }, [authed, fetchReports])

  const maxRouteRev = Math.max(...routeRevenue.map(r => r.revenue), 1)

  const REVENUE_EXPORT_COLUMNS = [
    { key: 'route', label: 'Route' }, { key: 'bookings', label: 'Bookings' }, { key: 'revenue', label: 'Revenue' },
  ]
  const routeRevenueRows = routeRevenue.map(r => ({ route: r.route, bookings: r.bookings, revenue: fmtRs(r.revenue) }))
  const summaryForExport = summary ? [
    { label: 'Bookings', value: String(summary.totalBookings) },
    { label: 'Revenue', value: fmtRs(summary.totalRevenue) },
    { label: 'Delivered', value: String(summary.deliveredCount) },
    { label: 'Cancelled', value: String(summary.cancelledCount) },
    { label: 'Pending Payments', value: fmtRs(summary.pendingPayments) },
    { label: 'Avg Order', value: fmtRs(summary.avgOrderValue) },
  ] : undefined

  const STATUS_COLORS: Record<string, string> = {
    pending:          '#d97706',
    confirmed:        '#2563eb',
    pickup_scheduled: '#7c3aed',
    picked_up:        '#0891b2',
    in_transit:       '#ea580c',
    out_for_delivery: '#ca8a04',
    delivered:        '#16a34a',
    completed:        '#15803d',
    cancelled:        '#dc2626',
  }

  if (!authed) return null

  return (
    <>
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="mt-0.5 text-sm text-gray-400">Revenue trends, route performance, booking status, and more</p>
          </div>
          {activeTab === 'revenue' && (
            <div className="flex flex-wrap items-center gap-2">
              {PERIOD_OPTS.map(o => (
                <button key={o.value} onClick={() => setPeriod(o.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${period === o.value ? 'bg-orange-500 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {o.label}
                </button>
              ))}
              <button onClick={fetchReports}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
          )}
        </div>
        {activeTab === 'revenue' && period === 'custom' && (
          <div className="mt-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-orange-400 focus:outline-none" />
            <span className="text-gray-400">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-orange-400 focus:outline-none" />
            <button onClick={fetchReports} className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-600">Apply</button>
          </div>
        )}

        {/* Report type tabs */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-50 pt-3">
          {REPORT_TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === t.key ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab !== 'revenue' && (
        <div className="px-6 py-6">
          {activeTab === 'inquiry_source' && (
            <DetailedReportView adminKey={adminKey} type="inquiry_source" title="Inquiry Source Report"
              subtitle="Leads by channel — website, referral, partner, and more"
              filters={{ showService: true, showSource: true, showPartner: true, sourceOptions: LEAD_SOURCE_OPTIONS }} />
          )}
          {activeTab === 'booking_status' && (
            <DetailedReportView adminKey={adminKey} type="booking_status" title="Booking Status Report"
              subtitle="Click a row to open that booking"
              filters={{ showService: true, showStatus: true, showPartner: true, showCity: true, statusOptions: BOOKING_STATUS_OPTIONS }}
              emptyRowLinkKey="lead_id" emptyRowLinkBase="/admin/quotes/view/" />
          )}
          {activeTab === 'route_performance' && (
            <DetailedReportView adminKey={adminKey} type="route_performance" title="Route Performance Report"
              subtitle="Bookings, revenue, and cancellation rate by route"
              filters={{ showService: true, showPartner: true }} />
          )}
          {activeTab === 'partner' && (
            <DetailedReportView adminKey={adminKey} type="partner" title="Partner Report"
              subtitle="Leads, conversion, and revenue by referring partner"
              filters={{ showService: true, showSource: true, sourceOptions: LEAD_SOURCE_OPTIONS }} />
          )}
          {activeTab === 'customer' && (
            <DetailedReportView adminKey={adminKey} type="customer" title="Customer Report"
              subtitle="Repeat vs. new customers, lifetime spend"
              filters={{ showCity: true, showService: true }} />
          )}
          {activeTab === 'payment' && (
            <DetailedReportView adminKey={adminKey} type="payment" title="Payment Report"
              subtitle="Collections — paid, pending, refunded"
              filters={{ showStatus: true, statusOptions: PAYMENT_STATUS_OPTIONS }} />
          )}
          {activeTab === 'driver_ops' && (
            <DetailedReportView adminKey={adminKey} type="driver_ops" title="Driver & Operations Report"
              subtitle="Filtered by pickup date — driver assignment and vehicle details"
              filters={{ showService: true, showStatus: true, showCity: true, statusOptions: BOOKING_STATUS_OPTIONS }} />
          )}
          {activeTab === 'document' && (
            <DetailedReportView adminKey={adminKey} type="document" title="Document Report"
              subtitle="Indemnity bond / ID document collection status"
              filters={{ showStatus: true, statusOptions: DOCUMENT_STATUS_OPTIONS }} />
          )}
          {activeTab === 'cancellation' && (
            <DetailedReportView adminKey={adminKey} type="cancellation" title="Cancellation Report"
              subtitle="Cancelled bookings — reason, timing, revenue impact"
              filters={{ showService: true, showPartner: true, showCity: true }} />
          )}
        </div>
      )}

      {activeTab === 'revenue' && (
      <div className="px-6 py-6">
        {loading && <div className="mb-4 text-center text-xs text-gray-400">Loading reports…</div>}

        {/* Summary */}
        {summary && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Bookings',    value: summary.totalBookings,                                color: '#2563eb' },
              { label: 'Revenue',     value: fmtRs(summary.totalRevenue),                         color: '#FF6300' },
              { label: 'Delivered',   value: summary.deliveredCount,                              color: '#16a34a' },
              { label: 'Cancelled',   value: summary.cancelledCount,                              color: '#dc2626' },
              { label: 'Pending Pymt',value: fmtRs(summary.pendingPayments),                      color: '#d97706' },
              { label: 'Avg Order',   value: fmtRs(summary.avgOrderValue),                        color: '#7c3aed' },
            ].map(c => (
              <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
                <p className="mt-1.5 text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Trend chart */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                <h2 className="text-sm font-bold text-gray-900">30-Day Booking Trend</h2>
              </div>
              <TrendChart data={trend} />
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-bold text-gray-900">Status Breakdown</h2>
            </div>
            {Object.keys(statusBreakdown).length === 0 ? (
              <p className="text-xs text-gray-400">No data for this period</p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(statusBreakdown)
                  .sort(([,a],[,b]) => b - a)
                  .map(([status, count]) => (
                  <div key={status}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="capitalize text-gray-600">{status.replace(/_/g, ' ')}</span>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </div>
                    <MiniBar value={count} max={Math.max(...Object.values(statusBreakdown))} color={STATUS_COLORS[status] ?? '#9ca3af'} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Route Revenue */}
        <div className="mt-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">Top Routes by Revenue</h2>
            {routeRevenue.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => downloadCSV(REVENUE_EXPORT_COLUMNS, routeRevenueRows, 'revenue_report')}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
                  <Download className="h-3 w-3" /> CSV
                </button>
                <button onClick={() => downloadExcel(REVENUE_EXPORT_COLUMNS, routeRevenueRows, 'revenue_report', 'Revenue')}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
                  <FileSpreadsheet className="h-3 w-3" /> Excel
                </button>
                <button onClick={() => downloadPDF(REVENUE_EXPORT_COLUMNS, routeRevenueRows, 'revenue_report', 'Revenue Report — Top Routes', summaryForExport)}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
                  <FileText className="h-3 w-3" /> PDF
                </button>
                <button onClick={() => printReport(REVENUE_EXPORT_COLUMNS, routeRevenueRows, 'Revenue Report — Top Routes', summaryForExport)}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
                  <Printer className="h-3 w-3" /> Print
                </button>
              </div>
            )}
          </div>
          {routeRevenue.length === 0 ? (
            <p className="text-xs text-gray-400">No route data for this period</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Route', 'Bookings', 'Revenue', 'Share'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {routeRevenue.map(r => (
                    <tr key={r.route} className="hover:bg-orange-50/30">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.route}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.bookings}</td>
                      <td className="px-4 py-2.5 font-bold text-gray-900">{fmtRs(r.revenue)}</td>
                      <td className="px-4 py-2.5 min-w-[120px]">
                        <MiniBar value={r.revenue} max={maxRouteRev} color="#FF6300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}
    </>
  )
}
