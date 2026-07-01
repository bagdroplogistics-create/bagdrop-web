'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, Search, RefreshCw, ChevronDown,
  Phone, Pencil, Trash2, X, Save, Upload, Plane,
  Package, Calendar, Clock, CheckCircle, ExternalLink, MapPin,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────
interface Lead {
  id:                string
  name:              string
  phone:             string
  email:             string | null
  source:            string
  service_interest:  string | null
  service_type:      string | null
  from_city:         string | null
  to_city:           string | null
  travel_date:       string | null
  pickup_date:       string | null
  delivery_date:     string | null
  pickup_time:       string | null
  bags_count:        number
  pnr:               string | null
  flight_number:     string | null
  flight_time:       string | null
  flight_ticket_url: string | null
  pickup_address:    string | null
  drop_address:      string | null
  booking_id:        string | null
  lead_number:       string | null
  status:            string
  notes:             string | null
  assigned_to:       string | null
  created_at:        string
}

// ── Config ───────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#2563eb', bg: '#dbeafe' },
  contacted: { label: 'Contacted', color: '#d97706', bg: '#fef3c7' },
  qualified: { label: 'Qualified', color: '#7c3aed', bg: '#ede9fe' },
  converted: { label: 'Converted', color: '#16a34a', bg: '#dcfce7' },
  lost:      { label: 'Lost',      color: '#dc2626', bg: '#fee2e2' },
}

const SOURCE_LABELS: Record<string, string> = {
  manual:    'Manual',
  website:   'Website',
  referral:  'Referral',
  b2b:       'B2B',
  'walk-in': 'Walk-in',
}

const SERVICE_TYPES = [
  { value: 'airport-to-doorstep', label: 'Airport → Doorstep', needsFlight: true },
  { value: 'doorstep-to-airport', label: 'Doorstep → Airport', needsFlight: true },
  { value: 'doorstep-to-doorstep', label: 'Doorstep → Doorstep', needsFlight: false },
  { value: 'airport-to-airport',   label: 'Airport → Airport',   needsFlight: false },
]

const PICKUP_TIME_SLOTS = [
  '06:00 – 08:00',
  '08:00 – 10:00',
  '10:00 – 12:00',
  '12:00 – 14:00',
  '14:00 – 16:00',
  '16:00 – 18:00',
  '18:00 – 20:00',
  '20:00 – 22:00',
  '22:00 – 24:00',
]

function needsFlightInfo(serviceType: string) {
  return SERVICE_TYPES.find(s => s.value === serviceType)?.needsFlight ?? false
}

// ── Helpers ──────────────────────────────────────────────────────
const sel = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white'

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
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

function Field({ label, value, onChange, placeholder, type = 'text', required }: {
  label: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-gray-600">
        {label}{required && <span className="ml-0.5 text-orange-500">*</span>}
      </label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} required={required}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
    </div>
  )
}

// ── Section Divider ──────────────────────────────────────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="col-span-2 space-y-3">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-2 pt-1">
        <span className="text-orange-500">{icon}</span>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  )
}

// ── Lead Form Interface ──────────────────────────────────────────
interface LeadForm {
  name: string; phone: string; email: string; source: string
  service_interest: string; from_city: string; to_city: string
  // Address fields
  pickup_address: string; drop_address: string
  // New date/time fields
  travel_date: string; pickup_date: string; delivery_date: string; pickup_time: string
  bags_count: string
  // Flight fields (conditional)
  pnr: string; flight_number: string; flight_time: string; flight_ticket_url: string
  // Status / notes
  status: string; notes: string
}

const EMPTY_FORM: LeadForm = {
  name: '', phone: '', email: '', source: 'manual',
  service_interest: '', from_city: '', to_city: '',
  pickup_address: '', drop_address: '',
  travel_date: '', pickup_date: '', delivery_date: '', pickup_time: '',
  bags_count: '1',
  pnr: '', flight_number: '', flight_time: '', flight_ticket_url: '',
  status: 'new', notes: '',
}

