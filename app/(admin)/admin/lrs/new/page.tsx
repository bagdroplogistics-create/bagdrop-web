'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Search, Loader2, FileText, User, MapPin, Package,
  IndianRupee, CheckCircle, Pencil, ChevronRight, AlertCircle, Receipt, ListChecks,
} from 'lucide-react'
import {
  MODE_OPTIONS, LR_CHARGE_FIELDS, GST_PAYABLE_BY_OPTIONS, PAYMENT_TERMS_OPTIONS, LR_TYPE_OPTIONS,
} from '@/lib/lr-constants'
import { formatCustomerName } from '@/lib/constants'

interface BookingEntry {
  booking_id: string; tracking_id: string
  title?: string | null
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

function FSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: readonly string[]
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={inp}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Card({ title, icon, children, cols = 2 }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; cols?: number
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700">{icon} {title}</h3>
      <div className={`grid gap-4 ${cols === 3 ? 'sm:grid-cols-3' : cols === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
        {children}
      </div>
    </div>
  )
}

function fmtRs(n: number | null | undefined) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

const EMPTY_CHARGES: Record<string, string> = Object.fromEntries(LR_CHARGE_FIELDS.map(f => [f.key, '']))

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

  // ── Route (manual mode only — auto-filled from booking otherwise) ──
  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [totalBags, setTotalBags] = useState('1')

  // ── Consignor / Consignee (manual mode only) ──
  const [consignorName, setConsignorName] = useState('')
  const [consignorMobile, setConsignorMobile] = useState('')
  const [consignorAddress, setConsignorAddress] = useState('')
  const [consignorGstin, setConsignorGstin] = useState('')
  const [consigneeName, setConsigneeName] = useState('')
  const [consigneeMobile, setConsigneeMobile] = useState('')
  const [consigneeAddress, setConsigneeAddress] = useState('')
  const [consigneeGstin, setConsigneeGstin] = useState('')

  // ── Billing & Invoice (both modes — mirrors the LR PDF's Billed To /
  // Delivery Address / Invoice / E-way Bill row) ──
  const [billedToName, setBilledToName] = useState('')
  const [billedToGstin, setBilledToGstin] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceValue, setInvoiceValue] = useState('')
  const [ewayBillNumber, setEwayBillNumber] = useState('')

  // ── LR Details (both modes) ──
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [lrMode, setLrMode] = useState('Air')
  const [contentDescription, setContentDescription] = useState('HOUSEHOLD BAGGAGE')
  const [actualWeight, setActualWeight] = useState('')
  const [chargeableWeight, setChargeableWeight] = useState('')
  const [sizeL, setSizeL] = useState('')
  const [sizeW, setSizeW] = useState('')
  const [sizeH, setSizeH] = useState('')
  const [privateMark, setPrivateMark] = useState('')

  // ── Charges ledger (both modes) ──
  const [charges, setCharges] = useState<Record<string, string>>({ ...EMPTY_CHARGES })

  // ── Terms & footer (both modes) ──
  const [insuranceByCustomer, setInsuranceByCustomer] = useState(false)
  const [gstPayableBy, setGstPayableBy] = useState<string>(GST_PAYABLE_BY_OPTIONS[0])
  const [paymentTerms, setPaymentTerms] = useState<string>(PAYMENT_TERMS_OPTIONS[0])
  const [lrType, setLrType] = useState<string>(LR_TYPE_OPTIONS[0])
  const [deliveryAt, setDeliveryAt] = useState('Door Dly')
  const [remarks, setRemarks] = useState('')
  const [preparedBy, setPreparedBy] = useState('admin')

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
          title: b.title ?? null,
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

  // Selecting a booking pre-fills the same editable Consignor/Consignee
  // cards used in Create Manually mode (booking's own name/phone for both,
  // pickup address for Consignor, drop address for Consignee) — the admin
  // can still correct any of it before generating, same as manual mode.
  function selectBooking(e: BookingEntry) {
    setSelected(e)
    const name = formatCustomerName(e.title, e.customer_name) || e.customer_name
    setConsignorName(name)
    setConsignorMobile(e.customer_phone ?? '')
    setConsignorAddress(e.pickup_address ?? '')
    setConsignorGstin('')
    setConsigneeName(name)
    setConsigneeMobile(e.customer_phone ?? '')
    setConsigneeAddress(e.drop_address ?? '')
    setConsigneeGstin('')
  }

  function setCharge(key: string, value: string) {
    setCharges(prev => ({ ...prev, [key]: value }))
  }

  async function create() {
    if (mode === 'select' && !selected) return
    if (mode === 'manual' && (!consignorName.trim() || !consigneeName.trim())) {
      setError('Consignor and consignee name are required'); return
    }
    setCreating(true); setError('')
    try {
      const chargePayload = Object.fromEntries(
        LR_CHARGE_FIELDS.map(f => [f.key, charges[f.key] ? Number(charges[f.key]) : 0])
      )
      const res = await fetch('/api/admin/lrs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          ...(mode === 'select'
            ? { booking_id: selected!.booking_id }
            : {
                manual: true,
                from_city: fromCity.trim() || null, to_city: toCity.trim() || null,
                total_bags: Number(totalBags) || 1,
              }),
          // Consignor/Consignee overrides — always sent. In manual mode
          // these are the only source; in select mode they start
          // pre-filled from the booking (see selectBooking()) but the
          // API still prefers whatever's here over the raw booking data,
          // so edits made on this screen actually take effect.
          consignor_name: consignorName.trim() || null, consignor_mobile: consignorMobile.trim() || null, consignor_address: consignorAddress.trim() || null,
          consignee_name: consigneeName.trim() || null, consignee_mobile: consigneeMobile.trim() || null, consignee_address: consigneeAddress.trim() || null,
          consignor_gstin: consignorGstin.trim() || null,
          consignee_gstin: consigneeGstin.trim() || null,

          billed_to_name:   billedToName.trim()   || null,
          billed_to_gstin:  billedToGstin.trim()   || null,
          delivery_address: deliveryAddress.trim() || null,
          invoice_number:   invoiceNumber.trim()   || null,
          invoice_value:    invoiceValue ? Number(invoiceValue) : null,
          eway_bill_number: ewayBillNumber.trim()  || null,

          vehicle_number: vehicleNumber.trim() || null,
          mode: lrMode,
          content_description: contentDescription.trim() || null,
          actual_weight:     actualWeight     ? Number(actualWeight)     : null,
          chargeable_weight: chargeableWeight ? Number(chargeableWeight) : null,
          size_l: sizeL ? Number(sizeL) : null,
          size_w: sizeW ? Number(sizeW) : null,
          size_h: sizeH ? Number(sizeH) : null,
          private_mark: privateMark.trim() || null,

          ...chargePayload,

          insurance_by_customer: insuranceByCustomer,
          gst_payable_by: gstPayableBy,
          payment_terms:  paymentTerms,
          lr_type:        lrType,
          delivery_at:    deliveryAt.trim() || null,
          remarks:        remarks.trim() || null,
          prepared_by:    preparedBy.trim() || 'admin',
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
              <p className="text-xs text-gray-400">No booking needed — fill in the route, consignor/consignee, and LR details on the right.</p>
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
                <button key={e.booking_id} onClick={() => selectBooking(e)}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${isSelected ? 'border-orange-400 bg-orange-50 shadow-sm ring-1 ring-orange-300' : 'border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/50'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-orange-600">{e.tracking_id}</span>
                    {isSelected && <CheckCircle className="h-3.5 w-3.5 text-orange-500" />}
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <User className="h-3 w-3 text-gray-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800">{formatCustomerName(e.title, e.customer_name) || e.customer_name}</span>
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

              {/* ── 1. Route (manual mode only — first, as requested) ── */}
              {mode === 'manual' && (
                <Card title="Route" icon={<MapPin className="h-4 w-4 text-orange-400" />} cols={3}>
                  <FInput label="From" value={fromCity} onChange={setFromCity} placeholder="Origin city" />
                  <FInput label="To" value={toCity} onChange={setToCity} placeholder="Destination city" />
                  <FInput label="Total Bags" value={totalBags} onChange={setTotalBags} type="number" />
                </Card>
              )}

              {mode === 'select' && selected && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-500">Auto-filled from Booking</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-xs text-gray-400">Route</p><p className="font-semibold text-gray-800">{selected.from_city ?? '—'} → {selected.to_city ?? '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Bags</p><p className="font-semibold text-gray-800">{selected.total_bags ?? '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Amount</p><p className="font-semibold text-gray-800">{fmtRs(selected.total_amount)}</p></div>
                  </div>
                </div>
              )}

              {/* ── 2. Consignor / Consignee — editable in both modes. In
                  Select Booking mode these start pre-filled from the
                  booking (name/phone for both, pickup/drop address) via
                  selectBooking() above, but the admin can still correct
                  anything before generating, same as Create Manually. ── */}
              {(mode === 'manual' || (mode === 'select' && selected)) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700"><User className="h-4 w-4 text-orange-400" /> Consignor</h3>
                    <div className="space-y-3">
                      <FInput label="Name *" value={consignorName} onChange={setConsignorName} placeholder="Sender name" />
                      <FInput label="Mobile" value={consignorMobile} onChange={setConsignorMobile} type="tel" />
                      <FInput label="Address" value={consignorAddress} onChange={setConsignorAddress} />
                      <FInput label="GSTIN" value={consignorGstin} onChange={setConsignorGstin} placeholder="24AAACC9320N2ZL" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700"><User className="h-4 w-4 text-orange-400" /> Consignee</h3>
                    <div className="space-y-3">
                      <FInput label="Name *" value={consigneeName} onChange={setConsigneeName} placeholder="Receiver name" />
                      <FInput label="Mobile" value={consigneeMobile} onChange={setConsigneeMobile} type="tel" />
                      <FInput label="Address" value={consigneeAddress} onChange={setConsigneeAddress} />
                      <FInput label="GSTIN" value={consigneeGstin} onChange={setConsigneeGstin} placeholder="Optional" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Billing & Invoice (both modes — Billed To / Delivery Address / Invoice / E-way Bill, per the LR PDF) ── */}
              <Card title="Billing &amp; Invoice" icon={<Receipt className="h-4 w-4 text-orange-400" />}>
                <FInput label="Billed To (defaults to Consignor)" value={billedToName} onChange={setBilledToName} placeholder="Leave blank to use Consignor name" />
                <FInput label="Billed To GSTIN" value={billedToGstin} onChange={setBilledToGstin} />
                <FInput label="Delivery Address (defaults to Consignee address)" value={deliveryAddress} onChange={setDeliveryAddress} />
                <FInput label="Invoice Number" value={invoiceNumber} onChange={setInvoiceNumber} />
                <FInput label="Invoice Value (₹)" value={invoiceValue} onChange={setInvoiceValue} type="number" />
                <FInput label="E-way Bill Number" value={ewayBillNumber} onChange={setEwayBillNumber} />
              </Card>

              {/* ── 3. LR Details (both modes) ── */}
              <Card title="LR Details" icon={<FileText className="h-4 w-4 text-orange-400" />}>
                <FInput label="Vehicle Number" value={vehicleNumber} onChange={setVehicleNumber} placeholder="e.g. GJ-06-AB-1234" />
                <FSelect label="Mode" value={lrMode} onChange={setLrMode} options={MODE_OPTIONS} />
                <FInput label="Content Description" value={contentDescription} onChange={setContentDescription} placeholder="HOUSEHOLD BAGGAGE" />
                <FInput label="Actual Weight (kg)" value={actualWeight} onChange={setActualWeight} type="number" />
                <FInput label="Chargeable Weight (kg)" value={chargeableWeight} onChange={setChargeableWeight} type="number" />
                <FInput label="Private Mark" value={privateMark} onChange={setPrivateMark} />
                <div className="sm:col-span-2">
                  <label className={lbl}>Size — L × W × H (cm)</label>
                  <div className="grid grid-cols-3 gap-3">
                    <input type="number" value={sizeL} onChange={e => setSizeL(e.target.value)} placeholder="L" className={inp} />
                    <input type="number" value={sizeW} onChange={e => setSizeW(e.target.value)} placeholder="W" className={inp} />
                    <input type="number" value={sizeH} onChange={e => setSizeH(e.target.value)} placeholder="H" className={inp} />
                  </div>
                </div>
              </Card>

              {/* ── Charges Ledger (both modes) — matches the GC's right-side charges column ── */}
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-700"><IndianRupee className="h-4 w-4 text-orange-400" /> Charges Ledger</h3>
                <div className="grid gap-3 sm:grid-cols-4">
                  {LR_CHARGE_FIELDS.map(f => (
                    <div key={f.key}>
                      <label className={lbl}>{f.label}</label>
                      <input type="number" min="0" value={charges[f.key]} onChange={e => setCharge(f.key, e.target.value)}
                        placeholder="0" className={inp} />
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-400">Sub Total and GST (CGST+SGST or IGST, based on the matched Route Master entry) are computed automatically when the LR is generated.</p>
              </div>

              {/* ── Terms & Footer (both modes) ── */}
              <Card title="Terms &amp; Footer" icon={<ListChecks className="h-4 w-4 text-orange-400" />}>
                <FSelect label="GST Payable By" value={gstPayableBy} onChange={setGstPayableBy} options={GST_PAYABLE_BY_OPTIONS} />
                <FSelect label="Payment Terms" value={paymentTerms} onChange={setPaymentTerms} options={PAYMENT_TERMS_OPTIONS} />
                <FSelect label="LR Type" value={lrType} onChange={setLrType} options={LR_TYPE_OPTIONS} />
                <FInput label="Delivery At" value={deliveryAt} onChange={setDeliveryAt} placeholder="Door Dly" />
                <FInput label="Prepared By" value={preparedBy} onChange={setPreparedBy} />
                <label className="flex items-center gap-2 pt-6 text-sm text-gray-700">
                  <input type="checkbox" checked={insuranceByCustomer} onChange={e => setInsuranceByCustomer(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400" />
                  Material Insured by Customer
                </label>
                <div className="sm:col-span-2">
                  <FInput label="Remarks" value={remarks} onChange={setRemarks} />
                </div>
              </Card>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              <button onClick={create} disabled={creating}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors shadow-sm">
                {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating LR…</> : <><FileText className="h-4 w-4" /> Generate LR{mode === 'select' ? ` for ${selected!.tracking_id}` : ''}</>}
              </button>
              <p className="text-center text-xs text-gray-400">Every field above can still be edited from the LR detail page after creation.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
