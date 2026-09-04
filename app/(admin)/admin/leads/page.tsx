'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Users, Plus, Search, RefreshCw, ChevronDown,
  Phone, Pencil, Trash2, X, Save, Upload, Plane,
  Package, Calendar, Clock, CheckCircle, ExternalLink, MapPin, ArrowUpDown, History,
  Printer, Mail, MessageCircle,
} from 'lucide-react'
import Link from 'next/link'
import { PhoneInput } from '@/components/ui/phone-input'
import { parseStoredPhone, toE164 } from '@/lib/phone-format'
import { TITLE_OPTIONS, DEFAULT_TITLE, formatCustomerName } from '@/lib/constants'
import { SOURCE_LABELS } from '@/lib/lead-source'
import FollowUpPanel from '@/components/admin/FollowUpPanel'

// ── Types ────────────────────────────────────────────────────────
interface Lead {
  id:                   string
  title?:               string | null
  name:                 string
  phone:                string
  email:                string | null
  source:               string
  partner_name?:        string | null
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
  // Read-only, computed server-side in GET /api/admin/leads — the linked
  // booking's real current status once a quote exists, otherwise equal to
  // `status`. Never present on POST/PATCH payloads; display-only.
  effective_status?:    string
  // Read-only, computed server-side in GET /api/admin/leads (2026-08-25) —
  // true only once the linked booking has reached Payment Received/
  // Approved or later (same definition as the Dashboard's "Total Confirmed
  // Bookings" KPI). Use this, not a BOOKING_STATUS_CONFIG lookup, for
  // anything that means "is this lead actually Confirmed" — effective_status
  // above can hold an early, pre-payment status too.
  is_confirmed?:         boolean
  notes:                string | null
  assigned_to:          string | null
  created_at:           string
  zoho_estimate_id:     string | null
  zoho_estimate_number: string | null
  quote_discount_pct:   number | null
  quote_discount_amt:   number | null
  payment_status:       string | null
  updated_at?:          string | null
  acknowledgment_sent_at?: string | null
  communication_log?:   CommunicationLogEntry[] | null
  // Sales Follow-up & Reminder System — see
  // lib/sales-followup-reminders.ts / app/api/admin/sales-followup-summary/route.ts.
  quote_number?:           string | null
  quote_date?:             string | null
  // Final quotation amount for the primary quote (leads.quote_total —
  // already returned by GET /api/admin/leads' `select('*')`, just not
  // previously read on this page). Used by the new "Quote Amount" column
  // and the Send Quote via Email/WhatsApp row actions below. Deliberately
  // NOT return_quote_total — the Leads table only ever surfaces the
  // primary quote (see the 2026-08-31 "Return Quote button intentionally
  // REMOVED from this table" comment further down), so Quote Amount
  // mirrors that same scope.
  quote_total?:            number | null
  // Set only once a Return Journey quote has been generated for this lead
  // (see app/api/admin/zoho/generate-quote/route.ts's is_return_quote
  // auto-detect — calling that route again for a lead that already has
  // quote_number writes here instead of overwriting the primary quote).
  // Used purely to decide whether to show "+ Return Quote" below.
  return_quote_number?:    string | null
  customer_responded_at?:  string | null
  deleted_at?:             string | null
}

interface CommunicationLogEntry {
  type:      string
  channel:   'email' | 'whatsapp' | string
  status:    'sent' | 'failed' | 'skipped' | string
  timestamp: string
  detail:    string | null
}

// ── Config ───────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#2563eb', bg: '#dbeafe' },
  contacted: { label: 'Contacted', color: '#d97706', bg: '#fef3c7' },
  qualified: { label: 'Qualified', color: '#7c3aed', bg: '#ede9fe' },
  converted: { label: 'Converted', color: '#16a34a', bg: '#dcfce7' },
  lost:      { label: 'Lost',      color: '#dc2626', bg: '#fee2e2' },
  // Not a real leads.status value — it's the linked booking's real status
  // (bookings.status = 'confirmed'), surfaced here as a read-only display
  // status (see `effective_status` in GET /api/admin/leads). Included in
  // this lookup table so the badge/filter dropdown can render it, but kept
  // OUT of EDITABLE_LEAD_STATUSES below since it can never be set directly
  // on a lead.
  confirmed: { label: 'Confirmed', color: '#0e7490', bg: '#cffafe' },
  // Same treatment as 'confirmed' above — not a real leads.status value,
  // it's the linked booking's real status (bookings.status = 'cancelled',
  // set via the Dashboard's Cancel Booking action, 2026-08-31). Adding it
  // here is what makes "Cancelled" appear as a Status filter option below
  // (the dropdown is built by iterating this object) and lets a cancelled
  // lead's badge fall back to this if BOOKING_STATUS_CONFIG's own
  // 'cancelled' entry is ever bypassed. See GET /api/admin/leads' matching
  // `status === 'cancelled'` branch for how the filter actually queries —
  // cancelled inquiries stay visible in the table (never deleted), just
  // findable via this filter, per founder spec: "Cancelled inquiries should
  // remain visible in the Leads table when the Admin selects Status →
  // Cancelled."
  cancelled: { label: 'Cancelled', color: '#dc2626', bg: '#fee2e2' },
}

