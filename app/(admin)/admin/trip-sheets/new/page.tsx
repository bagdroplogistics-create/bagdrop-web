'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Search, Loader2, Truck, User, Phone, MapPin,
  Package, Calendar, CheckCircle, IndianRupee, ChevronRight,
  AlertCircle, Plus, X, Trash2, Layers, Pencil, ReceiptText,
  TrendingUp, Activity, ChevronDown,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TripEntry {
  booking_id:    string
  ref_number:    string
  customer_name: string
  customer_phone:string
  customer_email:string | null
  from_city:     string | null
  to_city:       string | null
  pickup_date:   string | null
  delivery_date: string | null
  pickup_address:string | null
  drop_address:  string | null
  total_bags:    number | null
  total_amount:  number | null
  service_label: string | null
  status:        string
  source:        'booking' | 'lead'
  created_at?:   string
}

interface LocalExpense {
  _id:           string   // temp uuid
  expense_type:  string
  mode:          string
  from_location: string
  to_location:   string
  vendor:        string
  description:   string
  estimated_cost:string
  actual_cost:   string
  payment_status:string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_STATUSES = ['pending', 'paid', 'reimbursed']

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  confirmed:    { label: 'Confirmed',    cls: 'bg-green-100  text-green-700'  },
  completed:    { label: 'Completed',    cls: 'bg-gray-100   text-gray-700'   },
  converted:    { label: 'Converted',    cls: 'bg-blue-100   text-blue-700'   },
  delivered:    { label: 'Delivered',    cls: 'bg-teal-100   text-teal-700'   },
  invoice_sent: { label: 'Invoice Sent', cls: 'bg-purple-100 text-purple-700' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _uid = 0
const uid = () => String(++_uid)

function fmtDate(d: string | null) {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}
function fmtRs(n: number | null | undefined) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

const inp = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200'
const lbl = 'mb-1 block text-xs font-semibold text-gray-500'

function FInput({ label, value, onChange, type = 'text', placeholder = '', readOnly = false }: {
  label: string; value: string; onChange?: (v: string) => void; type?: string; placeholder?: string; readOnly?: boolean
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} value={value} readOnly={readOnly} placeholder={placeholder}
        onChange={e => onChange?.(e.target.value)}
        className={inp + (readOnly ? ' bg-gray-50 text-gray-500 cursor-default' : '')} />
    </div>
  )
}

function FSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className={inp + ' appearance-none pr-8'}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
    </div>
  )
}

