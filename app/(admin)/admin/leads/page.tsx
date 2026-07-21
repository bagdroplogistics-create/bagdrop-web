'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, Search, RefreshCw, ChevronDown,
  Phone, Pencil, Trash2, X, Save, Upload, Plane,
  Package, Calendar, Clock, CheckCircle, ExternalLink, MapPin, ArrowUpDown,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────
interface Lead {
  id:                   string
  name:                 string
  phone:                string
  email:                string | null
  source:               string
  service_interest:     string | null
  service_type:         string | null
  from_city:            string | null
  to_city:              string | null
  travel_date:          string | null
  pickup_date:          string | null
  delivery_date:        string | null
  pickup_time:          string | null
  bags_count:           number
  pnr:                  string | null
  flight_number:        string | null
  flight_time:          string | null
  flight_ticket_url:    string | null
  pickup_address:       string | null
  drop_address:         string | null
  booking_id:           string | null
  lead_number:          string | null
  status:               string
  notes:                string | null
  assigned_to:          string | null
  created_at:           string
  zoho_estimate_id:     string | null
  zoho_estimate_number: string | null
  quote_discount_pct:   number | null
  quote_discount_amt:   number | null
  payment_status:       string | null
  updated_at?:          string | null
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
  manual:         'Manual',
  website:        'Website',
  'mobile-app':   'Mobile App',
  'contact-form': 'Contact Form',
  referral:       'Referral',
  b2b:            'B2B',
  'walk-in':      'Walk-in',
}

const SERVICE_TYPES = [
  { value: 'airport-to-doorstep', label: 'Airport → Doorstep', needsFlight: true },
  { value: 'doorstep-to-airport', label: 'Doorstep → Airport', needsFlight: true },
  { value: 'doorstep-to-doorstep', label: 'Doorstep → Doorstep', needsFlight: false },
  { value: 'airport-to-airport',   label: 'Airport → Airport',   needsFlight: false },
]

