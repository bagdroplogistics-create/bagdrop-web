'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Truck, Package, MapPin, Calendar, Phone, Mail,
  User, Hash, ChevronDown, Plus, Pencil, Trash2, Save, X,
  CheckCircle, Clock, IndianRupee, TrendingUp, TrendingDown,
  FileText, Activity, Layers, ReceiptText,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────
interface Expense {
  id:             string
  expense_type:   string
  mode:           string | null
  from_location:  string | null
  to_location:    string | null
  vendor:         string | null
  description:    string | null
  estimated_cost: number
  actual_cost:    number
  payment_status: string
  receipt_url:    string | null
  created_at:     string
}

interface TripSheet {
  id:                 string
  trip_number:        string
  booking_id:         string | null
  quote_id:           string | null
  customer_name:      string | null
  customer_phone:     string | null
  customer_email:     string | null
  service_type:       string | null
  service_label:      string | null
  from_city:          string | null
  to_city:            string | null
  pickup_address:     string | null
  drop_address:       string | null
  pickup_date:        string | null
  delivery_date:      string | null
  total_bags:         number | null
  vendor:             string | null
  driver_name:        string | null
  vehicle_number:     string | null
  consignment_number: string | null
  luggage_code:       string | null
  cloak_room_number:  string | null
  pickup_person:      string | null
  pickup_contact:     string | null
  delivery_person:    string | null
  delivery_contact:   string | null
  notes:              string | null
  remarks:            string | null
  status:             string
  status_history:     StatusEvent[]
  quote_amount:       number
  additional_charges: number
  discount:           number
  tax_amount:         number
  total_income:       number
  total_expense:      number
  net_profit:         number
  payment_status:     string | null
  created_by:         string
  created_at:         string
  trip_expenses:      Expense[]
}

interface StatusEvent {
  from:       string | null
  to:         string
  timestamp:  string
  changed_by: string
  note:       string | null
}

// ── Lookups ────────────────────────────────────────────────────
const TRIP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  created:          { label: 'Created',           color: '#6b7280', bg: '#f3f4f6' },
  pickup_assigned:  { label: 'Pickup Assigned',   color: '#d97706', bg: '#fef3c7' },
  picked_up:        { label: 'Picked Up',         color: '#7c3aed', bg: '#ede9fe' },
  in_transit:       { label: 'In Transit',        color: '#2563eb', bg: '#dbeafe' },
  at_airport:       { label: 'At Airport',        color: '#0891b2', bg: '#cffafe' },
  out_for_delivery: { label: 'Out for Delivery',  color: '#ea580c', bg: '#ffedd5' },
  delivered:        { label: 'Delivered',         color: '#16a34a', bg: '#dcfce7' },
  completed:        { label: 'Completed',         color: '#15803d', bg: '#bbf7d0' },
  cancelled:        { label: 'Cancelled',         color: '#dc2626', bg: '#fee2e2' },
}

const EXPENSE_TYPES = [
  'Transportation', 'Fuel', 'Toll', 'Parking', 'Labour', 'Handling',
  'Airport Fee', 'Customs', 'Insurance', 'Packaging', 'Storage', 'Miscellaneous',
]

const PAYMENT_STATUSES = ['pending', 'paid', 'reimbursed']

function fmt(n: number | null | undefined) {
  return '₹' + (n ?? 0).toLocaleString('en-IN')
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDT(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500">{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
    </div>
  )
}