// The lead-funnel statuses an admin can actually set via the Edit Quote
// modal. 'confirmed' is deliberately excluded — see the comment above.
const EDITABLE_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost']

// Real bookings.status labels/colors — mirrors STATUS_CONFIG in
// app/(admin)/admin/page.tsx (minus icons) and must stay in sync with it.
// A Confirmed lead's badge shows one of these (via `effective_status` from
// GET /api/admin/leads), e.g. "Invoice Sent" or "Pickup Scheduled", so the
// Leads tab shows exactly where each inquiry currently sits in the
// pipeline — the same detail the Dashboard's bookings table shows —
// instead of collapsing everything under a single "Confirmed" label.
const BOOKING_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  inquiry:               { label: 'New Inquiry',         color: '#92400e', bg: '#fef3c7' },
  quote_created:         { label: 'Quote Created',       color: '#4f46e5', bg: '#eef2ff' },
  quote_sent:            { label: 'Quote Sent',          color: '#6d28d9', bg: '#ede9fe' },
  accepted:              { label: 'Quote Accepted',      color: '#0891b2', bg: '#cffafe' },
  rejected:              { label: 'Quote Rejected',      color: '#dc2626', bg: '#fee2e2' },
  closed:                { label: 'Inquiry Closed',      color: '#6b7280', bg: '#f3f4f6' },
  payment_pending:       { label: 'Payment Requested',   color: '#d97706', bg: '#fef3c7' },
  payment_received:      { label: 'Payment Received',    color: '#059669', bg: '#d1fae5' },
  // Deliberately NOT the same green as Payment Received — this status
  // means the booking was let through without an actual payment (VIP /
  // Admin Approve — Pay Later). Amber matches the Payments tab's own
  // "Approved (Unpaid)" badge for the same underlying payment_status
  // value ('approved_pending'), so Accounts can tell at a glance which
  // customers have actually paid (founder spec, 2026-08-20).
  payment_approved:      { label: 'Admin Approved (VIP)', color: '#d97706', bg: '#fef3c7' },
  confirmed:             { label: 'Booking Confirmed',   color: '#2563eb', bg: '#dbeafe' },
  invoice_generated:     { label: 'Invoice Generated',   color: '#7c3aed', bg: '#ede9fe' },
  invoice_sent:          { label: 'Invoice Sent',        color: '#6d28d9', bg: '#ede9fe' },
  pickup_scheduled:      { label: 'Pickup Scheduled',    color: '#7c3aed', bg: '#ede9fe' },
  picked_up:             { label: 'Bags Picked Up',      color: '#7c3aed', bg: '#ede9fe' },
  in_transit:            { label: 'In Transit',          color: '#0891b2', bg: '#cffafe' },
  out_for_delivery:      { label: 'Out for Delivery',    color: '#ea580c', bg: '#ffedd5' },
  driver_details_shared: { label: 'Driver Details Shared', color: '#0369a1', bg: '#e0f2fe' },
  indemnity_bond_sent:   { label: 'Indemnity Bond Sent', color: '#b45309', bg: '#fef3c7' },
  // 2026-08-24 fix — was missing (same class of bug as the ACTIVE_STATUSES
  // gap fixed earlier today): a booking at exactly this status fell through
  // to the displayStatus fallback (`{ label: displayStatus, ... }`), which
  // is why the badge rendered the raw enum text "indemnity_bond_signed"
  // instead of a real label, and the "Confirmed" sub-label above it (which
  // keys off this same lookup succeeding) didn't show either.
  indemnity_bond_signed: { label: 'Indemnity Bond Signed', color: '#65a30d', bg: '#ecfccb' },
  delivered:             { label: 'Delivered',           color: '#16a34a', bg: '#dcfce7' },
  trip_created:          { label: 'Trip Sheet Created',  color: '#0891b2', bg: '#cffafe' },
  completed:             { label: 'Completed',           color: '#14532d', bg: '#bbf7d0' },
  cancelled:             { label: 'Cancelled',           color: '#dc2626', bg: '#fee2e2' },
}