// ── Lead Modal ───────────────────────────────────────────────────
function LeadModal({
  lead, adminKey, onSaved, onClose,
}: {
  lead?: Lead | null; adminKey: string; onSaved: () => void; onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<LeadForm>(
    lead
      ? {
          name:              lead.name,
          phone:             lead.phone,
          email:             lead.email ?? '',
          source:            lead.source,
          service_interest:  lead.service_interest ?? lead.service_type ?? '',
          from_city:         lead.from_city ?? '',
          to_city:           lead.to_city ?? '',
          pickup_address:    lead.pickup_address ?? '',
          drop_address:      lead.drop_address ?? '',
          travel_date:       lead.travel_date?.slice(0, 10) ?? '',
          pickup_date:       lead.pickup_date?.slice(0, 10) ?? '',
          delivery_date:     lead.delivery_date?.slice(0, 10) ?? '',
          pickup_time:       lead.pickup_time ?? '',
          bags_count:        String(lead.bags_count),
          pnr:               lead.pnr ?? '',
          flight_number:     lead.flight_number ?? '',
          flight_time:       lead.flight_time?.slice(0, 16) ?? '',
          flight_ticket_url: lead.flight_ticket_url ?? '',
          status:            lead.status,
          notes:             lead.notes ?? '',
        }
      : { ...EMPTY_FORM }
  )
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')
  const [saved, setSaved]     = useState<{ lead_number: string; tracking_id: string | null } | null>(null)
  const [pnrMode, setPnrMode] = useState<'text' | 'file'>('text')
  const [fileName, setFileName] = useState('')

  const set = (k: keyof LeadForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const requiresFlight = needsFlightInfo(form.service_interest)

  // Validation
  function validate() {
    if (!form.name.trim())                       return 'Customer name is required'
    if (!form.phone.trim())                      return 'Phone number is required'
    if (requiresFlight && !form.travel_date)     return 'Travel date is required'
    if (!form.pickup_date)                       return 'Pickup date is required'
    if (!form.delivery_date)       return 'Delivery date is required'
    if (!form.pickup_time)         return 'Pickup time slot is required'
    if (!Number(form.bags_count) || Number(form.bags_count) < 1) return 'Number of bags must be at least 1'
    if (requiresFlight && !form.pnr.trim() && !form.flight_ticket_url.trim())
      return 'PNR / flight ticket is required for this service type'
    if (requiresFlight && !form.flight_time) return 'Flight time is required'
    return null
  }

  async function save() {
    const validationErr = validate()
    if (validationErr) { setErr(validationErr); return }
    setSaving(true); setErr('')

    const url    = lead ? `/api/admin/leads/${lead.id}` : '/api/admin/leads'
    const method = lead ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        ...form,
        service_type:   form.service_interest,
        bags_count:     Number(form.bags_count) || 1,
        pickup_address: form.pickup_address.trim() || null,
        drop_address:   form.drop_address.trim() || null,
        // Clear flight fields if service type doesn't need them
        pnr:               requiresFlight ? (form.pnr.trim() || null) : null,
        flight_number:     requiresFlight ? (form.flight_number.trim() || null) : null,
        flight_time:       requiresFlight ? (form.flight_time || null) : null,
        flight_ticket_url: requiresFlight ? (form.flight_ticket_url.trim() || null) : null,
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(j.error ?? 'Save failed')
      setSaving(false)
      return
    }
    // For new leads: show confirmation with lead number
    if (!lead && j.lead_number) {
      setSaved({ lead_number: j.lead_number, tracking_id: null })
      setSaving(false)
      setTimeout(() => onSaved(), 3000)
      return
    }
    onSaved()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    // Store filename as reference — actual file upload would need a separate upload endpoint
    setForm(f => ({ ...f, flight_ticket_url: file.name }))
  }

  // ── Success screen (after new lead created) ──────────────────────
  if (saved) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Quote Created!</h2>
          <p className="text-sm text-gray-500 mb-5">Quote saved and added to the booking pipeline. Set pricing and send it to the customer.</p>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 mb-5 space-y-3 text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Quote Number</span>
              <span className="font-mono font-bold text-blue-600">{saved.lead_number}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Status</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">New Quote</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Next Step</span>
              <span className="text-xs font-semibold text-orange-600">Set Price & Send Quote →</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-4">Closing automatically in 3 seconds…</p>
          <button onClick={onSaved}
            className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
            Back to Quotes
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-8">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{lead ? 'Edit Quote' : 'New Quote'}</h2>
            {lead && <p className="text-xs text-gray-400">ID: {lead.id.slice(0, 8)}…</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6 py-5">

          {/* ── Customer Info ── */}
          <Section icon={<Users className="h-4 w-4" />} title="Customer Information">
            <Field label="Full Name" required value={form.name}  onChange={set('name')}  placeholder="Amit Shah" />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Phone<span className="ml-0.5 text-orange-500">*</span>
              </label>
              <div className="flex gap-1.5">
                <span className="flex items-center rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-semibold text-gray-500 select-none">+91</span>
                <input type="tel" inputMode="numeric" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="9876543210"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
              </div>
            </div>
            <Field label="Email" value={form.email} onChange={set('email')} placeholder="amit@email.com" type="email" />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Source</label>
              <select value={form.source} onChange={set('source')} className={sel}>
                {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </Section>

          {/* ── Service Details ── */}
          <Section icon={<Package className="h-4 w-4" />} title="Service Details">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Service Type
              </label>
              <select value={form.service_interest} onChange={set('service_interest')} className={sel}>
                <option value="">— Select service type —</option>
                {SERVICE_TYPES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Status</label>
              <select value={form.status} onChange={set('status')} className={sel}>
                {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
            <Field label="From City" value={form.from_city} onChange={set('from_city')} placeholder="Mumbai" />
            <Field label="To City"   value={form.to_city}   onChange={set('to_city')}   placeholder="Delhi" />
          </Section>

          {/* ── Address Details ── */}
          <Section icon={<MapPin className="h-4 w-4" />} title="Address Details">
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Pickup Address</label>
              <input type="text" value={form.pickup_address} onChange={set('pickup_address')}
                placeholder="e.g. 42, Marine Drive, Mumbai 400002"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Drop Address</label>
              <input type="text" value={form.drop_address} onChange={set('drop_address')}
                placeholder="e.g. 15, Alkapuri, Vadodara 390007"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
          </Section>

          {/* ── Schedule & Bags ── */}
          <Section icon={<Calendar className="h-4 w-4" />} title="Schedule & Bags">
            {requiresFlight && (
              <Field label="Travel Date" value={form.travel_date} onChange={set('travel_date')} type="date" />
            )}
            <Field label="Pickup Date"   value={form.pickup_date}   onChange={set('pickup_date')}   type="date" />
            <Field label="Delivery Date" value={form.delivery_date} onChange={set('delivery_date')} type="date" />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Pickup Time Slot</label>
              <select value={form.pickup_time} onChange={set('pickup_time')} className={sel}>
                <option value="">— Select time —</option>
                {PICKUP_TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Number of Bags
                <span className="ml-1.5 font-normal text-gray-400 normal-case">(Up to 30 kg per bag)</span>
              </label>
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, bags_count: String(Math.max(1, Number(f.bags_count) - 1)) }))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-bold text-lg">−</button>
                <span className="w-10 text-center text-sm font-bold text-gray-900">{form.bags_count}</span>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, bags_count: String(Number(f.bags_count) + 1) }))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-bold text-lg">+</button>
              </div>
            </div>
          </Section>

          {/* ── Flight Info (conditional) ── */}
          {needsFlightInfo(form.service_interest) && (
            <Section icon={<Plane className="h-4 w-4" />} title="Flight Information">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">PNR / Ticket</label>
                <div className="flex gap-2 mb-2">
                  <button type="button"
                    onClick={() => setPnrMode('text')}
                    className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${pnrMode === 'text' ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    Enter PNR
                  </button>
                  <button type="button"
                    onClick={() => setPnrMode('file')}
                    className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${pnrMode === 'file' ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <Upload className="inline h-3 w-3 mr-1" />Upload Ticket
                  </button>
                </div>
                {pnrMode === 'text' ? (
                  <input type="text" value={form.pnr} onChange={set('pnr')} placeholder="6-char PNR"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                ) : (
                  <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-400">
                    <Upload className="mr-1.5 h-4 w-4" /> Click to upload ticket PDF/image
                  </div>
                )}
              </div>
              <Field label="Flight Number" value={form.flight_number} onChange={set('flight_number')} placeholder="6E 234" />
              <Field label="Flight Date & Time" value={form.flight_time?.slice(0, 16) ?? ''} onChange={set('flight_time')} type="datetime-local" />
            </Section>
          )}

          {/* ── Notes (full width) ── */}
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Notes / Special Instructions</label>
            <textarea rows={2} value={form.notes} onChange={set('notes')}
              placeholder="Any special instructions, weight details, fragile items…"
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
        </div>

        {/* Footer */}
        
        {err && (
          <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</div>
        )}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {saving
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : lead ? 'Save Changes' : 'Create Quote'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function LeadsPage() {
  const router   = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed]     = useState(false)
  const [leads, setLeads]       = useState<Lead[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState('all')
  const [modal, setModal]       = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null })
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setAuthed(true)
  }, [router])

  const fetchLeads = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    let qs = '?key=' + adminKey
    if (filter !== 'all') qs += '&status=' + filter
    if (search) qs += '&search=' + encodeURIComponent(search)
    const res = await fetch('/api/admin/leads' + qs)
    if (res.ok) setLeads((await res.json()).leads ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  useEffect(() => { if (authed) fetchLeads() }, [authed, fetchLeads])

  async function deleteLead(id: string) {
    if (!confirm('Delete this lead? This cannot be undone.')) return
    setDeleting(id)
    await fetch('/api/admin/leads/' + id, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey },
    })
    setDeleting(null)
    fetchLeads()
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (!authed) return null

  return (
    <>
      {modal.open && (
        <LeadModal
          lead={modal.lead}
          adminKey={adminKey}
          onClose={() => setModal({ open: false, lead: null })}
          onSaved={() => { setModal({ open: false, lead: null }); fetchLeads() }}
        />
      )}

      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Quote Management</h1>
            <p className="mt-0.5 text-sm text-gray-400">Capture prospects — send a quote to convert to a booking</p>
          </div>
          <button onClick={() => setModal({ open: true, lead: null })}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
            <Plus className="h-4 w-4" /> New Quote
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by name, phone, or email…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchLeads}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : leads.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-sm text-gray-400">No quotes found</p>
              <button onClick={() => setModal({ open: true, lead: null })}
                className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
                Add First Quote
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Quote #', 'Customer', 'Service', 'Route', 'Source', 'Status', 'Booking', 'Date', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leads.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-gray-500">{l.lead_number ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{l.name}</p>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Phone className="h-3 w-3" />{l.phone}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {l.service_interest ?? l.service_type ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {l.from_city && l.to_city ? `${l.from_city} → ${l.to_city}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {l.source ? (
                          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                            {SOURCE_LABELS[l.source] ?? l.source}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const cfg = STATUS_CONFIG[l.status] ?? { label: l.status, color: '#6b7280', bg: '#f3f4f6' }
                          return (
                            <span style={{ color: cfg.color, background: cfg.bg }}
                              className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold">
                              {cfg.label}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {l.booking_id ? (
                          <Link href={`/admin?highlight=${l.booking_id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-green-100 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:border-green-300 transition-colors">
                            <ExternalLink className="h-3 w-3" /> View Booking
                          </Link>
                        ) : (
                          <Link href={`/admin/quotes/new?lead_id=${l.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600 hover:border-orange-300 transition-colors">
                            <ExternalLink className="h-3 w-3" /> Create Quote
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(l.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setModal({ open: true, lead: l })}
                            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600 transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteLead(l.id)} disabled={deleting === l.id}
                            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-40">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">
          Each new quote automatically creates a booking entry visible in the Dashboard and Bookings tab.
        </p>
      </main>
    </>
  )
}