// ── Inner component (uses useSearchParams) ────────────────────
function TripSheetDetail({ id }: { id: string }) {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [sheet,    setSheet]    = useState<TripSheet | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState(searchParams.get('tab') === 'edit' ? 'edit' : 'overview')
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState('')

  // Edit form state
  const [editForm, setEditForm] = useState({
    status: '', vendor: '', driver_name: '', vehicle_number: '',
    consignment_number: '', luggage_code: '', cloak_room_number: '',
    pickup_person: '', pickup_contact: '', delivery_person: '', delivery_contact: '',
    notes: '', remarks: '',
    additional_charges: '0', discount: '0', tax_amount: '0',
  })

  // New expense form
  const [showExpForm,  setShowExpForm]  = useState(false)
  const [expForm,      setExpForm]      = useState({
    expense_type: 'Transportation', mode: '', from_location: '',
    to_location: '', vendor: '', description: '', estimated_cost: '',
    actual_cost: '', payment_status: 'pending',
  })
  const [savingExp,    setSavingExp]    = useState(false)
  const [editingExp,   setEditingExp]   = useState<string | null>(null)
  const [editExpForm,  setEditExpForm]  = useState({
    expense_type: '', from_location: '', to_location: '',
    vendor: '', description: '', estimated_cost: '', actual_cost: '', payment_status: 'pending',
  })

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchSheet = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const res = await fetch(`/api/admin/trip-sheets/${id}?key=${adminKey}`)
    if (res.ok) {
      const { trip_sheet } = await res.json()
      setSheet(trip_sheet)
      setEditForm({
        status:             trip_sheet.status             ?? '',
        vendor:             trip_sheet.vendor             ?? '',
        driver_name:        trip_sheet.driver_name        ?? '',
        vehicle_number:     trip_sheet.vehicle_number     ?? '',
        consignment_number: trip_sheet.consignment_number ?? '',
        luggage_code:       trip_sheet.luggage_code       ?? '',
        cloak_room_number:  trip_sheet.cloak_room_number  ?? '',
        pickup_person:      trip_sheet.pickup_person      ?? '',
        pickup_contact:     trip_sheet.pickup_contact     ?? '',
        delivery_person:    trip_sheet.delivery_person    ?? '',
        delivery_contact:   trip_sheet.delivery_contact   ?? '',
        notes:              trip_sheet.notes              ?? '',
        remarks:            trip_sheet.remarks            ?? '',
        additional_charges: String(trip_sheet.additional_charges ?? 0),
        discount:           String(trip_sheet.discount            ?? 0),
        tax_amount:         String(trip_sheet.tax_amount          ?? 0),
      })
    }
    setLoading(false)
  }, [adminKey, id])

  useEffect(() => { if (authed) fetchSheet() }, [authed, fetchSheet])

  async function saveEdit() {
    setSaving(true)
    setSaveMsg('')
    const res = await fetch(`/api/admin/trip-sheets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        ...editForm,
        additional_charges: Number(editForm.additional_charges) || 0,
        discount:           Number(editForm.discount)           || 0,
        tax_amount:         Number(editForm.tax_amount)         || 0,
      }),
    })
    if (res.ok) { setSaveMsg('Saved!'); fetchSheet(); setTimeout(() => setSaveMsg(''), 3000) }
    else { const d = await res.json(); setSaveMsg('Error: ' + (d.error ?? 'Failed')) }
    setSaving(false)
  }

  async function addExpense() {
    setSavingExp(true)
    const res = await fetch(`/api/admin/trip-sheets/${id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        ...expForm,
        estimated_cost: Number(expForm.estimated_cost) || 0,
        actual_cost:    Number(expForm.actual_cost)    || 0,
      }),
    })
    if (res.ok) {
      setShowExpForm(false)
      setExpForm({ expense_type: 'Transportation', mode: '', from_location: '', to_location: '', vendor: '', description: '', estimated_cost: '', actual_cost: '', payment_status: 'pending' })
      fetchSheet()
    }
    setSavingExp(false)
  }

  async function deleteExpense(expId: string) {
    if (!confirm('Delete this expense?')) return
    await fetch(`/api/admin/trip-sheets/${id}/expenses/${expId}`, {
      method: 'DELETE', headers: { 'x-admin-key': adminKey },
    })
    fetchSheet()
  }

  function startEditExp(e: Expense) {
    setEditingExp(e.id)
    setEditExpForm({
      expense_type:  e.expense_type   ?? '',
      from_location: e.from_location  ?? '',
      to_location:   e.to_location    ?? '',
      vendor:        e.vendor         ?? '',
      description:   e.description    ?? '',
      estimated_cost: String(e.estimated_cost ?? 0),
      actual_cost:    String(e.actual_cost    ?? 0),
      payment_status: e.payment_status ?? 'pending',
    })
  }

  async function saveExpEdit(expId: string) {
    setSavingExp(true)
    await fetch(`/api/admin/trip-sheets/${id}/expenses/${expId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        expense_type:   editExpForm.expense_type,
        from_location:  editExpForm.from_location  || null,
        to_location:    editExpForm.to_location    || null,
        vendor:         editExpForm.vendor         || null,
        description:    editExpForm.description    || null,
        estimated_cost: Number(editExpForm.estimated_cost) || 0,
        actual_cost:    Number(editExpForm.actual_cost)    || 0,
        payment_status: editExpForm.payment_status,
      }),
    })
    setEditingExp(null)
    setSavingExp(false)
    fetchSheet()
  }

  if (!authed || loading || !sheet) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  const st = TRIP_STATUS[sheet.status] ?? { label: sheet.status, color: '#6b7280', bg: '#f3f4f6' }
  const expenses = sheet.trip_expenses ?? []
  const estTotal = expenses.reduce((s, e) => s + e.estimated_cost, 0)
  const actTotal = expenses.reduce((s, e) => s + e.actual_cost,    0)

  const TABS = [
    { key: 'overview',  label: 'Overview',      icon: <Layers       className="h-4 w-4" /> },
    { key: 'edit',      label: 'Edit / Status', icon: <Pencil       className="h-4 w-4" /> },
    { key: 'expenses',  label: 'Expenses',      icon: <ReceiptText  className="h-4 w-4" /> },
    { key: 'profit',    label: 'P&L Summary',   icon: <TrendingUp   className="h-4 w-4" /> },
    { key: 'activity',  label: 'Activity Log',  icon: <Activity     className="h-4 w-4" /> },
  ]

  return (
    <>
      {/* Page header */}
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/trip-sheets" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> Trip Sheets
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-mono text-sm font-bold text-orange-500">{sheet.trip_number}</span>
          <span style={{ color: st.color, background: st.bg }}
            className="rounded-full px-2.5 py-1 text-xs font-semibold">{st.label}</span>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">

        {/* Summary strip */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Customer',   value: sheet.customer_name ?? '—',    icon: <User className="h-4 w-4" />,          color: '#f97316', bg: '#fff7ed' },
            { label: 'Total Income',  value: fmt(sheet.total_income),   icon: <TrendingUp className="h-4 w-4" />,    color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Total Expense', value: fmt(sheet.total_expense),  icon: <TrendingDown className="h-4 w-4" />, color: '#dc2626', bg: '#fef2f2' },
            { label: 'Net Profit',    value: fmt(sheet.net_profit),     icon: <IndianRupee className="h-4 w-4" />,  color: sheet.net_profit >= 0 ? '#16a34a' : '#dc2626', bg: sheet.net_profit >= 0 ? '#f0fdf4' : '#fef2f2' },
          ].map(c => (
            <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span style={{ color: c.color, background: c.bg }} className="flex h-7 w-7 items-center justify-center rounded-lg">{c.icon}</span>
                <span className="text-xs font-semibold text-gray-400">{c.label}</span>
              </div>
              <p className="text-base font-bold text-gray-900 truncate">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-5 flex gap-1 rounded-xl bg-gray-100 p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                tab === t.key ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Overview ── */}
        {tab === 'overview' && (
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Customer */}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700">
                <User className="h-4 w-4 text-orange-400" /> Customer Details
              </h3>
              <div className="space-y-3 text-sm">
                <Row label="Name"    val={sheet.customer_name  ?? '—'} />
                <Row label="Phone"   val={sheet.customer_phone ?? '—'} />
                <Row label="Email"   val={sheet.customer_email ?? '—'} />
                <Row label="Service" val={sheet.service_label  ?? '—'} />
                <Row label="Bags"    val={String(sheet.total_bags ?? '—')} />
              </div>
            </div>

            {/* Route */}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700">
                <MapPin className="h-4 w-4 text-orange-400" /> Route
              </h3>
              <div className="space-y-3 text-sm">
                <Row label="From"          val={sheet.from_city      ?? '—'} />
                <Row label="To"            val={sheet.to_city        ?? '—'} />
                <Row label="Pickup Date"   val={fmtDate(sheet.pickup_date)} />
                <Row label="Delivery Date" val={fmtDate(sheet.delivery_date)} />
                <Row label="Pickup Address"   val={sheet.pickup_address ?? '—'} />
                <Row label="Drop Address"     val={sheet.drop_address   ?? '—'} />
              </div>
            </div>

            {/* Ops */}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700">
                <Truck className="h-4 w-4 text-orange-400" /> Operations
              </h3>
              <div className="space-y-3 text-sm">
                <Row label="Vendor"         val={sheet.vendor             ?? '—'} />
                <Row label="Driver"         val={sheet.driver_name        ?? '—'} />
                <Row label="Vehicle No."    val={sheet.vehicle_number     ?? '—'} />
                <Row label="Consignment"    val={sheet.consignment_number ?? '—'} />
                <Row label="Luggage Code"   val={sheet.luggage_code       ?? '—'} />
                <Row label="Cloak Room No." val={sheet.cloak_room_number  ?? '—'} />
              </div>
            </div>

            {/* Pickup / Delivery contacts */}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700">
                <Phone className="h-4 w-4 text-orange-400" /> Field Contacts
              </h3>
              <div className="space-y-3 text-sm">
                <Row label="Pickup Person"    val={sheet.pickup_person    ?? '—'} />
                <Row label="Pickup Contact"   val={sheet.pickup_contact   ?? '—'} />
                <Row label="Delivery Person"  val={sheet.delivery_person  ?? '—'} />
                <Row label="Delivery Contact" val={sheet.delivery_contact ?? '—'} />
              </div>
              {(sheet.notes || sheet.remarks) && (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  {sheet.notes   && <p><strong>Notes:</strong> {sheet.notes}</p>}
                  {sheet.remarks && <p className="mt-1"><strong>Remarks:</strong> {sheet.remarks}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Edit / Status ── */}
        {tab === 'edit' && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-5 text-sm font-bold text-gray-700">Edit Trip Sheet</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Status</label>
                <div className="relative">
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
                    {Object.entries(TRIP_STATUS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              <Field label="Vendor"             value={editForm.vendor}             onChange={v => setEditForm(f => ({ ...f, vendor: v }))} />
              <Field label="Driver Name"        value={editForm.driver_name}        onChange={v => setEditForm(f => ({ ...f, driver_name: v }))} />
              <Field label="Vehicle No."        value={editForm.vehicle_number}     onChange={v => setEditForm(f => ({ ...f, vehicle_number: v }))} />
              <Field label="Consignment No."    value={editForm.consignment_number} onChange={v => setEditForm(f => ({ ...f, consignment_number: v }))} />
              <Field label="Luggage Code"       value={editForm.luggage_code}       onChange={v => setEditForm(f => ({ ...f, luggage_code: v }))} />
              <Field label="Cloak Room No."     value={editForm.cloak_room_number}  onChange={v => setEditForm(f => ({ ...f, cloak_room_number: v }))} />
              <Field label="Pickup Person"      value={editForm.pickup_person}      onChange={v => setEditForm(f => ({ ...f, pickup_person: v }))} />
              <Field label="Pickup Contact"     value={editForm.pickup_contact}     onChange={v => setEditForm(f => ({ ...f, pickup_contact: v }))} />
              <Field label="Delivery Person"    value={editForm.delivery_person}    onChange={v => setEditForm(f => ({ ...f, delivery_person: v }))} />
              <Field label="Delivery Contact"   value={editForm.delivery_contact}   onChange={v => setEditForm(f => ({ ...f, delivery_contact: v }))} />
              <Field label="Additional Charges" value={editForm.additional_charges} onChange={v => setEditForm(f => ({ ...f, additional_charges: v }))} type="number" />
              <Field label="Discount"           value={editForm.discount}           onChange={v => setEditForm(f => ({ ...f, discount: v }))} type="number" />
              <Field label="Tax Amount"         value={editForm.tax_amount}         onChange={v => setEditForm(f => ({ ...f, tax_amount: v }))} type="number" />
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
              <textarea value={editForm.notes} rows={2} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold text-gray-500">Remarks</label>
              <textarea value={editForm.remarks} rows={2} onChange={e => setEditForm(f => ({ ...f, remarks: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button onClick={saveEdit} disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              {saveMsg && (
                <span className={`text-sm font-semibold ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Expenses ── */}
        {tab === 'expenses' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-700">Trip Expenses</h3>
                <p className="text-xs text-gray-400 mt-0.5">{expenses.length} rows · Rate/Cost Total: {fmt(estTotal)} · Actual Total: {fmt(actTotal)}</p>
              </div>
              <button onClick={() => setShowExpForm(v => !v)}
                className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
                {showExpForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {showExpForm ? 'Cancel' : 'Add Expense'}
              </button>
            </div>

            {/* Add expense form */}
            {showExpForm && (
              <div className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-5">
                <h4 className="mb-4 text-sm font-bold text-orange-700">Add Expense Row</h4>
                <div className="grid gap-3 sm:grid-cols-5">
                  {/* Mode — free text, matches Excel "Mode" column */}
                  <div className="sm:col-span-2">
                    <Field label="Mode (Expense Type)" value={expForm.expense_type}
                      onChange={v => setExpForm(f => ({ ...f, expense_type: v }))}
                      placeholder="e.g. Taxi Charges, Bus freight, Porter…" />
                  </div>
                  <Field label="From" value={expForm.from_location}
                    onChange={v => setExpForm(f => ({ ...f, from_location: v }))}
                    placeholder="Origin location" />
                  <Field label="To" value={expForm.to_location}
                    onChange={v => setExpForm(f => ({ ...f, to_location: v }))}
                    placeholder="Destination" />
                  <Field label="Rate / Cost (₹)" value={expForm.estimated_cost}
                    onChange={v => setExpForm(f => ({ ...f, estimated_cost: v }))}
                    type="number" placeholder="0" />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-5">
                  <Field label="Actual Cost (₹)" value={expForm.actual_cost}
                    onChange={v => setExpForm(f => ({ ...f, actual_cost: v }))}
                    type="number" placeholder="0" />
                  <Field label="Vendor / Agent" value={expForm.vendor}
                    onChange={v => setExpForm(f => ({ ...f, vendor: v }))}
                    placeholder="Vendor name" />
                  <Field label="Notes" value={expForm.description}
                    onChange={v => setExpForm(f => ({ ...f, description: v }))}
                    placeholder="Optional notes" />
                  <Select label="Payment Status" value={expForm.payment_status}
                    onChange={v => setExpForm(f => ({ ...f, payment_status: v }))}
                    options={PAYMENT_STATUSES} />
                  <div className="flex items-end">
                    <button onClick={addExpense} disabled={savingExp || !expForm.expense_type}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                      <Plus className="h-4 w-4" />
                      {savingExp ? 'Adding…' : 'Add Row'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {expenses.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
                <ReceiptText className="mx-auto h-10 w-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">No expenses logged yet</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Mode</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">From</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">To</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Rate / Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actual Cost</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                      <th className="px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {expenses.map((e, i) => {
                      const isEditing = editingExp === e.id
                      return isEditing ? (
                        // ── Inline edit row ──────────────────────
                        <tr key={e.id} className="bg-orange-50">
                          <td className="px-2 py-2">
                            <input value={editExpForm.expense_type}
                              onChange={ev => setEditExpForm(f => ({ ...f, expense_type: ev.target.value }))}
                              placeholder="Mode / expense type"
                              className="w-full rounded-lg border border-orange-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                            <input value={editExpForm.vendor}
                              onChange={ev => setEditExpForm(f => ({ ...f, vendor: ev.target.value }))}
                              placeholder="Vendor (optional)"
                              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-300" />
                          </td>
                          <td className="px-2 py-2">
                            <input value={editExpForm.from_location}
                              onChange={ev => setEditExpForm(f => ({ ...f, from_location: ev.target.value }))}
                              placeholder="From"
                              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                          </td>
                          <td className="px-2 py-2">
                            <input value={editExpForm.to_location}
                              onChange={ev => setEditExpForm(f => ({ ...f, to_location: ev.target.value }))}
                              placeholder="To"
                              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={editExpForm.estimated_cost}
                              onChange={ev => setEditExpForm(f => ({ ...f, estimated_cost: ev.target.value }))}
                              placeholder="0"
                              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-orange-400" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={editExpForm.actual_cost}
                              onChange={ev => setEditExpForm(f => ({ ...f, actual_cost: ev.target.value }))}
                              placeholder="0"
                              className="w-full rounded-lg border border-orange-300 px-2 py-1.5 text-sm font-bold text-right focus:outline-none focus:ring-1 focus:ring-orange-400" />
                          </td>
                          <td className="px-2 py-2">
                            <div className="relative">
                              <select value={editExpForm.payment_status}
                                onChange={ev => setEditExpForm(f => ({ ...f, payment_status: ev.target.value }))}
                                className="w-full appearance-none rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400">
                                {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex gap-1">
                              <button onClick={() => saveExpEdit(e.id)} disabled={savingExp}
                                title="Save"
                                className="rounded-lg bg-orange-500 p-1.5 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                                <Save className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setEditingExp(null)}
                                title="Cancel"
                                className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        // ── View row ─────────────────────────────
                        <tr key={e.id} className={`hover:bg-orange-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-800">{e.expense_type}</p>
                            {(e.vendor || e.description) && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {[e.vendor, e.description].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{e.from_location || <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{e.to_location   || <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600 font-medium">{fmt(e.estimated_cost)}</td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fmt(e.actual_cost)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              e.payment_status === 'paid'       ? 'bg-green-50 text-green-700' :
                              e.payment_status === 'reimbursed' ? 'bg-blue-50 text-blue-700'  :
                                                                  'bg-amber-50 text-amber-700'
                            }`}>{e.payment_status}</span>
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => startEditExp(e)}
                                title="Edit"
                                className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-200 transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deleteExpense(e.id)}
                                title="Delete"
                                className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">Total</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-gray-700">{fmt(estTotal)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{fmt(actTotal)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: P&L Summary ── */}
        {tab === 'profit' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="mb-5 text-sm font-bold text-gray-700">Income Breakdown</h3>
              <div className="space-y-3">
                <PLRow label="Quote Amount"       value={fmt(sheet.quote_amount)}       />
                <PLRow label="Additional Charges" value={`+ ${fmt(sheet.additional_charges)}`} color="text-green-600" />
                <PLRow label="Discount"           value={`- ${fmt(sheet.discount)}`}   color="text-red-500" />
                <PLRow label="Tax"                value={`+ ${fmt(sheet.tax_amount)}`} color="text-blue-600" />
                <div className="border-t border-gray-100 pt-3">
                  <PLRow label="Total Income" value={fmt(sheet.total_income)} bold />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="mb-5 text-sm font-bold text-gray-700">Expense Summary</h3>
              {expenses.length === 0 ? (
                <p className="text-sm text-gray-400">No expenses recorded.</p>
              ) : (
                <div className="space-y-2">
                  {expenses.map(e => (
                    <PLRow key={e.id}
                      label={`${e.expense_type}${e.from_location ? ` (${e.from_location}${e.to_location ? ' → ' + e.to_location : ''})` : ''}`}
                      value={`- ${fmt(e.actual_cost || e.estimated_cost)}`} color="text-red-500" />
                  ))}
                  <div className="border-t border-gray-100 pt-3">
                    <PLRow label="Total Expense" value={fmt(sheet.total_expense)} bold color="text-red-600" />
                  </div>
                </div>
              )}
            </div>

            <div className={`rounded-2xl border p-6 shadow-sm ${sheet.net_profit >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Net Profit</p>
                  <p className={`mt-1 text-3xl font-black ${sheet.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {sheet.net_profit >= 0 ? '+' : ''}{fmt(sheet.net_profit)}
                  </p>
                </div>
                {sheet.total_income > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Margin</p>
                    <p className={`text-xl font-bold ${sheet.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {((sheet.net_profit / sheet.total_income) * 100).toFixed(1)}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Activity ── */}
        {tab === 'activity' && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-5 text-sm font-bold text-gray-700">Activity Log</h3>
            {(!sheet.status_history || sheet.status_history.length === 0) ? (
              <p className="text-sm text-gray-400">No activity recorded.</p>
            ) : (
              <ol className="relative border-l border-gray-100 ml-4">
                {[...sheet.status_history].reverse().map((ev, i) => {
                  const toSt = TRIP_STATUS[ev.to] ?? { label: ev.to, color: '#6b7280', bg: '#f3f4f6' }
                  return (
                    <li key={i} className="mb-6 ml-5">
                      <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white"
                        style={{ background: toSt.color }} />
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {ev.from ? (
                              <><span className="text-gray-400">{TRIP_STATUS[ev.from]?.label ?? ev.from}</span> → <span style={{ color: toSt.color }}>{toSt.label}</span></>
                            ) : (
                              <span style={{ color: toSt.color }}>{toSt.label}</span>
                            )}
                          </p>
                          {ev.note && <p className="mt-0.5 text-xs text-gray-500">{ev.note}</p>}
                          <p className="mt-0.5 text-xs text-gray-400">by {ev.changed_by}</p>
                        </div>
                        <span className="shrink-0 text-xs text-gray-400">{fmtDT(ev.timestamp)}</span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        )}
      </main>
    </>
  )
}

// Small helper components
function Row({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 text-xs font-semibold text-gray-400">{label}</span>
      <span className="text-right text-sm font-medium text-gray-800">{val}</span>
    </div>
  )
}

function PLRow({ label, value, bold = false, color = 'text-gray-700' }: {
  label: string; value: string; bold?: boolean; color?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'} ${color}`}>{value}</span>
    </div>
  )
}

// ── Page wrapper (Suspense for useSearchParams) ───────────────
export default async function TripSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    }>
      <TripSheetDetail id={id} />
    </Suspense>
  )
}