// SOURCE_LABELS now lives in lib/lead-source.ts — shared with the
// Dashboard (app/(admin)/admin/page.tsx) so both surfaces resolve a
// lead/booking's source to the exact same label. See that file's module
// comment for the 2026-08-24 root-cause writeup (Dashboard used to guess
// source from tracking_id prefix instead of reading the real value).

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
  title: string; name: string; phone: string; countryIso2: string; email: string; source: string
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
  title: DEFAULT_TITLE, name: '', phone: '', countryIso2: 'IN', email: '', source: 'manual',
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
  // Re-parses the stored E.164 string so the correct flag/dial code shows
  // automatically instead of always resetting to India — previously this
  // stripped the country code entirely and hardcoded +91.
  const initialPhone = lead ? parseStoredPhone(lead.phone) : null

  const [form, setForm] = useState<LeadForm>(
    lead
      ? {
          title:             (lead.title && TITLE_OPTIONS.includes(lead.title as never) ? lead.title : DEFAULT_TITLE) as string,
          name:              lead.name,
          phone:             initialPhone!.nationalNumber,
          countryIso2:       initialPhone!.iso2,
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
        // Full international number for the existing single-column DB field
        // (e.g. +919876543210, +14155550100) plus the two parts split out
        // separately — see INTERNATIONAL_PHONE_MIGRATION.sql.
        phone:               toE164(form.phone, form.countryIso2),
        phone_country_code:  form.countryIso2,
        phone_national:      form.phone,
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
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Title<span className="ml-0.5 text-orange-500">*</span>
              </label>
              <select
                value={form.title} onChange={set('title')} required
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              >
                {TITLE_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <Field label="Full Name" required value={form.name}  onChange={set('name')}  placeholder="Amit Shah" />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Phone<span className="ml-0.5 text-orange-500">*</span>
              </label>
              <PhoneInput
                countryIso2={form.countryIso2}
                nationalNumber={form.phone}
                onCountryChange={iso2 => setForm(f => ({ ...f, countryIso2: iso2 }))}
                onNumberChange={digits => setForm(f => ({ ...f, phone: digits }))}
                placeholder="9876543210"
                required
              />
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
                {EDITABLE_LEAD_STATUSES.map(v => <option key={v} value={v}>{STATUS_CONFIG[v].label}</option>)}
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

          {/* ── Communication Log (read-only, full width) ── */}
          {lead && lead.communication_log && lead.communication_log.length > 0 && (
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Communication Log
              </label>
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {lead.communication_log.map((entry, i) => {
                  const statusStyle =
                    entry.status === 'sent'    ? { color: '#16a34a', bg: '#f0fdf4', label: 'Sent' } :
                    entry.status === 'failed'  ? { color: '#dc2626', bg: '#fef2f2', label: 'Failed' } :
                                                  { color: '#6b7280', bg: '#f9fafb', label: 'Skipped' }
                  const channelLabel = entry.channel === 'whatsapp' ? 'WhatsApp' : entry.channel === 'email' ? 'Email' : entry.channel
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-gray-700 whitespace-nowrap">{channelLabel}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500 truncate">
                          {new Date(entry.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {entry.detail && entry.status === 'failed' && (
                          <span className="text-red-500 truncate" title={entry.detail}>— {entry.detail}</span>
                        )}
                      </div>
                      <span style={{ color: statusStyle.color, background: statusStyle.bg }}
                        className="shrink-0 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">
                        {statusStyle.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        
        {err && (
          <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</div>
        )}

        {/* Existing website/contact-form inquiry warning (2026-08-25) —
            re-enabled server-side guard on POST /api/admin/leads (see
            lib/duplicate-inquiry-check.ts), narrower than the old blanket
            duplicate-phone check: only fires for a still-open, unquoted
            inquiry that itself came from Website/Contact Form/Mobile App. */}
        {dupWarning && (
          <div className="mx-6 mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">⚠️ Existing Website Inquiry Found</p>
            <p className="mt-0.5 text-xs text-amber-700">
              This customer already has an inquiry received from the website: <span className="font-semibold">{dupWarning.lead_number}</span> ({dupWarning.name}).
              Please create the quote from the existing inquiry instead of creating a new one.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => { setDupWarning(null); router.push(`/admin/quotes/new?lead_id=${dupWarning.id}`) }}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Open Existing Inquiry →
              </button>
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
              >
                Create Anyway
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

// ── Sales Follow-up & Reminder System — client-side badge/filter helpers ──
// Mirrors the stop-conditions in lib/sales-followup-reminders.ts, minus
// the linked-booking-status check (the leads list endpoint doesn't join
// bookings) — a reasonable approximation for display purposes only. The
// cron job's own send-time check is always the authoritative one. Uses a
// fixed 24h threshold to match the system default (Settings currently has
// no dedicated UI to change this — see sales_followup_*_hours keys).
const FOLLOWUP_THRESHOLD_MS = 24 * 3600000

function isQuotePending(l: Lead): boolean {
  return !l.quote_number && l.status !== 'lost'
}
function isFollowupPending(l: Lead): boolean {
  return !!l.quote_number && !l.customer_responded_at && l.status !== 'lost'
}
function isOverdueQuote(l: Lead): boolean {
  return isQuotePending(l) && (Date.now() - new Date(l.created_at).getTime() >= FOLLOWUP_THRESHOLD_MS)
}
function isOverdueFollowup(l: Lead): boolean {
  return isFollowupPending(l) && !!l.quote_date && (Date.now() - new Date(l.quote_date).getTime() >= FOLLOWUP_THRESHOLD_MS)
}
function followupDueWithinDays(l: Lead, daysFromNow: number): boolean {
  if (!isFollowupPending(l) || !l.quote_date) return false
  const dueAt = new Date(l.quote_date).getTime() + FOLLOWUP_THRESHOLD_MS
  if (dueAt < Date.now()) return false // already overdue, not "due today/tomorrow"
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() + daysFromNow)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
  return dueAt >= dayStart.getTime() && dueAt < dayEnd.getTime()
}

function matchesFollowupFilter(l: Lead, param: string | null): boolean {
  switch (param) {
    case 'quotes_pending':      return isQuotePending(l)
    case 'followup_pending':    return isFollowupPending(l)
    case 'overdue_quotes':      return isOverdueQuote(l)
    case 'overdue_followups':   return isOverdueFollowup(l)
    case 'today_followups':     return followupDueWithinDays(l, 0)
    case 'tomorrow_followups':  return followupDueWithinDays(l, 1)
    default:                    return true
  }
}

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
function LeadsPageInner() {
  const router   = useRouter()
  const searchParams = useSearchParams()
  // Sales Follow-up & Reminder System — set from the Dashboard's "Sales
  // Follow-up" cards (?followup=quotes_pending etc.). Purely a client-side
  // filter over the already-fetched leads list — no new backend query.
  const followupParam = searchParams.get('followup')
  // Dashboard "Manage in Leads" direct-open — ?open_booking_id=... and/or
  // ?open_lead_id=... (app/(admin)/admin/page.tsx). Read once on mount;
  // handleOpenParam below fetches the exact target lead (bypassing every
  // filter) and forces the view to make it visible, then strips these
  // params from the URL so they don't stick around on refresh/back-nav.
  const openBookingId = searchParams.get('open_booking_id')
  const openLeadId    = searchParams.get('open_lead_id')
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed]     = useState(false)
  const [leads, setLeads]       = useState<Lead[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sort, setSort]         = useState('newest')
  const [modal, setModal]             = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null })
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Lead | null>(null)
  // Read-only Communication Log viewer (2026-09-01 — founder reported an
  // acknowledgment WhatsApp not arriving for an international-number lead
  // and needed to see the actual send status/error). LeadModal already
  // renders lead.communication_log (see its own JSX further down this
  // file), but LeadModal is only ever opened with `lead: null` — for
  // CREATING a brand-new lead — from the empty-state "Add First Quote"
  // button. There was no way to open it for an EXISTING lead at all, and
  // deliberately not fixed by wiring the existing pencil/edit icon to it:
  // that icon already routes every lead (quoted or not) to
  // /admin/quotes/new?edit=true, a separate specialized editor — reusing
  // LeadModal (a full create/edit form) for an already-quoted lead risks
  // the exact same two-conflicting-edit-paths problem already fixed once
  // this session for Return Quote. This is a small, separate, READ-ONLY
  // viewer instead — no form fields, nothing it can write, zero risk of
  // clobbering anything the quote editor owns.
  const [logLead, setLogLead] = useState<Lead | null>(null)
  // Manual "Resend Acknowledgment (WhatsApp)" — added 2026-09-01 alongside
  // the Fast2SMS Meta-format migration, so an admin can re-send the
  // WhatsApp acknowledgment for a lead whose original automatic attempt
  // failed (e.g. an international number rejected by the old endpoint).
  // See app/api/admin/leads/[id]/resend-acknowledgment/route.ts for why
  // this can't just re-trigger the normal acknowledgment flow.
  const [resending, setResending] = useState(false)
  const resendAcknowledgment = async () => {
    if (!logLead || !adminKey || resending) return
    setResending(true)
    try {
      const res = await fetch(`/api/admin/leads/${logLead.id}/resend-acknowledgment`, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
      })
      const data = await res.json().catch(() => ({}))
      if (data.entry) {
        // Reflect the new log entry immediately, in both the open modal
        // and the underlying leads list, without a full refetch.
        setLogLead(prev => prev ? { ...prev, communication_log: [...(prev.communication_log ?? []), data.entry] } : prev)
        setLeads(prev => prev.map(l => l.id === logLead.id
          ? { ...l, communication_log: [...(l.communication_log ?? []), data.entry] }
          : l))
      }
      if (!res.ok || !data.success) {
        alert(`Resend failed: ${data.error ?? 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Resend failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setResending(false)
    }
  }
  const [showDeleted, setShowDeleted] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const handledOpenParam = useRef(false)
  const scrolledToId     = useRef<string | null>(null)

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
    if (sourceFilter !== 'all') qs += '&source=' + encodeURIComponent(sourceFilter)
    const res = await fetch('/api/admin/leads' + qs)
    if (res.ok) setLeads((await res.json()).leads ?? [])
    setLoading(false)
  }, [adminKey, filter, search, showDeleted, sourceFilter])

  useEffect(() => { if (authed) fetchLeads() }, [authed, fetchLeads])

  // ── Dashboard "Manage in Leads" direct-open ─────────────────────────
  // Fetches the exact target lead by booking_id/lead_id — a dedicated,
  // filter-free lookup (see the booking_id branch in
  // app/api/admin/leads/route.ts, and the existing per-id GET route) —
  // then forces every filter that could hide it back to "all" and sets
  // the search box to its unique lead_number. Since the leads list has no
  // pagination UI (always just the newest 50 matching the current
  // filter/search), searching by this lead's own lead_number is what
  // actually guarantees it appears in the fetched set regardless of how
  // old it is — resetting filter/source/showDeleted alone isn't enough
  // once a list is older than the newest 50.
  useEffect(() => {
    if (!authed || !adminKey) return
    if (handledOpenParam.current) return
    if (!openBookingId && !openLeadId) return
    handledOpenParam.current = true

    ;(async () => {
      try {
        const url = openLeadId
          ? `/api/admin/leads/${openLeadId}?key=${adminKey}`
          : `/api/admin/leads?booking_id=${openBookingId}&key=${adminKey}`
        const res = await fetch(url)
        if (!res.ok) return
        const j = await res.json()
        const lead: Lead | null = j.lead ?? (Array.isArray(j.leads) ? j.leads[0] : null)
        if (!lead) return

        setShowDeleted(!!lead.deleted_at)
        setFilter('all')
        setSourceFilter('all')
        setSearch(lead.lead_number ?? lead.phone ?? '')
        setHighlightId(lead.id)
      } finally {
        // Strip the open_* params so a refresh/back-nav doesn't redo this,
        // and so the admin can freely change filters afterward without
        // them snapping back. Doesn't touch any other query params.
        router.replace('/admin/leads')
      }
    })()
  }, [authed, adminKey, openBookingId, openLeadId, router])

  // Once the target lead's row is actually in the DOM (leads state
  // updated to include it), scroll it into view and let the highlight
  // fade after a few seconds. Guarded so it only scrolls once per
  // highlightId, even though `leads` can update multiple times.
  useEffect(() => {
    if (!highlightId) return
    if (scrolledToId.current === highlightId) return
    if (!leads.some(l => l.id === highlightId)) return
    scrolledToId.current = highlightId
    const t = setTimeout(() => {
      document.getElementById(`lead-row-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    const fade = setTimeout(() => setHighlightId(null), 4000)
    return () => { clearTimeout(t); clearTimeout(fade) }
  }, [leads, highlightId])

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

  // For DATE-ONLY columns (pickup_date etc.) as opposed to full timestamps
  // (created_at). Supabase returns these as plain "YYYY-MM-DD" strings,
  // which `new Date(...)` parses as UTC midnight — formatDate() above then
  // renders that in the viewing browser's own local timezone, silently
  // rolling the date back a day for any admin not on a timezone at/ahead of
  // UTC (2026-08-31 bug report: pickup date shown didn't match what the
  // customer actually selected). Pinning timeZone to 'UTC' fixes it.
  function formatDateOnly(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }

  // ── Print Leads List ────────────────────────────────────────────
  // Hands the *exact* rows currently on screen — same filter/search/sort/
  // follow-up-filter/showDeleted state as the visible table, not a fresh
  // server query — to a dedicated print view via sessionStorage, then opens
  // it in a new tab. No separate list/database is created; this is purely a
  // presentation snapshot of what the admin is already looking at. Opening
  // sessionStorage.setItem synchronously before window.open (rather than
  // after) keeps this inside the click's user-activation window so popup
  // blockers don't interfere.
  function openPrintView() {
    const rows = sortLeads(leads, sort).filter(l => matchesFollowupFilter(l, followupParam))
    const filterParts: string[] = []
    if (search.trim())        filterParts.push(`Search: "${search.trim()}"`)
    if (filter !== 'all')     filterParts.push(`Status: ${STATUS_CONFIG[filter]?.label ?? filter}`)
    if (sourceFilter !== 'all') filterParts.push(`Source: ${SOURCE_LABELS[sourceFilter] ?? sourceFilter}`)
    if (followupParam)        filterParts.push(`Follow-up: ${followupParam.replace(/_/g, ' ')}`)
    if (showDeleted)          filterParts.push('Deleted leads only')
    sessionStorage.setItem('bagdrop_leads_print_data', JSON.stringify({
      generatedAt: new Date().toISOString(),
      filterSummary: filterParts.join('  ·  '),
      rows,
    }))
    window.open('/admin/leads/print', '_blank')
  }

  // ── Send Quote via Email / WhatsApp — directly from the Leads table ──
  // Reuses the EXACT same endpoints/behavior as the "Send Quote Email →"
  // and "Send Quote via WhatsApp" buttons already on the full quote page
  // (app/(admin)/admin/quotes/view/[lead_id]/page.tsx's doSendQuote /
  // doSendQuoteWhatsApp) — same PATCH payload to
  // /api/admin/bookings/[id] (which server-side attaches the freshly
  // generated Quote PDF and sends via Resend — see send_quote_email in
  // app/api/admin/bookings/[id]/route.ts) and the same
  // /api/admin/leads/[id]/quote-pdf → WhatsApp Web compose-link flow. No
  // new quote/record is created and no status logic changes — this just
  // calls the existing side effects without navigating off the Leads page.
  const [sendingEmail, setSendingEmail]         = useState<string | null>(null)
  const [sendingWhatsApp, setSendingWhatsApp]   = useState<string | null>(null)
  const [justSent, setJustSent] = useState<{ id: string; channel: 'email' | 'whatsapp' } | null>(null)

  function flashSent(id: string, channel: 'email' | 'whatsapp') {
    setJustSent({ id, channel })
    setTimeout(() => setJustSent(prev => (prev?.id === id && prev.channel === channel ? null : prev)), 3000)
  }

  async function sendQuoteEmailFromTable(l: Lead) {
    if (!l.booking_id || !adminKey || sendingEmail) return
    setSendingEmail(l.id)
    try {
      const res = await fetch(`/api/admin/bookings/${l.booking_id}?key=${encodeURIComponent(adminKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'quote_sent', send_quote_email: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('Could not send quote email: ' + (err.error ?? 'Unknown error'))
        return
      }
      flashSent(l.id, 'email')
      fetchLeads()
    } catch (e) {
      alert('Could not send quote email: ' + (e instanceof Error ? e.message : 'Network error'))
    } finally {
      setSendingEmail(null)
    }
  }

  async function sendQuoteWhatsAppFromTable(l: Lead) {
    if (!l.booking_id || !adminKey || sendingWhatsApp) return
    setSendingWhatsApp(l.id)
    try {
      // Always regenerates fresh off the lead's CURRENT saved quote (same
      // route the full quote page uses) — never attaches a stale PDF.
      let pdfUrl: string
      try {
        const r = await fetch(`/api/admin/leads/${l.id}/quote-pdf?key=${encodeURIComponent(adminKey)}`, {
          method: 'POST',
          headers: { 'x-admin-key': adminKey },
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || !d.url) throw new Error(d.error ?? 'no url returned')
        pdfUrl = d.url
      } catch {
        alert('Unable to attach Quote PDF. Please try again.')
        return
      }

      const name  = formatCustomerName(l.title, l.name) || l.name || 'Customer'
      const qnum  = l.quote_number ?? l.zoho_estimate_number ?? ''
      const from  = l.from_city ?? ''
      const to    = l.to_city ?? ''
      const bags  = l.bags_count ?? 1
      const total = l.quote_total ?? 0
      const fmt   = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
      const phoneDigits = (l.phone ?? '').replace(/\D/g, '')
      const e164  = phoneDigits.startsWith('91') ? phoneDigits : '91' + phoneDigits
      const msg = [
        `Hi ${name}! 👋`,
        '',
        `Your Bagdrop quote is ready. Here's the summary:`,
        '',
        `👤 Customer Name: ${name}`,
        `📋 Quote No: ${qnum}`,
        `🗺️ Route: ${from} → ${to}`,
        `🧳 No. of Bags: ${bags}`,
        `💰 Total Amount: ${fmt(Number(total))}`,
        '',
        `📄 Download your quote PDF:`, pdfUrl, '',
        'To confirm your booking, simply reply to this message or call/WhatsApp us anytime.',
        '',
        '— Team Bagdrop',
      ].join('\n')

      // Mark as sent (same status bump doSendQuoteWhatsApp performs), then
      // open WhatsApp Web with the message pre-filled.
      const res = await fetch(`/api/admin/bookings/${l.booking_id}?key=${encodeURIComponent(adminKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'quote_sent' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('Quote PDF was generated, but the status update failed: ' + (err.error ?? 'Unknown error'))
      }
      window.open(`https://web.whatsapp.com/send?phone=${e164}&text=${encodeURIComponent(msg)}`, '_blank')
      flashSent(l.id, 'whatsapp')
      fetchLeads()
    } finally {
      setSendingWhatsApp(null)
    }
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

      {/* Communication Log viewer — see logLead state comment. Read-only:
          every email/WhatsApp send attempt for this lead (acknowledgment,
          quote-sent, etc.), including the exact failure reason for
          anything that didn't go out. */}
      {logLead && (
        <div onClick={() => setLogLead(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Communication Log</h3>
              <button onClick={() => setLogLead(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {logLead.lead_number ?? logLead.id.slice(0, 8)} — {logLead.name}
              </p>
              {logLead.phone && (
                <button
                  onClick={resendAcknowledgment}
                  disabled={resending}
                  title={`Resend the WhatsApp acknowledgment to ${logLead.phone}`}
                  className="shrink-0 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition-colors">
                  {resending ? 'Sending…' : 'Resend Acknowledgment'}
                </button>
              )}
            </div>

            {!logLead.communication_log || logLead.communication_log.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No communication logged yet for this lead.</p>
            ) : (
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {logLead.communication_log.map((entry, i) => {
                  const statusStyle =
                    entry.status === 'sent'    ? { color: '#16a34a', bg: '#f0fdf4', label: 'Sent' } :
                    entry.status === 'failed'  ? { color: '#dc2626', bg: '#fef2f2', label: 'Failed' } :
                                                  { color: '#6b7280', bg: '#f9fafb', label: 'Skipped' }
                  const channelLabel = entry.channel === 'whatsapp' ? 'WhatsApp' : entry.channel === 'email' ? 'Email' : entry.channel
                  return (
                    <div key={i} className="flex flex-col gap-1 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-gray-700 whitespace-nowrap">
                            {entry.type ? `${entry.type} — ` : ''}{channelLabel}
                          </span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-500 truncate">
                            {new Date(entry.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <span style={{ color: statusStyle.color, background: statusStyle.bg }}
                          className="shrink-0 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">
                          {statusStyle.label}
                        </span>
                      </div>
                      {entry.detail && (
                        <p className={entry.status === 'failed' ? 'text-red-500 break-words' : 'text-gray-400 break-words'}>
                          {entry.detail}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
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

      <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6">
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
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
          <button onClick={openPrintView} disabled={leads.length === 0}
            title="Print the current Leads list (respects filters/search/sort above)"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-40">
            <Printer className="h-3.5 w-3.5" /> Print
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

        {/* Sales Follow-up filter banner — set via Dashboard "Sales
            Follow-up" cards (?followup=...). Purely a client-side filter,
            see matchesFollowupFilter() above. */}
        {followupParam && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-700">
            <span>Showing leads filtered by Sales Follow-up: <strong>{followupParam.replace(/_/g, ' ')}</strong></span>
            <Link href="/admin/leads" className="font-semibold text-purple-600 hover:text-purple-800">Clear filter ✕</Link>
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
                    {['Quote #', 'Customer', 'Service', 'Route', 'Pickup Date', 'Bags', 'Source', 'Status', 'Quote Amount', 'Booking / Estimate', 'Date', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortLeads(leads, sort).filter(l => matchesFollowupFilter(l, followupParam)).map(l => (
                    <tr key={l.id} id={`lead-row-${l.id}`} className={`transition-colors duration-700 ${
                      highlightId === l.id ? 'bg-orange-50 ring-2 ring-inset ring-orange-400' : 'hover:bg-gray-50'
                    }`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-gray-500">{l.lead_number ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{formatCustomerName(l.title, l.name) || l.name}</p>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Phone className="h-3 w-3" />{l.phone}
                        </div>
                        {/* Small standalone "Confirmed" tag under the name.
                            2026-08-25 fix — this used to test
                            "BOOKING_STATUS_CONFIG[effective_status] exists"
                            as a proxy for "reached Confirmed-or-later", which
                            broke the moment effective_status started ALSO
                            surfacing early statuses like quote_created/
                            quote_sent for any quoted lead (same-day fix,
                            see app/api/admin/leads/route.ts) — since
                            BOOKING_STATUS_CONFIG has an entry for every
                            pipeline status, not just Confirmed+, this tag
                            started showing for every quoted lead regardless
                            of payment (founder-reported: "all inquiries are
                            showing the Confirmed badge, even when payment
                            has not been completed"). Now reads the explicit
                            is_confirmed flag from that same route instead —
                            true only from Payment Received/Approved onward,
                            exactly matching the Dashboard's "Total Confirmed
                            Bookings" definition, never for quote_created/
                            quote_sent/accepted/payment_pending/partially
                            paid. */}
                        {l.is_confirmed ? (
                          <p className="mt-0.5 text-[11px] font-semibold" style={{ color: '#ff6300' }}>Confirmed</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {l.service_interest ?? l.service_type ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {l.from_city && l.to_city ? `${l.from_city} → ${l.to_city}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDateOnly(l.pickup_date)}</td>
                      <td className="px-4 py-3 text-center text-sm font-medium text-gray-700">{l.bags_count ?? '—'}</td>
                      <td className="px-4 py-3">
                        {l.source ? (
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            l.source === 'skybird' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {SOURCE_LABELS[l.source] ?? l.source}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                        {l.partner_name && (
                          <div className="mt-1 text-[11px] text-gray-400">{l.partner_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const displayStatus = l.effective_status ?? l.status
                          // effective_status is a real bookings.status value
                          // (e.g. 'invoice_sent') once a lead is Confirmed —
                          // check that table first, falling back to the
                          // lead-funnel STATUS_CONFIG for everything else.
                          const cfg = BOOKING_STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG[displayStatus]
                            ?? { label: displayStatus, color: '#6b7280', bg: '#f3f4f6' }
                          return (
                            <span style={{ color: cfg.color, background: cfg.bg }}
                              className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold">
                              {cfg.label}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        {l.quote_total != null ? '₹' + Math.round(Number(l.quote_total)).toLocaleString('en-IN') : <span className="text-gray-400 font-normal">—</span>}
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

                              {/* Return Quote button intentionally REMOVED from this
                                  table (2026-08-31, founder request: "remove return
                                  quote from lead tab... keep return quote only inside
                                  of quote"). The capability itself is untouched —
                                  still fully reachable from inside the quote itself
                                  (app/(admin)/admin/quotes/view/[lead_id]/page.tsx's
                                  "Add Return Quote" CTA card, shown once a lead has a
                                  primary quote and no return quote yet), just no
                                  longer duplicated as a second entry point here. Click
                                  the quote number above (e.g. QT-2026-0137) to reach
                                  it. l.return_quote_number itself is still read
                                  elsewhere (effective_status, etc.) — only this row's
                                  button was removed. */}
                              {/* Pending/Received payment toggle removed from this
                                  table per request — payment status is now only
                                  managed through the Booking Workflow / payment
                                  verification flow, not as an inline Leads action.
                                  l.payment_status itself is untouched. */}

                              {/* Follow Up — same manual WhatsApp/email nudge as the
                                  Booking Workflow page (see FollowUpPanel), shown once
                                  this lead actually has a quote and hasn't reached
                                  Confirmed yet. The Leads table has no per-row
                                  visibility into the linked booking's exact
                                  quote_created vs quote_sent status (that map is only
                                  built server-side for Confirmed-or-later bookings —
                                  see app/api/admin/leads/route.ts's
                                  bookingStatusMap), so "has a quote, not yet
                                  Confirmed" is the closest equivalent available here.
                                  Requires booking_id since customer_follow_ups.
                                  booking_id is NOT NULL. */}
                              {!showDeleted && l.booking_id &&
                                !BOOKING_STATUS_CONFIG[l.effective_status ?? l.status] && (
                                <FollowUpPanel
                                  compact
                                  adminKey={adminKey}
                                  target={{
                                    bookingId: l.booking_id,
                                    refLabel: l.lead_number ?? l.zoho_estimate_number,
                                    title: l.title,
                                    name: l.name,
                                    phone: l.phone || null,
                                    email: l.email || null,
                                    pickupLocation: l.pickup_address || l.from_city,
                                    deliveryLocation: l.drop_address || l.to_city,
                                  }}
                                />
                              )}
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
                                title="Edit"
                                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600 transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {/* Send Quote via Email / WhatsApp — only once a quote actually
                                  exists for this lead (zoho_estimate_number set) and it has a
                                  linked booking (both endpoints below key off booking_id). Sends
                                  the existing, already-generated quote — no new quote/record is
                                  created. See sendQuoteEmailFromTable/sendQuoteWhatsAppFromTable
                                  above for the exact reused endpoints. */}
                              {l.zoho_estimate_number && l.booking_id && (
                                <>
                                  <button
                                    onClick={() => sendQuoteEmailFromTable(l)}
                                    disabled={sendingEmail === l.id}
                                    title="Send Quote via Email"
                                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors disabled:opacity-40">
                                    {sendingEmail === l.id
                                      ? <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                                      : justSent?.id === l.id && justSent.channel === 'email'
                                        ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                        : <Mail className="h-3.5 w-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => sendQuoteWhatsAppFromTable(l)}
                                    disabled={sendingWhatsApp === l.id}
                                    title="Send Quote via WhatsApp"
                                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-green-600 transition-colors disabled:opacity-40">
                                    {sendingWhatsApp === l.id
                                      ? <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
                                      : justSent?.id === l.id && justSent.channel === 'whatsapp'
                                        ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                        : <MessageCircle className="h-3.5 w-3.5" />}
                                  </button>
                                </>
                              )}
                              {/* Communication Log — see logLead state comment above.
                                  Read-only: shows every acknowledgment/notification send
                                  attempt (email + WhatsApp) for this lead, with the exact
                                  error text for anything that failed. */}
                              <button onClick={() => setLogLead(l)}
                                title="Communication Log"
                                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors">
                                <History className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setDeleteConfirm(l)} disabled={deleting === l.id}
                                title="Delete"
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

// ── Suspense wrapper (required by Next.js 15 for useSearchParams) ───────
export default function LeadsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    }>
      <LeadsPageInner />
    </Suspense>
  )
}
