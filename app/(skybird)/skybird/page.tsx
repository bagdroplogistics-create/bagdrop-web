'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, RefreshCw, Search, Plane, Package, X, CheckCircle2,
} from 'lucide-react'
import { PhoneInput } from '@/components/ui/phone-input'
import { DEFAULT_COUNTRY_ISO2 } from '@/lib/phone-countries'
import { toE164 } from '@/lib/phone-format'

// ── Config — mirrors app/(admin)/admin/leads/page.tsx (kept in sync manually,
// this dashboard is a separate scoped surface, not a shared component) ──────
const SERVICE_TYPES = [
  { value: 'airport-to-doorstep', label: 'Airport → Doorstep', needsFlight: true },
  { value: 'doorstep-to-airport', label: 'Doorstep → Airport', needsFlight: true },
  { value: 'doorstep-to-doorstep', label: 'Doorstep → Doorstep', needsFlight: false },
  { value: 'airport-to-airport',   label: 'Airport → Airport',   needsFlight: false },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#0369a1', bg: '#e0f2fe' },
  contacted: { label: 'Contacted', color: '#d97706', bg: '#fef3c7' },
  qualified: { label: 'Qualified', color: '#7c3aed', bg: '#ede9fe' },
  converted: { label: 'Converted', color: '#16a34a', bg: '#dcfce7' },
  lost:      { label: 'Lost',      color: '#dc2626', bg: '#fee2e2' },
}

interface SkybirdLead {
  id: string
  lead_number: string | null
  name: string
  phone: string
  email: string | null
  service_interest: string | null
  from_city: string | null
  to_city: string | null
  pickup_date: string | null
  delivery_date: string | null
  bags_count: number
  flight_number: string | null
  status: string
  notes: string | null
  created_at: string
  booking_id: string | null
  bookings?: { tracking_id: string; status: string; total_amount: number | null; payment_status: string | null } | null
}

const EMPTY_FORM = {
  name: '', phone: '', countryIso2: DEFAULT_COUNTRY_ISO2, email: '',
  service_interest: '', from_city: '', to_city: '',
  pickup_date: '', delivery_date: '', bags_count: '1',
  flight_number: '', notes: '',
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

const sel = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 bg-white'
const inp = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400'

export default function SkybirdDashboardPage() {
  const router = useRouter()
  const [skybirdKey, setSkybirdKey] = useState('')
  const [authed, setAuthed] = useState(false)

  const [leads, setLeads]     = useState<SkybirdLead[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)

  const [form, setForm]   = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState<{ lead_number: string } | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_skybird_key') ?? ''
    if (!key) { router.replace('/skybird/login'); return }
    setSkybirdKey(key)
    setAuthed(true)
  }, [router])

  const fetchLeads = useCallback(async () => {
    if (!skybirdKey) return
    setLoading(true)
    const params = new URLSearchParams({ key: skybirdKey })
    if (search) params.set('search', search)
    const res = await fetch(`/api/skybird/leads?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setLeads(data.leads ?? [])
    }
    setLoading(false)
  }, [skybirdKey, search])

  useEffect(() => { if (authed) fetchLeads() }, [authed, fetchLeads])

  const needsFlight = SERVICE_TYPES.find(s => s.value === form.service_interest)?.needsFlight ?? false

  function set<K extends keyof typeof EMPTY_FORM>(field: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.phone.trim()) {
      setFormError('Name and phone number are required.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/skybird/leads?key=${encodeURIComponent(skybirdKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: toE164(form.phone, form.countryIso2),
          phone_country_code: form.countryIso2,
          phone_national: form.phone.replace(/\D/g, ''),
          email: form.email.trim() || null,
          service_interest: form.service_interest || null,
          from_city: form.from_city.trim() || null,
          to_city: form.to_city.trim() || null,
          pickup_date: form.pickup_date || null,
          delivery_date: form.delivery_date || null,
          bags_count: form.bags_count,
          flight_number: needsFlight ? form.flight_number.trim() || null : null,
          notes: form.notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? 'Something went wrong. Please try again.')
        setSaving(false)
        return
      }
      setSuccess({ lead_number: data.lead_number })
      setForm(EMPTY_FORM)
      setShowForm(false)
      fetchLeads()
    } catch {
      setFormError('Network error. Please try again.')
    }
    setSaving(false)
  }

  if (!authed) return null

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {success && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            Inquiry <strong>{success.lead_number}</strong> submitted to Bagdrop successfully.
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900">Your Inquiries</h1>
          <p className="text-sm text-gray-500">Customer booking inquiries submitted through Skybird</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Inquiry
        </button>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
        </div>
        <button onClick={() => fetchLeads()} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Inquiry #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Bags</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Booking</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map(l => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{l.lead_number ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{l.name}</div>
                  <div className="text-xs text-gray-500">{l.phone}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {l.from_city || l.to_city ? `${l.from_city ?? '—'} → ${l.to_city ?? '—'}` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-700">{l.bags_count}</td>
                <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                <td className="px-4 py-3 text-gray-700">
                  {l.bookings ? (
                    <div>
                      <div className="font-mono text-xs">{l.bookings.tracking_id}</div>
                      <div className="text-xs text-gray-500 capitalize">{l.bookings.status?.replace(/-/g, ' ')}</div>
                    </div>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
              </tr>
            ))}
            {!loading && leads.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No inquiries yet. Click "New Inquiry" to submit your first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">New Customer Inquiry</h2>
              <button onClick={() => { setShowForm(false); setFormError('') }} className="text-gray-400 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Customer Name<span className="ml-0.5 text-sky-500">*</span></label>
                <input value={form.name} onChange={set('name')} required placeholder="Full name" className={inp} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Email</label>
                <input type="email" value={form.email} onChange={set('email')} placeholder="customer@email.com" className={inp} />
              </div>

              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                  Phone Number<span className="ml-0.5 text-sky-500">*</span>
                </label>
                <PhoneInput
                  required
                  variant="admin"
                  countryIso2={form.countryIso2}
                  nationalNumber={form.phone}
                  onCountryChange={iso2 => setForm(f => ({ ...f, countryIso2: iso2 }))}
                  onNumberChange={num => setForm(f => ({ ...f, phone: num }))}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Service Type</label>
                <select value={form.service_interest} onChange={set('service_interest')} className={sel}>
                  <option value="">— Select service type —</option>
                  {SERVICE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Number of Bags</label>
                <input type="number" min={1} value={form.bags_count} onChange={set('bags_count')} className={inp} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600 flex items-center gap-1"><Plane className="h-3 w-3" /> From City</label>
                <input value={form.from_city} onChange={set('from_city')} placeholder="e.g. Mumbai" className={inp} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600 flex items-center gap-1"><Package className="h-3 w-3" /> To City</label>
                <input value={form.to_city} onChange={set('to_city')} placeholder="e.g. Ahmedabad" className={inp} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Pickup Date</label>
                <input type="date" value={form.pickup_date} onChange={set('pickup_date')} className={inp} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Delivery Date</label>
                <input type="date" value={form.delivery_date} onChange={set('delivery_date')} className={inp} />
              </div>

              {needsFlight && (
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">Flight Number</label>
                  <input value={form.flight_number} onChange={set('flight_number')} placeholder="e.g. AI-101" className={inp} />
                </div>
              )}

              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Notes</label>
                <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Any special instructions"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400" />
              </div>

              {formError && (
                <p className="col-span-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{formError}</p>
              )}

              <div className="col-span-2 flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button type="button" onClick={() => { setShowForm(false); setFormError('') }}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                  {saving ? 'Submitting…' : 'Submit Inquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
