'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Search, Loader2, FileText, User, MapPin, Package,
  IndianRupee, CheckCircle, Pencil, ChevronRight, AlertCircle,
} from 'lucide-react'
import { MODE_OPTIONS } from '@/lib/lr-constants'

interface BookingEntry {
  booking_id: string; tracking_id: string
  customer_name: string; customer_phone: string
  from_city: string | null; to_city: string | null
  pickup_address: string | null; drop_address: string | null
  total_bags: number | null; total_amount: number | null
  status: string
}

const inp = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200'
const lbl = 'mb-1 block text-xs font-semibold text-gray-500'

function FInput({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={inp} />
    </div>
  )
}

function fmtRs(n: number | null | undefined) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

export default function NewLRPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [entries, setEntries] = useState<BookingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<BookingEntry | null>(null)
  const [mode, setModeType] = useState<'select' | 'manual'>('select')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // Manual fields
  const [consignorName, setConsignorName] = useState('')
  const [consignorMobile, setConsignorMobile] = useState('')
  const [consignorAddress, setConsignorAddress] = useState('')
  const [consigneeName, setConsigneeName] = useState('')
  const [consigneeMobile, setConsigneeMobile] = useState('')
  const [consigneeAddress, setConsigneeAddress] = useState('')
  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [totalBags, setTotalBags] = useState('1')

  // LR-specific fields (apply to both modes)
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [lrMode, setLrMode] = useState('Air')
  const [contentDescription, setContentDescription] = useState('HOUSEHOLD BAGGAGE')
  const [actualWeight, setActualWeight] = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchAll = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const statuses = ['confirmed', 'trip_created', 'picked_up', 'in_transit', 'delivered', 'completed']
      const results = await Promise.all(
        statuses.map(s => fetch(`/api/admin/bookings?key=${adminKey}&status=${s}&limit=200`).then(r => r.json()))
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: BookingEntry[] = results.flatMap((d: any) =>
        (Array.isArray(d.bookings) ? d.bookings : []).map((b: any) => ({
          booking_id: b.id, tracking_id: b.tracking_id,
          customer_name: b.customer_name, customer_phone: b.customer_phone,
          from_city: b.from_city ?? null, to_city: b.to_city ?? null,
          pickup_address: b.pickup_address ?? null, drop_address: b.drop_address ?? null,
          total_bags: b.total_bags ?? null, total_amount: b.total_amount ?? null,
          status: b.status,
        }))
      )
      const seen = new Set<string>()
      setEntries(all.filter(e => { if (seen.has(e.booking_id)) return false; seen.add(e.booking_id); return true }))
    } catch { setError('Failed to load bookings') }
    setLoading(false)
  }, [adminKey])

  useEffect(() => { if (authed) fetchAll() }, [authed, fetchAll])

  const filtered = entries.filter(e => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return e.tracking_id.toLowerCase().includes(q) || e.customer_name.toLowerCase().includes(q) || e.customer_phone.includes(q)
  })

  async function create() {
    if (mode === 'select' && !selected) return
    if (mode === 'manual' && (!consignorName.trim() || !consigneeName.trim())) {
      setError('Consignor and consignee name are required'); return
    }
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/admin/lrs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          ...(mode === 'select'
            ? { booking_id: selected!.booking_id }
            : {
                manual: true,
                consignor_name: consignorName.trim(), consignor_mobile: consignorMobile.trim() || null, consignor_address: consignorAddress.trim() || null,
                consignee_name: consigneeName.trim(), consignee_mobile: consigneeMobile.trim() || null, consignee_address: consigneeAddress.trim() || null,
                from_city: fromCity.trim() || null, to_city: toCity.trim() || null,
                total_bags: Number(totalBags) || 1,
              }),
          vehicle_number: vehicleNumber.trim() || null,
          mode: lrMode,
          content_description: contentDescription.trim() || null,
          actual_weight: actualWeight ? Number(actualWeight) : null,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to create LR'); setCreating(false); return }
      router.push(`/admin/lrs/${d.lr.id}`)
    } catch { setError('Network error — please try again'); setCreating(false) }
  }

  if (!authed) return null

  return (
    <>
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/admin/lrs" className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> LR / GC
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
          <span className="font-semibold text-gray-800">New LR</span>
        </div>
        {(mode === 'select' ? selected : true) && (
          <button onClick={create} disabled={creating}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><FileText className="h-4 w-4" /> Generate LR</>}
          </button>
        )}
      </div>

      <div className="flex h-[calc(100vh-57px)] overflow-hidden">
        {/* LEFT: booking selector */}
        <div className="flex w-[360px] shrink-0 flex-col border-r border-gray-200 bg-gray-50">
          <div className="border-b border-gray-200 bg-white p-4">
            <div className="mb-3 flex gap-1 rounded-xl bg-gray-100 p-1">
              <button onClick={() => setModeType('select')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${mode === 'select' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Select Booking
              </button>
              <button onClick={() => setModeType('manual')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${mode === 'manual' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Create Manually
              </button>
            </div>
            {mode === 'select' ? (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search by tracking ID, name…" value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200" />
              </div>
            ) : (
              <p className="text-xs text-gray-400">No booking needed — fill in consignor/consignee details on the right.</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {mode === 'manual' ? (
              <div className="py-10 text-center px-4">
                <Pencil className="mx-auto h-8 w-8 text-orange-200 mb-2" />
                <p className="text-sm text-gray-500 font-medium">Manual Entry mode</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Package className="mx-auto h-10 w-10 text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">{search ? 'No records match' : 'No confirmed bookings found'}</p>
              </div>
            ) : filtered.map(e => {
              const isSelected = selected?.booking_id === e.booking_id
              return (
                <button key={e.booking_id} onClick={() => setSelected(e)}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${isSelected ? 'border-orange-400 bg-orange-50 shadow-sm ring-1 ring-orange-300' : 'border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/50'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-orange-600">{e.tracking_id}</span>
                    {isSelected && <CheckCircle className="h-3.5 w-3.5 text-orange-500" />}
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <User className="h-3 w-3 text-gray-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800">{e.customer_name}</span>
                  </div>
                  {(e.from_city || e.to_city) && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-600 font-medium">{e.from_city ?? '—'} → {e.to_city ?? '—'}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {e.total_bags != null && <span className="flex items-center gap-1"><Package className="h-3 w-3" />{e.total_bags} bag{e.total_bags !== 1 ? 's' : ''}</span>}
                    {e.total_amount != null && <span className="flex items-center gap-1 font-semibold text-green-700"><IndianRupee className="h-3 w-3" />{fmtRs(e.total_amount)}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT: form */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {mode === 'select' && !selected ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 mb-4">
                <FileText className="h-8 w-8 text-orange-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-700">Select a Booking</h2>
              <p className="mt-1 text-sm text-gray-400 max-w-xs">Choose from the left panel, or switch to <strong>Create Manually</strong>.</p>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              {mode === 'manual' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700"><User className="h-4 w-4 text-orange-400" /> Consignor</h3>
                    <div className="space-y-3">
                      <FInput label="Name *" value={consignorName} onChange={setConsignorName} placeholder="Sender name" />
                      <FInput label="Mobile" value={consignorMobile} onChange={setConsignorMobile} type="tel" />
                      <FInput label="Address" value={consignorAddress} onChange={setConsignorAddress} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700"><User className="h-4 w-4 text-orange-400" /> Consignee</h3>
                    <div className="space-y-3">
                      <FInput label="Name *" value={consigneeName} onChange={setConsigneeName} placeholder="Receiver name" />
                      <FInput label="Mobile" value={consigneeMobile} onChange={setConsigneeMobile} type="tel" />
                      <FInput label="Address" value={consigneeAddress} onChange={setConsigneeAddress} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:col-span-2">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700"><MapPin className="h-4 w-4 text-orange-400" /> Route</h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <FInput label="From" value={fromCity} onChange={setFromCity} placeholder="Origin city" />
                      <FInput label="To" value={toCity} onChange={setToCity} placeholder="Destination city" />
                      <FInput label="Total Bags" value={totalBags} onChange={setTotalBags} type="number" />
                    </div>
                  </div>
                </div>
              )}

              {mode === 'select' && selected && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-500">Auto-filled from Booking</p>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-gray-400">Customer</p><p className="font-semibold text-gray-800">{selected.customer_name}</p></div>
                    <div><p className="text-xs text-gray-400">Route</p><p className="font-semibold text-gray-800">{selected.from_city ?? '—'} → {selected.to_city ?? '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Bags</p><p className="font-semibold text-gray-800">{selected.total_bags ?? '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Amount</p><p className="font-semibold text-gray-800">{fmtRs(selected.total_amount)}</p></div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700"><FileText className="h-4 w-4 text-orange-400" /> LR Details</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FInput label="Vehicle Number" value={vehicleNumber} onChange={setVehicleNumber} placeholder="e.g. GJ-06-AB-1234" />
                  <div>
                    <label className={lbl}>Mode</label>
                    <select value={lrMode} onChange={e => setLrMode(e.target.value)} className={inp}>
                      {MODE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <FInput label="Content Description" value={contentDescription} onChange={setContentDescription} placeholder="HOUSEHOLD BAGGAGE" />
                  <FInput label="Actual Weight (kg)" value={actualWeight} onChange={setActualWeight} type="number" />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              <button onClick={create} disabled={creating}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors shadow-sm">
                {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating LR…</> : <><FileText className="h-4 w-4" /> Generate LR{mode === 'select' ? ` for ${selected!.tracking_id}` : ''}</>}
              </button>
              <p className="text-center text-xs text-gray-400">Charges, GST, and remaining fields can be edited from the LR detail page after creation.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
