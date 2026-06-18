'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Plus, Search, RefreshCw, ChevronDown,
  Phone, Trash2, Eye, Send, CheckCircle, Edit2, X, Save,
} from 'lucide-react'
import Link from 'next/link'
import { getRoleFromSession, can } from '@/lib/roles'
import type { AdminRole } from '@/lib/admin-auth'

interface Quote {
  id:             string
  quote_number:   string
  customer_name:  string
  customer_phone: string
  customer_email: string | null
  service_type:   string
  from_city:      string
  to_city:        string
  pickup_date:    string | null
  time_slot:      string | null
  total_bags:     number
  base_price:     number
  cgst:           number
  sgst:           number
  total_amount:   number
  status:         string
  valid_until:    string | null
  notes:          string | null
  version:        number
  created_at:     string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Draft',    color: '#6b7280', bg: '#f3f4f6' },
  sent:     { label: 'Sent',     color: '#2563eb', bg: '#dbeafe' },
  accepted: { label: 'Accepted', color: '#16a34a', bg: '#dcfce7' },
  rejected: { label: 'Rejected', color: '#dc2626', bg: '#fee2e2' },
  expired:  { label: 'Expired',  color: '#d97706', bg: '#fef3c7' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{ color: cfg.color, background: cfg.bg }}
      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold">
      {cfg.label}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtRs(n: number) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }) }

const inp = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
const sel = inp + ' bg-white appearance-none'