function Row({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 text-xs font-semibold text-gray-400">{label}</span>
      <span className="text-right text-sm font-medium text-gray-800 break-words max-w-[60%]">{val || '—'}</span>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewTripSheetPage() {
  const router = useRouter()

  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [entries,  setEntries]  = useState<TripEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<TripEntry | null>(null)
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState('')
  const [tab,      setTab]      = useState<'overview' | 'operations' | 'expenses' | 'pnl' | 'activity'>('overview')

  // Status fields
  const [mode,              setMode]             = useState('')
  const [paymentStatus,     setPaymentStatus]    = useState('RECEIVED')
  const [undertakingStatus, setUndertaking]      = useState('RECEIVED')

  // Operational fields
  const [vendor,            setVendor]           = useState('')
  const [driverName,        setDriverName]       = useState('')
  const [vehicleNumber,     setVehicleNumber]    = useState('')
  const [consignmentNumber, setConsignment]      = useState('')
  const [luggageCode,       setLuggageCode]      = useState('')
  const [cloakRoomNumber,   setCloakRoom]        = useState('')
  const [pickupPerson,      setPickupPerson]     = useState('')
  const [pickupContact,     setPickupContact]    = useState('')
  const [deliveryPerson,    setDeliveryPerson]   = useState('')
  const [deliveryContact,   setDeliveryContact]  = useState('')
  const [additionalCharges, setAdditional]       = useState('0')
  const [discount,          setDiscount]         = useState('0')
  const [taxAmount,         setTaxAmount]        = useState('0')
  const [notes,             setNotes]            = useState('')
  const [remarks,           setRemarks]          = useState('')

  // Local expenses (added before creation, posted after)
  const [expenses, setExpenses] = useState<LocalExpense[]>([])
  const [showExpForm, setShowExpForm] = useState(false)
  const [expForm, setExpForm] = useState<LocalExpense>({
    _id: uid(), expense_type: '', mode: '', from_location: '', to_location: '',
    vendor: '', description: '', estimated_cost: '', actual_cost: '', payment_status: 'pending',
  })

  // ── Auth ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  // ── Fetch entries ─────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch(`/api/admin/bookings?key=${adminKey}&status=confirmed&limit=200`),
        fetch(`/api/admin/bookings?key=${adminKey}&status=completed&limit=200`),
        fetch(`/api/admin/bookings?key=${adminKey}&status=delivered&limit=200`),
        fetch(`/api/admin/bookings?key=${adminKey}&status=invoice_sent&limit=200`),
        fetch(`/api/admin/leads?key=${adminKey}&status=converted&limit=200`),
      ])
      const [d1, d2, d3, d4, d5] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json(), r5.json()])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fromBookings = (arr: any[], status: string): TripEntry[] =>
        (Array.isArray(arr) ? arr : []).map(b => ({
          booking_id: b.id, ref_number: b.tracking_id,
          customer_name: b.customer_name, customer_phone: b.customer_phone,
          customer_email: b.customer_email ?? null,
          from_city: b.from_city ?? null, to_city: b.to_city ?? null,
          pickup_date: b.pickup_date ?? null, delivery_date: b.delivery_date ?? null,
          pickup_address: b.pickup_address ?? null, drop_address: b.drop_address ?? null,
          total_bags: b.total_bags ?? null, total_amount: b.total_amount ?? null,
          service_label: b.service_label ?? b.service_type ?? null,
          status, source: 'booking' as const, created_at: b.created_at,
        }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fromLeads: TripEntry[] = (Array.isArray(d5.leads) ? d5.leads : []).filter((l: any) => !!l.booking_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((l: any) => ({
          booking_id: l.booking_id, ref_number: l.lead_number,
          customer_name: l.name, customer_phone: l.phone,
          customer_email: l.email ?? null,
          from_city: l.from_city ?? null, to_city: l.to_city ?? null,
          pickup_date: l.pickup_date ?? null, delivery_date: l.delivery_date ?? null,
          pickup_address: l.pickup_address ?? null, drop_address: l.drop_address ?? null,
          total_bags: l.bags_count ?? null, total_amount: null,
          service_label: l.service_type ?? null,
          status: 'converted', source: 'lead' as const, created_at: l.created_at,
        }))

      const all: TripEntry[] = [
        ...fromBookings(d1.bookings, 'confirmed'),
        ...fromBookings(d2.bookings, 'completed'),
        ...fromBookings(d3.bookings, 'delivered'),
        ...fromBookings(d4.bookings, 'invoice_sent'),
        ...fromLeads,
      ]
      const seen = new Set<string>()
      const deduped = all.filter(e => { if (seen.has(e.booking_id)) return false; seen.add(e.booking_id); return true })
      deduped.sort((a, b) => ((b.pickup_date ?? b.created_at ?? '') > (a.pickup_date ?? a.created_at ?? '') ? 1 : -1))
      setEntries(deduped)
    } catch { setError('Failed to load bookings') }
    setLoading(false)
  }, [adminKey])

  useEffect(() => { if (authed) fetchAll() }, [authed, fetchAll])

  const filtered = entries.filter(e => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return e.ref_number.toLowerCase().includes(q) || e.customer_name.toLowerCase().includes(q) ||
      e.customer_phone.includes(q) || (e.from_city ?? '').toLowerCase().includes(q) || (e.to_city ?? '').toLowerCase().includes(q)
  })

  // ── Expense helpers ───────────────────────────────────────────────────────

  function addExpenseRow() {
    if (!expForm.expense_type.trim()) return
    setExpenses(prev => [...prev, { ...expForm }])
    setExpForm({ _id: uid(), expense_type: '', mode: '', from_location: '', to_location: '', vendor: '', description: '', estimated_cost: '', actual_cost: '', payment_status: 'pending' })
    setShowExpForm(false)
  }

  function removeExpense(id: string) { setExpenses(prev => prev.filter(e => e._id !== id)) }

  const expEstTotal = expenses.reduce((s, e) => s + (Number(e.estimated_cost) || 0), 0)
  const expActTotal = expenses.reduce((s, e) => s + (Number(e.actual_cost)    || 0), 0)

  // ── Create ────────────────────────────────────────────────────────────────

  async function create() {
    if (!selected) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/admin/trip-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          booking_id:         selected.booking_id,
          mode:               mode              || null,
          payment_status:     paymentStatus,
          undertaking_status: undertakingStatus,
          vendor:             vendor            || null,
          driver_name:        driverName        || null,
          vehicle_number:     vehicleNumber     || null,
          consignment_number: consignmentNumber || null,
          luggage_code:       luggageCode       || null,
          cloak_room_number:  cloakRoomNumber   || null,
          pickup_person:      pickupPerson      || null,
          pickup_contact:     pickupContact     || null,
          delivery_person:    deliveryPerson    || null,
          delivery_contact:   deliveryContact   || null,
          additional_charges: Number(additionalCharges) || 0,
          discount:           Number(discount)          || 0,
          tax_amount:         Number(taxAmount)         || 0,
          notes:              notes   || null,
          remarks:            remarks || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to create trip sheet'); setCreating(false); return }
      const sheetId = d.trip_sheet.id

      // Post any local expenses
      if (expenses.length > 0) {
        await Promise.allSettled(expenses.map(e =>
          fetch(`/api/admin/trip-sheets/${sheetId}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
            body: JSON.stringify({
              expense_type:   e.expense_type   || 'Miscellaneous',
              mode:           e.mode           || null,
              from_location:  e.from_location  || null,
              to_location:    e.to_location    || null,
              vendor:         e.vendor         || null,
              description:    e.description    || null,
              estimated_cost: Number(e.estimated_cost) || 0,
              actual_cost:    Number(e.actual_cost)    || 0,
              payment_status: e.payment_status,
            }),
          })
        ))
      }

      router.push(`/admin/trip-sheets/${sheetId}`)
    } catch { setError('Network error — please try again'); setCreating(false) }
  }

  if (!authed) return null

  const TABS = [
    { key: 'overview',   label: 'Overview',     icon: <Layers      className="h-3.5 w-3.5" /> },
    { key: 'operations', label: 'Operations',   icon: <Truck       className="h-3.5 w-3.5" /> },
    { key: 'expenses',   label: 'Expenses',     icon: <ReceiptText className="h-3.5 w-3.5" /> },
    { key: 'pnl',        label: 'P&L Summary',  icon: <TrendingUp  className="h-3.5 w-3.5" /> },
    { key: 'activity',   label: 'Activity Log', icon: <Activity    className="h-3.5 w-3.5" /> },
  ] as const

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Topbar */}
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/admin/trip-sheets" className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> Trip Sheets
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
          <span className="font-semibold text-gray-800">New Trip Sheet</span>
        </div>
        {selected && (
          <button onClick={create} disabled={creating}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><Truck className="h-4 w-4" /> Create Trip Sheet</>}
          </button>
        )}
      </div>

      <div className="flex h-[calc(100vh-57px)] overflow-hidden">

        {/* ── LEFT: Booking selector ── */}
        <div className="flex w-[380px] shrink-0 flex-col border-r border-gray-200 bg-gray-50">
          <div className="border-b border-gray-200 bg-white p-4">
            <p className="mb-3 text-sm font-bold text-gray-800">
              Select Booking / Lead
              <span className="ml-2 text-xs font-normal text-gray-400">confirmed · invoice sent · delivered · completed · converted</span>
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search by name, ID, city…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200" />
            </div>
            {!loading && <p className="mt-2 text-xs text-gray-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Package className="mx-auto h-10 w-10 text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">{search ? 'No records match' : 'No records found'}</p>
              </div>
            ) : filtered.map((e, i) => {
              const isSelected = selected?.booking_id === e.booking_id
              const badge = STATUS_BADGE[e.status] ?? { label: e.status, cls: 'bg-gray-100 text-gray-600' }
              return (
                <button key={e.booking_id + i} onClick={() => setSelected(e)}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${
                    isSelected ? 'border-orange-400 bg-orange-50 shadow-sm ring-1 ring-orange-300' : 'border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/50'
                  }`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-orange-600">{e.ref_number}</span>
                      {e.source === 'lead' && <span className="rounded px-1 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-600 uppercase">Lead</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                      {isSelected && <CheckCircle className="h-3.5 w-3.5 text-orange-500" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <User className="h-3 w-3 text-gray-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800">{e.customer_name}</span>
                    <span className="text-xs text-gray-400">{e.customer_phone}</span>
                  </div>
                  {(e.from_city || e.to_city) && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-600 font-medium">{e.from_city ?? '—'} → {e.to_city ?? '—'}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {e.pickup_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(e.pickup_date)}</span>}
                    {e.total_bags != null && <span className="flex items-center gap-1"><Package className="h-3 w-3" />{e.total_bags} bag{e.total_bags !== 1 ? 's' : ''}</span>}
                    {e.total_amount != null && <span className="flex items-center gap-1 font-semibold text-green-700"><IndianRupee className="h-3 w-3" />{fmtRs(e.total_amount)}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── RIGHT: Form ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 mb-4">
                <Truck className="h-8 w-8 text-orange-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-700">Select a Booking or Lead</h2>
              <p className="mt-1 text-sm text-gray-400 max-w-xs">Choose from the left panel to fill in trip sheet details.</p>
            </div>
          ) : (
            <div className="p-6">

              {/* Summary strip */}
              <div className="mb-5 grid grid-cols-4 gap-3">
                {[
                  { label: 'Customer',   value: selected.customer_name,          icon: <User className="h-4 w-4" />,      color: '#f97316', bg: '#fff7ed' },
                  { label: 'Route',      value: `${selected.from_city ?? '—'} → ${selected.to_city ?? '—'}`, icon: <MapPin className="h-4 w-4" />, color: '#2563eb', bg: '#eff6ff' },
                  { label: 'Pickup',     value: fmtDate(selected.pickup_date),   icon: <Calendar className="h-4 w-4" />, color: '#7c3aed', bg: '#f5f3ff' },
                  { label: 'Amount',     value: fmtRs(selected.total_amount),    icon: <IndianRupee className="h-4 w-4" />, color: '#16a34a', bg: '#f0fdf4' },
                ].map(c => (
                  <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ color: c.color, background: c.bg }} className="flex h-6 w-6 items-center justify-center rounded-lg">{c.icon}</span>
                      <span className="text-xs font-semibold text-gray-400">{c.label}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 truncate">{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="mb-4 flex gap-1 rounded-xl bg-gray-200/60 p-1">
                {TABS.map(t => (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <button key={t.key} onClick={() => setTab(t.key as any)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                      tab === t.key ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {t.icon}{t.label}
                    {t.key === 'expenses' && expenses.length > 0 && (
                      <span className="ml-0.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">{expenses.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── TAB: Overview ── */}
              {tab === 'overview' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Customer Details */}
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700">
                      <User className="h-4 w-4 text-orange-400" /> Customer Details
                    </h3>
                    <div className="space-y-3 text-sm">
                      <Row label="Name"    val={selected.customer_name} />
                      <Row label="Phone"   val={selected.customer_phone} />
                      <Row label="Email"   val={selected.customer_email ?? '—'} />
                      <Row label="Service" val={selected.service_label  ?? '—'} />
                      <Row label="Bags"    val={selected.total_bags != null ? String(selected.total_bags) : '—'} />
                    </div>
                  </div>

                  {/* Route */}
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700">
                      <MapPin className="h-4 w-4 text-orange-400" /> Route
                    </h3>
                    <div className="space-y-3 text-sm">
                      <Row label="From"           val={selected.from_city      ?? '—'} />
                      <Row label="To"             val={selected.to_city        ?? '—'} />
                      <Row label="Pickup Date"    val={fmtDate(selected.pickup_date)} />
                      <Row label="Delivery Date"  val={fmtDate(selected.delivery_date)} />
                      <Row label="Pickup Address" val={selected.pickup_address ?? '—'} />
                      <Row label="Drop Address"   val={selected.drop_address   ?? '—'} />
                    </div>
                  </div>

                  {/* Quick-fill prompt */}
                  <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50 px-5 py-3 text-xs text-blue-700 flex items-center gap-2">
                    <Pencil className="h-3.5 w-3.5 shrink-0" />
                    Customer and route details are auto-filled from the selected booking. Switch to <strong>Operations</strong>, <strong>Expenses</strong>, and <strong>Status</strong> tabs to add operational details.
                  </div>
                </div>
              )}

              {/* ── TAB: Operations ── */}
              {tab === 'operations' && (
                <div className="space-y-4">

                  {/* Trip Status & Mode — at top of Operations */}
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
                    <p className="mb-4 text-xs font-bold uppercase tracking-widest text-blue-500">Trip Status &amp; Mode</p>
                    <div className="grid gap-4 sm:grid-cols-4">
                      {/* Trip Status — always "Created" on new sheet, shown as read-only */}
                      <div>
                        <label className={lbl}>Trip Status</label>
                        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                          <span className="text-sm font-semibold text-gray-600">Created (auto)</span>
                        </div>
                      </div>
                      <FSelect label="Mode" value={mode} onChange={setMode}
                        options={[
                          { value: '',        label: 'Select mode' },
                          { value: 'BY ROAD', label: 'BY ROAD' },
                          { value: 'BY AIR',  label: 'BY AIR' },
                          { value: 'BY RAIL', label: 'BY RAIL' },
                          { value: 'COURIER', label: 'COURIER' },
                        ]} />
                      <FSelect label="Payment Status" value={paymentStatus} onChange={setPaymentStatus}
                        options={[
                          { value: 'RECEIVED', label: 'RECEIVED' },
                          { value: 'PENDING',  label: 'PENDING' },
                          { value: 'PARTIAL',  label: 'PARTIAL' },
                          { value: 'REFUNDED', label: 'REFUNDED' },
                        ]} />
                      <FSelect label="Undertaking Status" value={undertakingStatus} onChange={setUndertaking}
                        options={[
                          { value: 'RECEIVED',     label: 'RECEIVED' },
                          { value: 'PENDING',      label: 'PENDING' },
                          { value: 'NOT REQUIRED', label: 'NOT REQUIRED' },
                        ]} />
                    </div>
                  </div>

                  {/* Vendor & Driver */}
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Vendor &amp; Driver</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FInput label="Vendor / Transport Co." value={vendor}          onChange={setVendor}        placeholder="e.g. Quick Couriers" />
                      <FInput label="Driver Name"             value={driverName}      onChange={setDriverName}     placeholder="e.g. Ramesh Patel" />
                      <FInput label="Vehicle Number"          value={vehicleNumber}   onChange={setVehicleNumber}  placeholder="e.g. GJ-06-AB-1234" />
                      <FInput label="Consignment / Docket No." value={consignmentNumber} onChange={setConsignment} placeholder="e.g. CON-20260706" />
                      <FInput label="Luggage Code"            value={luggageCode}     onChange={setLuggageCode}    placeholder="Optional code" />
                      <FInput label="Cloak Room No."         value={cloakRoomNumber}  onChange={setCloakRoom}      placeholder="Optional" />
                    </div>
                  </div>

                  {/* Field Contacts */}
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Field Contacts</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FInput label="Pickup Person"    value={pickupPerson}  onChange={setPickupPerson}  placeholder="Name at pickup" />
                      <div>
                        <label className={lbl}>Pickup Contact</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                          <input type="tel" value={pickupContact} onChange={e => setPickupContact(e.target.value)}
                            placeholder="Mobile number" className={inp + ' pl-9'} />
                        </div>
                      </div>
                      <FInput label="Delivery Person"  value={deliveryPerson} onChange={setDeliveryPerson} placeholder="Name at delivery" />
                      <div>
                        <label className={lbl}>Delivery Contact</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                          <input type="tel" value={deliveryContact} onChange={e => setDeliveryContact(e.target.value)}
                            placeholder="Mobile number" className={inp + ' pl-9'} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Financials */}
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Income Adjustments</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <FInput label="Additional Charges (₹)" value={additionalCharges} onChange={setAdditional} type="number" placeholder="0" />
                      <FInput label="Discount (₹)"           value={discount}          onChange={setDiscount}    type="number" placeholder="0" />
                      <FInput label="Tax Amount (₹)"         value={taxAmount}         onChange={setTaxAmount}   type="number" placeholder="0" />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Notes &amp; Remarks</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={lbl}>Internal Notes</label>
                        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                          placeholder="Special instructions, fragile items…" className={inp + ' resize-none'} />
                      </div>
                      <div>
                        <label className={lbl}>Remarks</label>
                        <textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)}
                          placeholder="Internal remarks…" className={inp + ' resize-none'} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: Expenses ── */}
              {tab === 'expenses' && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-700">Trip Expenses</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {expenses.length > 0 ? `${expenses.length} row${expenses.length !== 1 ? 's' : ''} · Rate: ${fmtRs(expEstTotal)} · Actual: ${fmtRs(expActTotal)}` : 'Add expenses to be saved with the trip sheet'}
                      </p>
                    </div>
                    <button onClick={() => setShowExpForm(v => !v)}
                      className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
                      {showExpForm ? <><X className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> Add Expense</>}
                    </button>
                  </div>

                  {/* Add expense form */}
                  {showExpForm && (
                    <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-5">
                      <h4 className="mb-4 text-sm font-bold text-orange-700">New Expense Row</h4>
                      <div className="grid gap-3 sm:grid-cols-5">
                        <div className="sm:col-span-2">
                          <FInput label="Mode / Expense Type" value={expForm.expense_type}
                            onChange={v => setExpForm(f => ({ ...f, expense_type: v }))}
                            placeholder="e.g. Taxi, Porter, Toll…" />
                        </div>
                        <FInput label="From" value={expForm.from_location}
                          onChange={v => setExpForm(f => ({ ...f, from_location: v }))} placeholder="Origin" />
                        <FInput label="To" value={expForm.to_location}
                          onChange={v => setExpForm(f => ({ ...f, to_location: v }))} placeholder="Destination" />
                        <FInput label="Rate / Cost (₹)" value={expForm.estimated_cost}
                          onChange={v => setExpForm(f => ({ ...f, estimated_cost: v }))} type="number" placeholder="0" />
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-5">
                        <FInput label="Actual Cost (₹)" value={expForm.actual_cost}
                          onChange={v => setExpForm(f => ({ ...f, actual_cost: v }))} type="number" placeholder="0" />
                        <FInput label="Vendor / Agent" value={expForm.vendor}
                          onChange={v => setExpForm(f => ({ ...f, vendor: v }))} placeholder="Vendor name" />
                        <FInput label="Notes" value={expForm.description}
                          onChange={v => setExpForm(f => ({ ...f, description: v }))} placeholder="Optional" />
                        <FSelect label="Payment Status" value={expForm.payment_status}
                          onChange={v => setExpForm(f => ({ ...f, payment_status: v }))}
                          options={PAYMENT_STATUSES.map(s => ({ value: s, label: s }))} />
                        <div className="flex items-end">
                          <button onClick={addExpenseRow} disabled={!expForm.expense_type.trim()}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40 transition-colors">
                            <Plus className="h-4 w-4" /> Add Row
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expense table */}
                  {expenses.length === 0 ? (
                    <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
                      <ReceiptText className="mx-auto h-10 w-10 text-gray-200 mb-3" />
                      <p className="text-sm text-gray-400">No expenses added yet</p>
                      <p className="text-xs text-gray-300 mt-1">Expenses will be saved when you create the trip sheet</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Mode / Type</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">From</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">To</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Rate</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actual</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                            <th className="px-2 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {expenses.map((e, i) => (
                            <tr key={e._id} className={`hover:bg-orange-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                              <td className="px-4 py-3">
                                <p className="text-sm font-medium text-gray-800">{e.expense_type}</p>
                                {(e.vendor || e.description) && <p className="text-xs text-gray-400 mt-0.5">{[e.vendor, e.description].filter(Boolean).join(' · ')}</p>}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">{e.from_location || <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{e.to_location   || <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-3 text-right text-sm font-medium text-gray-600">{e.estimated_cost ? fmtRs(Number(e.estimated_cost)) : '—'}</td>
                              <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{e.actual_cost ? fmtRs(Number(e.actual_cost)) : '—'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  e.payment_status === 'paid' ? 'bg-green-50 text-green-700' :
                                  e.payment_status === 'reimbursed' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                                }`}>{e.payment_status}</span>
                              </td>
                              <td className="px-2 py-3">
                                <button onClick={() => removeExpense(e._id)}
                                  className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">Total</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-gray-700">{fmtRs(expEstTotal)}</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{fmtRs(expActTotal)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: P&L Summary ── */}
              {tab === 'pnl' && (() => {
                const quoteAmt = selected?.total_amount ?? 0
                const addl     = Number(additionalCharges) || 0
                const disc     = Number(discount)          || 0
                const tax      = Number(taxAmount)         || 0
                const totalIncome  = quoteAmt + addl - disc + tax
                const totalExpense = expActTotal

                function PLRow({ label, value, bold = false, color = 'text-gray-700' }: { label: string; value: string; bold?: boolean; color?: string }) {
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{label}</span>
                      <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'} ${color}`}>{value}</span>
                    </div>
                  )
                }
                return (
                  <div className="space-y-4">
                    {/* Income Breakdown */}
                    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                      <h3 className="mb-5 text-sm font-bold text-gray-700">Income Breakdown</h3>
                      <div className="space-y-3">
                        <PLRow label="Quote Amount"       value={`₹${(quoteAmt).toLocaleString('en-IN')}`} />
                        <PLRow label="Additional Charges" value={`+ ₹${addl.toLocaleString('en-IN')}`} color="text-green-600" />
                        <PLRow label="Discount"           value={`- ₹${disc.toLocaleString('en-IN')}`} color="text-red-500" />
                        <PLRow label="Tax"                value={`+ ₹${tax.toLocaleString('en-IN')}`}  color="text-blue-600" />
                        <div className="border-t border-gray-100 pt-3">
                          <PLRow label="Total Income" value={`₹${totalIncome.toLocaleString('en-IN')}`} bold />
                        </div>
                      </div>
                    </div>

                    {/* Expense Summary */}
                    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                      <h3 className="mb-5 text-sm font-bold text-gray-700">Expense Summary</h3>
                      {expenses.length === 0 ? (
                        <p className="text-sm text-gray-400">No expenses recorded.</p>
                      ) : (
                        <div className="space-y-2">
                          {expenses.map(e => (
                            <PLRow key={e._id}
                              label={`${e.expense_type}${e.from_location ? ` (${e.from_location}${e.to_location ? ' → ' + e.to_location : ''})` : ''}`}
                              value={`- ₹${(Number(e.actual_cost) || Number(e.estimated_cost) || 0).toLocaleString('en-IN')}`}
                              color="text-red-500" />
                          ))}
                          <div className="border-t border-gray-100 pt-3">
                            <PLRow label="Total Expense" value={`₹${totalExpense.toLocaleString('en-IN')}`} bold color="text-red-600" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Net Profit */}
                    {(() => {
                      const net = totalIncome - totalExpense
                      return (
                        <div className={`rounded-2xl border p-6 shadow-sm ${net >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Net Profit</p>
                              <p className={`mt-1 text-3xl font-black ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {net >= 0 ? '+' : ''}₹{net.toLocaleString('en-IN')}
                              </p>
                            </div>
                            {totalIncome > 0 && (
                              <div className="text-right">
                                <p className="text-xs text-gray-400">Margin</p>
                                <p className={`text-xl font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {((net / totalIncome) * 100).toFixed(1)}%
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}

                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-700">
                      P&amp;L figures update in real time from Income Adjustments (Operations tab) and Expenses added above. Final P&amp;L is confirmed after saving the trip sheet.
                    </div>
                  </div>
                )
              })()}

              {/* ── TAB: Activity Log ── */}
              {tab === 'activity' && (
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h3 className="mb-5 text-sm font-bold text-gray-700">Activity Log</h3>
                  <ol className="relative border-l border-gray-100 ml-4">
                    <li className="mb-4 ml-5">
                      <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-400" />
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-blue-600">Trip Created</p>
                          <p className="mt-0.5 text-xs text-gray-500">Auto-generated on form submission</p>
                          <p className="mt-0.5 text-xs text-gray-400">by admin</p>
                        </div>
                        <span className="shrink-0 text-xs text-gray-400">On create</span>
                      </div>
                    </li>
                  </ol>
                  <p className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-400">
                    Full activity log with timestamps will be available on the trip sheet detail page after creation.
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              {/* Create button */}
              <div className="mt-6">
                <button onClick={create} disabled={creating}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors shadow-sm">
                  {creating
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating Trip Sheet{expenses.length > 0 ? ` + ${expenses.length} expense${expenses.length !== 1 ? 's' : ''}` : ''}…</>
                    : <><Truck className="h-4 w-4" /> Create Trip Sheet for {selected.ref_number}{expenses.length > 0 ? ` + ${expenses.length} Expense${expenses.length !== 1 ? 's' : ''}` : ''}</>
                  }
                </button>
                <p className="mt-2 text-center text-xs text-gray-400">All fields can be updated later from the trip sheet detail page.</p>
              </div>

            </div>
          )}
        </div>

      </div>
    </>
  )
}
