'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Receipt, Search, RefreshCw, ChevronDown, Eye,
  Download, Mail, MessageCircle, CheckCircle, Clock, FileText, Loader2,
} from 'lucide-react'
import { formatCustomerName } from '@/lib/constants'

interface Invoice {
  id:                string
  invoice_number:    string | null
  booking_id:        string | null
  title?:            string | null
  customer_name:     string
  customer_phone:    string
  customer_email:    string | null
  from_city:         string
  to_city:           string
  total_bags:        number
  base_amount:       number
  cgst:              number
  sgst:              number
  total_amount:      number
  payment_status:    string
  payment_method:    string | null
  payment_reference: string | null
  sent_email:        boolean
  sent_whatsapp:     boolean
  invoice_date:      string
  created_at:        string
  // false = a completed inquiry with no real invoice row yet (see the
  // merged bookings+invoices logic in GET /api/admin/invoices) — shown
  // with a "Generate Invoice" action instead of Download/Email/WhatsApp.
  generated:          boolean
}

const PAY_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  paid:    { label: 'Paid',    color: '#16a34a', bg: '#dcfce7' },
  pending: { label: 'Pending', color: '#d97706', bg: '#fef3c7' },
  failed:  { label: 'Failed',  color: '#dc2626', bg: '#fee2e2' },
}

function Badge({ status }: { status: string }) {
  const c = PAY_STATUS[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{ color: c.color, background: c.bg }}
      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold">
      {c.label}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtRs(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function InvoicesPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading,  setLoading]  = useState(false)
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [sending,  setSending]  = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchInvoices = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = `?key=${adminKey}${filter !== 'all' ? '&status=' + filter : ''}${search ? '&search=' + encodeURIComponent(search) : ''}`
    const res = await fetch('/api/admin/invoices' + qs)
    if (res.ok) setInvoices((await res.json()).invoices ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  useEffect(() => { if (authed) fetchInvoices() }, [authed, fetchInvoices])

  function printInvoice(id: string) {
    window.open(`/admin/invoices/${id}/print`, '_blank')
  }

  async function markSent(id: string, type: 'email' | 'whatsapp') {
    setSending(id + type)
    await fetch(`/api/admin/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(type === 'email' ? { sent_email: true } : { sent_whatsapp: true }),
    })
    setSending(null)
    fetchInvoices()
  }

  // Assigns the next number from the local BLS26 series and creates the
  // real invoice row for a completed booking that doesn't have one yet —
  // same POST used by the per-booking "Generate Invoice" step in the
  // booking workflow, just triggered from this list so the backlog can be
  // worked through in order (the list is sorted oldest → newest for
  // exactly this reason).
  async function generateInvoice(bookingId: string) {
    setGenerating(bookingId)
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ booking_id: bookingId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { alert(d.error ?? 'Failed to generate invoice'); return }
    } catch {
      alert('Network error — please try again')
    } finally {
      setGenerating(null)
      fetchInvoices()
    }
  }

  const totalRevenue = invoices.filter(i => i.payment_status === 'paid').reduce((s, i) => s + Number(i.total_amount), 0)
  const notGeneratedCount = invoices.filter(i => !i.generated).length

  if (!authed) return null

  return (
    <>
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Invoices</h1>
            <p className="mt-0.5 text-sm text-gray-400">{invoices.length} completed inquiries · {fmtRs(totalRevenue)} collected</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Summary cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Completed Inquiries', value: invoices.length,                                                 color: '#2563eb', bg: '#dbeafe' },
            { label: 'Not Generated',  value: notGeneratedCount,                                                     color: '#dc2626', bg: '#fee2e2' },
            { label: 'Paid',           value: invoices.filter(i => i.payment_status === 'paid').length,             color: '#16a34a', bg: '#dcfce7' },
            { label: 'Revenue',        value: fmtRs(totalRevenue),                                                  color: '#FF6300', bg: '#fff7f0' },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">{c.label}</p>
              <p className="mt-1.5 text-xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, or invoice number…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none">
              <option value="all">All</option>
              <option value="not_generated">Not Generated</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchInvoices} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Receipt className="mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-400">No completed inquiries yet — this list fills up once a booking's workflow reaches Completed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Invoice #', 'Customer', 'Route', 'Amount', 'GST', 'Total', 'Status', 'Date', 'Sent', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoices.map(inv => (
                    <tr key={inv.id} className={inv.generated ? 'hover:bg-orange-50/30 transition-colors' : 'bg-amber-50/40 hover:bg-amber-50/70 transition-colors'}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-orange-600">
                        {inv.generated ? inv.invoice_number : <span className="text-amber-600">Not generated</span>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{formatCustomerName(inv.title, inv.customer_name) || inv.customer_name}</p>
                        <p className="text-xs text-gray-400">{inv.customer_phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{inv.from_city} → {inv.to_city}</td>
                      <td className="px-4 py-3 text-gray-700">{fmtRs(inv.base_amount)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtRs(inv.cgst + inv.sgst)}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{fmtRs(inv.total_amount)}</td>
                      <td className="px-4 py-3"><Badge status={inv.payment_status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3">
                        {inv.generated ? (
                          <div className="flex gap-1">
                            <div title={inv.sent_email ? "Email sent" : "Email not sent"}>
                              {inv.sent_email ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-gray-300" />
                                )}
                              </div>
                           <div title={inv.sent_whatsapp ? "WhatsApp sent" : "WhatsApp not sent"}>
                                {inv.sent_whatsapp ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-gray-300" />
                                )}
                           </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inv.generated ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => printInvoice(inv.id)} title="Download PDF"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors">
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => markSent(inv.id, 'email')} disabled={sending === inv.id + 'email' || inv.sent_email}
                              title="Mark email sent"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-500 transition-colors disabled:opacity-40">
                              <Mail className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => markSent(inv.id, 'whatsapp')} disabled={sending === inv.id + 'whatsapp' || inv.sent_whatsapp}
                              title="Mark WhatsApp sent"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-500 transition-colors disabled:opacity-40">
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => inv.booking_id && generateInvoice(inv.booking_id)}
                            disabled={generating === inv.booking_id || !inv.booking_id}
                            title="Assigns the next number in the BLS26 series and creates the invoice"
                            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                          >
                            {generating === inv.booking_id
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                              : <><FileText className="h-3.5 w-3.5" /> Generate Invoice</>}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