// 06:00 AM → 11:30 PM → 12:00 AM → 05:30 AM in 30-minute steps (12-hour AM/PM)
// value = 24-h string stored in DB; label = display string
function _to12h(h24: number, m: number) {
  const p = h24 < 12 ? 'AM' : 'PM'
  const h = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'} ${p}`
}
const PICKUP_TIME_SLOTS: { value: string; label: string }[] = [
  // 06:00 (index 12) → 23:30 (index 47)
  ...Array.from({ length: 36 }, (_, i) => {
    const idx = i + 12; const h = Math.floor(idx / 2); const m = idx % 2 === 0 ? 0 : 30
    return { value: `${String(h).padStart(2,'0')}:${m===0?'00':'30'}`, label: _to12h(h, m) }
  }),
  // 00:00 (index 0) → 05:30 (index 11)
  ...Array.from({ length: 12 }, (_, i) => {
    const h = Math.floor(i / 2); const m = i % 2 === 0 ? 0 : 30
    return { value: `${String(h).padStart(2,'0')}:${m===0?'00':'30'}`, label: _to12h(h, m) }
  }),
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
  name: string; phone: string; countryCode: string; email: string; source: string
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

const COUNTRY_CODES = [
  { code: '+91',  flag: '🇮🇳', label: 'India (+91)',  maxDigits: 10 },
  { code: '+1',   flag: '🇺🇸', label: 'USA (+1)',     maxDigits: 10 },
  { code: '+44',  flag: '🇬🇧', label: 'UK (+44)',     maxDigits: 11 },
  { code: '+1CA', flag: '🇨🇦', label: 'Canada (+1)', maxDigits: 10 },
]

const EMPTY_FORM: LeadForm = {
  name: '', phone: '', countryCode: '+91', email: '', source: 'manual',
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
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<LeadForm>(
    lead
      ? {
          name:              lead.name,
          phone:             lead.phone.replace(/^\+\d+/, ''),  // strip any stored country code
          countryCode:       '+91',  // default; stored leads don't carry code separately
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
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')
  const [saved, setSaved]       = useState<{ lead_number: string; tracking_id: string | null } | null>(null)
  const [savedLeadId, setSavedLeadId] = useState<string | null>(null)
  const [pnrMode, setPnrMode]   = useState<'text' | 'file'>('text')
  const [fileName, setFileName] = useState('')
  const [dupWarning, setDupWarning] = useState<{ lead_number: string; name: string; id: string } | null>(null)

  // ── Route price auto-calculation ─────────────────────────────────
  const [routePrice, setRoutePrice] = useState<{
    found: boolean; total?: number; subtotal?: number; from_city?: string; to_city?: string; bags?: number
  } | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)

  useEffect(() => {
    if (!form.from_city || !form.to_city || !adminKey) { setRoutePrice(null); return }
    const timer = setTimeout(async () => {
      setPriceLoading(true)
      try {
        const qs  = new URLSearchParams({ key: adminKey, from: form.from_city, to: form.to_city, bags: form.bags_count })
        const res = await fetch(`/api/admin/route-pricing/calculate?${qs}`)
        if (res.ok) setRoutePrice(await res.json())
        else        setRoutePrice(null)
      } catch { setRoutePrice(null) }
      setPriceLoading(false)
    }, 600)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.from_city, form.to_city, form.bags_count, adminKey])

  const set = (k: keyof LeadForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const requiresFlight = needsFlightInfo(form.service_interest)

  // Validation
  function validate() {
    if (!form.name.trim())                       return 'Customer name is required'
    if (!form.phone.trim())                      return 'Phone number is required'
    if (!form.pickup_date)                       return 'Pickup date is required'
    if (!form.delivery_date)                     return 'Delivery date is required'
    if (!form.pickup_time)                       return 'Pickup time slot is required'
    if (!Number(form.bags_count) || Number(form.bags_count) < 1) return 'Number of bags must be at least 1'
    return null
  }

  async function save(forceDuplicate = false) {
    const validationErr = validate()
    if (validationErr) { setErr(validationErr); return }
    setSaving(true); setErr(''); setDupWarning(null)

    const url    = lead ? `/api/admin/leads/${lead.id}` : '/api/admin/leads'
    const method = lead ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        ...form,
        // Store full phone with dial code (e.g. +919876543210, +17185550100)
        phone:          (form.countryCode === '+1CA' ? '+1' : form.countryCode) + form.phone,
        service_type:   form.service_interest,
        bags_count:     Number(form.bags_count) || 1,
        pickup_address: form.pickup_address.trim() || null,
        drop_address:   form.drop_address.trim() || null,
        // Clear flight fields if service type doesn't need them
        pnr:               requiresFlight ? (form.pnr.trim() || null) : null,
        flight_number:     requiresFlight ? (form.flight_number.trim() || null) : null,
        flight_time:       requiresFlight ? (form.flight_time || null) : null,
        flight_ticket_url: requiresFlight ? (form.flight_ticket_url.trim() || null) : null,
        // Duplicate override
        ...(forceDuplicate ? { force_duplicate: true } : {}),
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Duplicate phone detected — show inline warning instead of error
      if (res.status === 409 && j.code === 'DUPLICATE_PHONE' && j.duplicate_lead) {
        setDupWarning(j.duplicate_lead)
        setSaving(false)
        return
      }
      setErr(j.error ?? 'Save failed')
      setSaving(false)
      return
    }
    // For new leads: show confirmation then redirect to quote form
    if (!lead && j.lead_number) {
      const newLeadId = j.lead?.id ?? null
      setSaved({ lead_number: j.lead_number, tracking_id: null })
      setSavedLeadId(newLeadId)
      setSaving(false)
      // Auto-navigate to quote form after 1.5s
      if (newLeadId) {
        setTimeout(() => router.push(`/admin/quotes/new?lead_id=${newLeadId}`), 1500)
      } else {
        setTimeout(() => onSaved(), 3000)
      }
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
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Lead Saved!</h2>
          <p className="text-sm text-gray-500 mb-4">
            <span className="font-mono font-bold text-blue-700">{saved.lead_number}</span>
            <br />Opening quote form…
          </p>
          <div className="flex items-center justify-center gap-2 mb-5">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
            <span className="text-sm text-gray-400">Redirecting to quote builder</span>
          </div>
          {savedLeadId && (
            <button
              onClick={() => router.push(`/admin/quotes/new?lead_id=${savedLeadId}`)}
              className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
              Open Quote Form Now →
            </button>
          )}
          <button onClick={onSaved} className="mt-2 w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
            Back to Leads
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
                <select
                  value={form.countryCode}
                  onChange={e => setForm(f => ({ ...f, countryCode: e.target.value, phone: '' }))}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs font-semibold text-gray-600 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 cursor-pointer"
                  aria-label="Country code"
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>{c.flag} {c.label}</option>
                  ))}
                </select>
                <input type="tel" inputMode="numeric" value={form.phone}
                  onChange={e => {
                    const maxLen = COUNTRY_CODES.find(c => c.code === form.countryCode)?.maxDigits ?? 10
                    setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, maxLen) }))
                  }}
                  placeholder={form.countryCode === '+44' ? '7911 123456' : '9876543210'}
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
              <Field label="Travel Date (Optional)" value={form.travel_date} onChange={set('travel_date')} type="date" />
            )}
            <Field label="Pickup Date"   value={form.pickup_date}   onChange={set('pickup_date')}   type="date" />
            <Field label="Delivery Date" value={form.delivery_date} onChange={set('delivery_date')} type="date" />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Pickup Time Slot</label>
              <select value={form.pickup_time} onChange={set('pickup_time')} className={sel}>
                <option value="">— Select time —</option>
                {PICKUP_TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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

          {/* ── Route Price Estimate ── */}
          {(routePrice || priceLoading) && (
            <div className="col-span-2">
              {priceLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-400">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
                  Calculating route price…
                </div>
              ) : routePrice?.found ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-orange-500 mb-1.5">
                    Suggested Price — {form.from_city} → {form.to_city} · {form.bags_count} bag{Number(form.bags_count) !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-black text-orange-600">
                      ₹{routePrice.total?.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs text-orange-400">incl. 5% GST</span>
                    <span className="ml-auto text-xs text-orange-400">
                      Base ₹{routePrice.subtotal?.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ) : routePrice && !routePrice.found ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  <span className="font-semibold">No pricing configured</span> for {form.from_city} → {form.to_city}.
                  {' '}<a href="/admin/route-pricing" target="_blank" rel="noreferrer" className="underline font-semibold">Add it in Route Pricing →</a>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Flight Info (conditional, all optional) ── */}
          {needsFlightInfo(form.service_interest) && (
            <Section icon={<Plane className="h-4 w-4" />} title="Flight Information (Optional — fill later if not available)">
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
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Flight Date &amp; Time</label>
                <div className="flex gap-2">
                  <input type="date" value={form.flight_time?.slice(0, 10) ?? ''}
                    onChange={e => {
                      const timePart = form.flight_time?.slice(11, 16) ?? ''
                      set('flight_time')({ target: { value: timePart ? `${e.target.value}T${timePart}` : e.target.value } } as React.ChangeEvent<HTMLInputElement>)
                    }}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  <select value={form.flight_time?.slice(11, 16) ?? ''}
                    onChange={e => {
                      const datePart = form.flight_time?.slice(0, 10) ?? ''
                      set('flight_time')({ target: { value: datePart ? `${datePart}T${e.target.value}` : e.target.value } } as React.ChangeEvent<HTMLInputElement>)
                    }}
                    className="w-28 shrink-0 rounded-lg border border-gray-200 px-2 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
                    <option value="">-- Time --</option>
                    {PICKUP_TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
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

        {/* Duplicate phone warning */}
        {dupWarning && (
          <div className="mx-6 mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">⚠️ Duplicate Phone Number Detected</p>
            <p className="mt-0.5 text-xs text-amber-700">
              A lead already exists for this phone number: <span className="font-semibold">{dupWarning.lead_number}</span> ({dupWarning.name}).
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Create Anyway
              </button>
              <button
                onClick={() => { setDupWarning(null); router.push(`/admin/quotes/view/${dupWarning.id}`) }}
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
              >
                View Existing Lead
              </button>
              <button
                onClick={() => setDupWarning(null)}
                className="text-xs text-amber-600 underline hover:text-amber-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => save()} disabled={saving}
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

// ── Sort helpers ─────────────────────────────────────────────────
const LEAD_SORT_OPTIONS = [
  { value: 'newest',    label: 'Newest First' },
  { value: 'oldest',   label: 'Oldest First' },
  { value: 'date_desc',label: 'Date (Newest → Oldest)' },
  { value: 'date_asc', label: 'Date (Oldest → Newest)' },
  { value: 'updated',  label: 'Recently Updated' },
  { value: 'name_asc', label: 'Customer Name (A–Z)' },
  { value: 'name_desc',label: 'Customer Name (Z–A)' },
]

function sortLeads(arr: Lead[], sortBy: string): Lead[] {
  return [...arr].sort((a, b) => {
    switch (sortBy) {
      case 'oldest':    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'date_asc':  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'updated':   return new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime()
      case 'name_asc':  return (a.name ?? '').localeCompare(b.name ?? '')
      case 'name_desc': return (b.name ?? '').localeCompare(a.name ?? '')
      default:          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime() // newest
    }
  })
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
  const [sort, setSort]         = useState('newest')
  const [modal, setModal]             = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null })
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Lead | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setAuthed(true)
    const savedSort = sessionStorage.getItem('bagdrop_leads_sort')
    if (savedSort) setSort(savedSort)
  }, [router])

  function handleSortChange(val: string) {
    setSort(val)
    sessionStorage.setItem('bagdrop_leads_sort', val)
  }

  const fetchLeads = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    let qs = '?key=' + adminKey
    if (showDeleted) {
      // Show only soft-deleted leads
      qs += '&deleted=true'
    } else if (filter !== 'all') {
      qs += '&status=' + filter
    }
    // Do NOT filter by exclude_status=cancelled — a lead is always visible
    // regardless of its linked booking's status. The booking can be cancelled
    // and re-activated when a new quote is generated.
    if (search) qs += '&search=' + encodeURIComponent(search)
    const res = await fetch('/api/admin/leads' + qs)
    if (res.ok) setLeads((await res.json()).leads ?? [])
    setLoading(false)
  }, [adminKey, filter, search, showDeleted])

  useEffect(() => { if (authed) fetchLeads() }, [authed, fetchLeads])

  async function confirmDelete(lead: Lead) {
    setDeleteConfirm(null)
    setDeleting(lead.id)
    await fetch('/api/admin/leads/' + lead.id, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey },
    })
    setDeleting(null)
    fetchLeads()
  }

  async function restoreLead(id: string) {
    setDeleting(id)
    await fetch('/api/admin/leads/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ deleted_at: null }),
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

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-red-100 bg-white shadow-2xl">
            <div className="p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="mb-1 text-base font-bold text-gray-900">Delete Lead?</h3>
              <p className="text-sm text-gray-500 mb-1">
                <strong>{deleteConfirm.name}</strong> · {deleteConfirm.lead_number}
              </p>
              <p className="text-xs text-gray-400 mb-5">
                The lead will be soft-deleted and can be recovered from the Deleted Leads view. The linked booking will be cancelled.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => confirmDelete(deleteConfirm)}
                  disabled={deleting === deleteConfirm.id}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {deleting === deleteConfirm.id ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Quote Management</h1>
            <p className="mt-0.5 text-sm text-gray-400">Capture prospects — send a quote to convert to a booking</p>
          </div>
          <button onClick={() => router.push('/admin/quotes/new')}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
            <Plus className="h-4 w-4" /> New Quote
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Filters + sort */}
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
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <select value={sort} onChange={e => handleSortChange(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              {LEAD_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchLeads}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowDeleted(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors shadow-sm ${
              showDeleted
                ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}>
            <Trash2 className="h-3.5 w-3.5" />
            {showDeleted ? 'Active Leads' : 'Deleted'}
          </button>
        </div>
        {showDeleted && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <Trash2 className="h-4 w-4 shrink-0" />
            Showing soft-deleted leads. Click <strong>&nbsp;↩ Restore&nbsp;</strong> to recover a lead.
          </div>
        )}

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
                    {['Quote #', 'Customer', 'Service', 'Route', 'Source', 'Status', 'Booking / Estimate', 'Date', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortLeads(leads, sort).map(l => (
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
                        <div className="flex flex-col gap-1">
                          {l.booking_id ? (
                            <Link href={`/admin?highlight=${l.booking_id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-green-100 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:border-green-300 transition-colors">
                              <ExternalLink className="h-3 w-3" /> View Booking
                            </Link>
                          ) : (
                            <button
                              onClick={async () => {
                                const res = await fetch('/api/admin/repair/create-booking-for-lead', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
                                  body: JSON.stringify({ lead_id: l.id }),
                                })
                                if (res.ok) {
                                  const data = await res.json().catch(() => ({}))
                                  await fetchLeads()
                                  if (data?.booking?.id) {
                                    router.push(`/admin?highlight=${data.booking.id}`)
                                  }
                                } else {
                                  const err = await res.json().catch(() => ({}))
                                  alert('Could not link booking: ' + (err.error ?? 'Unknown error'))
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-green-100 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:border-green-300 transition-colors">
                              <ExternalLink className="h-3 w-3" /> View Booking
                            </button>
                          )}
                          {l.zoho_estimate_number ? (
                            <div className="flex flex-col gap-1">
                              <Link href={`/admin/quotes/view/${l.id}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:border-blue-300 transition-colors">
                                <ExternalLink className="h-3 w-3" />
                                {l.zoho_estimate_number}
                              </Link>
                              {(l.quote_discount_amt ?? 0) > 0 && (
                                <span className="inline-flex items-center rounded-full bg-red-50 border border-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                                  {l.quote_discount_pct
                                    ? `−${l.quote_discount_pct}%`
                                    : `−₹${Number(l.quote_discount_amt).toLocaleString('en-IN')}`
                                  } discount
                                </span>
                              )}
                              {/* Payment status badge — clickable to toggle */}
                              <button
                                onClick={async () => {
                                  const next = l.payment_status === 'received' ? 'pending' : 'received'
                                  await fetch(`/api/admin/leads/${l.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
                                    body: JSON.stringify({ payment_status: next }),
                                  })
                                  fetchLeads()
                                }}
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                                  l.payment_status === 'received'
                                    ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                }`}
                                title="Click to toggle payment status">
                                {l.payment_status === 'received' ? '✓ Received' : '⏳ Pending'}
                              </button>
                            </div>
                          ) : (
                            <Link href={`/admin/quotes/new?lead_id=${l.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600 hover:border-orange-300 transition-colors">
                              <ExternalLink className="h-3 w-3" /> Generate Quote
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(l.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {showDeleted ? (
                            <button
                              onClick={() => restoreLead(l.id)}
                              disabled={deleting === l.id}
                              className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-40">
                              {deleting === l.id ? 'Restoring…' : '↩ Restore'}
                            </button>
                          ) : (
                            <>
                              <button onClick={() => router.push(`/admin/quotes/new?lead_id=${l.id}&edit=true`)}
                                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600 transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setDeleteConfirm(l)} disabled={deleting === l.id}
                                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-40">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
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
        <p className="mt-3 text-center text-xs text-gray-400">
          Every new lead automatically creates a linked booking visible in the Dashboard and Bookings tab. Click <strong>View Booking</strong> to open the linked booking directly.
        </p>
      </main>
    </>
  )
}