// ── Edit Modal ───────────────────────────────────────────────────
function EditQuoteModal({ quote, adminKey, onSaved, onClose }: {
  quote: Quote; adminKey: string; onSaved: () => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    customer_name:  quote.customer_name,
    customer_phone: quote.customer_phone,
    customer_email: quote.customer_email ?? '',
    service_type:   quote.service_type,
    from_city:      quote.from_city,
    to_city:        quote.to_city,
    pickup_date:    quote.pickup_date ? quote.pickup_date.split('T')[0] : '',
    time_slot:      quote.time_slot ?? '',
    total_bags:     String(quote.total_bags),
    base_price:     String(quote.base_price),
    status:         quote.status,
    valid_until:    quote.valid_until ? quote.valid_until.split('T')[0] : '',
    notes:          quote.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const base  = parseFloat(form.base_price) || 0
  const cgst  = parseFloat((base * 0.025).toFixed(2))
  const sgst  = parseFloat((base * 0.025).toFixed(2))
  const total = parseFloat((base + cgst + sgst).toFixed(2))

  async function save() {
    setSaving(true); setError('')
    const res = await fetch(`/api/admin/quotes/${quote.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ ...form, total_bags: parseInt(form.total_bags), base_price: parseFloat(form.base_price) }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Failed'); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Quote</h2>
            <p className="text-xs text-gray-400">{quote.quote_number} · v{quote.version} → v{quote.version + 1}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Customer</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Name</label>
                <input type="text" value={form.customer_name} onChange={set('customer_name')} className={inp} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Phone</label>
                <input type="text" value={form.customer_phone} onChange={set('customer_phone')} className={inp} />
              </div>
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Email</label>
                <input type="email" value={form.customer_email} onChange={set('customer_email')} className={inp} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Service</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Service Type</label>
                <select value={form.service_type} onChange={set('service_type')} className={sel}>
                  <option value="airport-to-door">Airport to Door</option>
                  <option value="door-to-airport">Door to Airport</option>
                  <option value="intercity">Intercity</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Total Bags</label>
                <input type="number" min="1" max="20" value={form.total_bags} onChange={set('total_bags')} className={inp} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">From City</label>
                <input type="text" value={form.from_city} onChange={set('from_city')} className={inp} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">To City</label>
                <input type="text" value={form.to_city} onChange={set('to_city')} className={inp} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Pickup Date</label>
                <input type="date" value={form.pickup_date} onChange={set('pickup_date')} className={inp} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Time Slot</label>
                <input type="text" value={form.time_slot} onChange={set('time_slot')} placeholder="e.g. 10:00 AM – 12:00 PM" className={inp} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">Pricing</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Base Price (₹)</label>
                <input type="number" value={form.base_price} onChange={set('base_price')} className={inp} />
              </div>
              <div className="flex flex-col justify-end">
                <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-xs space-y-1">
                  <div className="flex justify-between text-gray-500"><span>CGST 2.5%</span><span>{fmtRs(cgst)}</span></div>
                  <div className="flex justify-between text-gray-500"><span>SGST 2.5%</span><span>{fmtRs(sgst)}</span></div>
                  <div className="flex justify-between font-bold text-orange-600 border-t border-orange-200 pt-1"><span>Total</span><span>{fmtRs(total)}</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Status</label>
              <select value={form.status} onChange={set('status')} className={sel}>
                {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Valid Until</label>
              <input type="date" value={form.valid_until} onChange={set('valid_until')} className={inp} />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Notes</label>
              <textarea value={form.notes} onChange={set('notes')} rows={2} className={inp} />
            </div>
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4 sticky bottom-0 bg-white">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Preview Modal ────────────────────────────────────────────────
function QuotePreviewModal({ quote, adminKey, onClose, onEdit, onUpdated }: {
  quote: Quote; adminKey: string; onClose: () => void; onEdit: () => void; onUpdated: () => void
}) {
  const [updating, setUpdating] = useState(false)

  async function changeStatus(status: string) {
    setUpdating(true)
    await fetch(`/api/admin/quotes/${quote.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ status }),
    })
    setUpdating(false)
    onUpdated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">Quote · v{quote.version ?? 1}</p>
            <h2 className="text-xl font-black text-gray-900">{quote.quote_number}</h2>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={quote.status} />
            <button onClick={onClose}><X className="h-4 w-4 text-gray-400 hover:text-gray-600" /></button>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 mb-1">Customer</p>
            <p className="font-semibold text-gray-900">{quote.customer_name}</p>
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" /> {quote.customer_phone}</p>
            {quote.customer_email && <p className="text-xs text-gray-400 mt-0.5">{quote.customer_email}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Service', value: quote.service_type },
              { label: 'Route',   value: `${quote.from_city} → ${quote.to_city}` },
              { label: 'Bags',    value: String(quote.total_bags) },
              { label: 'Date',    value: fmtDate(quote.pickup_date) },
            ].map(f => (
              <div key={f.label} className="rounded-lg border border-gray-100 px-3 py-2">
                <p className="text-xs text-gray-400">{f.label}</p>
                <p className="text-sm font-semibold text-gray-800">{f.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Base</span><span>{fmtRs(quote.base_price)}</span></div>
            <div className="flex justify-between text-gray-500 text-xs"><span>CGST 2.5%</span><span>{fmtRs(quote.cgst)}</span></div>
            <div className="flex justify-between text-gray-500 text-xs"><span>SGST 2.5%</span><span>{fmtRs(quote.sgst)}</span></div>
            <div className="flex justify-between border-t border-orange-200 pt-2 font-bold text-gray-900"><span>Total</span><span className="text-orange-600">{fmtRs(quote.total_amount)}</span></div>
          </div>
          {quote.notes && <p className="text-sm text-gray-600">{quote.notes}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onEdit}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <Edit2 className="h-3.5 w-3.5" /> Edit
          </button>
          {quote.status === 'draft' && (
            <button onClick={() => changeStatus('sent')} disabled={updating}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> Mark Sent
            </button>
          )}
          {quote.status === 'sent' && (
            <button onClick={() => changeStatus('accepted')} disabled={updating}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50">
              <CheckCircle className="h-3.5 w-3.5" /> Mark Accepted
            </button>
          )}
          <button onClick={() => window.open(`/admin/quotes/${quote.id}/print`, '_blank')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            <Eye className="h-3.5 w-3.5" /> Print / PDF
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function QuotesPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [role,     setRole]     = useState<AdminRole>(null)
  const [authed,   setAuthed]   = useState(false)
  const [quotes,   setQuotes]   = useState<Quote[]>([])
  const [loading,  setLoading]  = useState(false)
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [preview,  setPreview]  = useState<Quote | null>(null)
  const [editing,  setEditing]  = useState<Quote | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setRole(getRoleFromSession())
    setAuthed(true)
  }, [router])

  const fetchQuotes = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = `?key=${adminKey}${filter !== 'all' ? '&status=' + filter : ''}${search ? '&search=' + encodeURIComponent(search) : ''}`
    const res = await fetch('/api/admin/quotes' + qs)
    if (res.ok) setQuotes((await res.json()).quotes ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  useEffect(() => { if (authed) fetchQuotes() }, [authed, fetchQuotes])

  async function deleteQuote(id: string, quoteNumber: string) {
    if (!confirm(`Delete quote ${quoteNumber}? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/quotes/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
    if (res.status === 403) { alert('Admin access required to delete quotes'); return }
    fetchQuotes()
  }

  if (!authed) return null

  return (
    <>
      {editing && (
        <EditQuoteModal
          quote={editing}
          adminKey={adminKey}
          onSaved={() => { setEditing(null); fetchQuotes() }}
          onClose={() => setEditing(null)}
        />
      )}
      {preview && !editing && (
        <QuotePreviewModal
          quote={preview}
          adminKey={adminKey}
          onClose={() => setPreview(null)}
          onEdit={() => { setEditing(preview); setPreview(null) }}
          onUpdated={fetchQuotes}
        />
      )}

      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Quotes</h1>
            <p className="mt-0.5 text-sm text-gray-400">{quotes.length} total quotes</p>
          </div>
          <Link href="/admin/quotes/new"
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
            <Plus className="h-4 w-4" /> New Quote
          </Link>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by name, phone, or quote number…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none">
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchQuotes} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading quotes…</div>
          ) : quotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-400">No quotes yet.</p>
              <Link href="/admin/quotes/new" className="mt-3 text-sm font-semibold text-orange-500 hover:underline">Create your first quote →</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Quote #', 'Ver.', 'Customer', 'Route', 'Bags', 'Amount', 'Status', 'Valid Until', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {quotes.map(q => (
                    <tr key={q.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-orange-600">{q.quote_number}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">v{q.version ?? 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{q.customer_name}</p>
                        <p className="text-xs text-gray-400">{q.customer_phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{q.from_city} → {q.to_city}</td>
                      <td className="px-4 py-3 text-center font-medium text-gray-700">{q.total_bags}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{fmtRs(q.total_amount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(q.valid_until)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setPreview(q)} title="Preview"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditing(q)} title="Edit"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-orange-50 hover:text-orange-500 transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          {can('DELETE_QUOTE', role) && (
                            <button onClick={() => deleteQuote(q.id, q.quote_number)} title="Delete"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
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
