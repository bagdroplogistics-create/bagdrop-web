'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, ExternalLink, CheckCircle, AlertTriangle,
  Loader2, Send, Plus, Trash2, RotateCcw, User, Phone, Mail, Save,
} from 'lucide-react'
import { TIME_OPTIONS } from '@/lib/time-options'
import { searchItems, type BagdropItem } from '@/lib/bagdrop-items'

// ── Types ──────────────────────────────────────────────────────────────
interface Lead {
  id: string; lead_number: string | null; name: string; phone: string
  email: string | null; source: string; service_interest: string | null
  from_city: string | null; to_city: string | null
  pickup_date: string | null; delivery_date: string | null
  pickup_time: string | null; pickup_address: string | null
  drop_address: string | null
  bags_count: number; flight_time: string | null
  flight_number: string | null; pnr: string | null
  notes: string | null; status: string
  zoho_estimate_number: string | null; zoho_estimate_id: string | null
  quote_number: string | null
  return_quote_number: string | null
}

interface RoutePrice {
  found: boolean; subtotal?: number; cgst?: number; sgst?: number
  total?: number; base_price?: number; per_bag_rate?: number
}

interface LineItemRow {
  id: string; name: string; description: string
  qty: number; rate: number; taxId: string
}

// ── Constants ──────────────────────────────────────────────────────────
const ZOHO_ORG_ID  = '60041657788'
const TAX_GST5     = '2568730000000033236'
const SAC_CODE     = '996511'
const SALESPERSONS = ['Saurabh Muley', 'Lata Parmar', 'Vijay Thacker', 'Ankit Patel']

const SOURCES = [
  { value: 'admin',     label: 'Manual Entry' },
  { value: 'website',   label: 'Website' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'phone',     label: 'Phone Call' },
  { value: 'walk-in',   label: 'Walk-in' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook' },
  { value: 'b2b',       label: 'B2B Partner' },
  { value: 'referral',  label: 'Referral' },
]

const SERVICE_TYPES = [
  { value: 'airport-to-doorstep',  label: 'Airport → Doorstep' },
  { value: 'doorstep-to-airport',  label: 'Doorstep → Airport' },
  { value: 'doorstep-to-doorstep', label: 'Doorstep → Doorstep' },
  { value: 'airport-to-airport',   label: 'Airport → Airport' },
]

const LEAD_STATUSES = [
  { value: 'new',       label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost',      label: 'Lost' },
]

const DEFAULT_NOTES = 'Looking forward for your business.'
const DEFAULT_TERMS =
  '1. Booking Confirmation : All bookings are confirmed upon receipt of the total amount payable. - A unique CN (Confirmation) number will be provided for your reference.\n' +
  '2. Total Amount Payable: - The total amount payable for the baggage service is as per the policy.\n' +
  '3. Included Services: - Only the services mentioned above in the Estimate shall be included and the rest shall be charged additionally.\n' +
  '4. Cancellation Policy: - Cancellations must be made 24 hours prior to the scheduled pickup time to receive a full refund.\n' +
  '5. Liability: - Bagdrop\'s liability is limited to the declared value of the baggage as per our standard policy.'

// ── Helpers ────────────────────────────────────────────────────────────
let _rowId = 0
const uid = () => `r_${++_rowId}_${Date.now()}`

function toLocalDate(iso: string | null) { return iso ? iso.slice(0, 10) : '' }
function toLocalTime(iso: string | null) {
  if (!iso) return ''
  const part = iso.includes('T') ? iso.split('T')[1] : iso
  const [h, m] = part.slice(0, 5).split(':').map(Number)
  const snapped = m < 15 ? '00' : m < 45 ? '30' : '00'
  const hSnapped = m >= 45 ? (h + 1) % 24 : h
  return `${String(hSnapped).padStart(2, '0')}:${snapped}`
}
function combineDateTime(date: string, time: string) {
  if (!date || !time) return ''
  return `${date} ${time}`
}
function rupees(n: number) { return '₹' + Math.round(n).toLocaleString('en-IN') }

const inp   = 'w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200'
const inpRO = inp + ' cursor-not-allowed bg-gray-50 text-gray-400'
const lbl   = 'mb-0.5 block text-xs font-medium text-gray-600'
const sect  = 'rounded-xl border border-gray-200 bg-white p-4'
const sectH = 'mb-3 text-xs font-bold uppercase tracking-wider text-gray-400'

// ── ItemSearchLocal ────────────────────────────────────────────────────
function ItemSearchLocal({ value, onTextChange, onSelect }: {
  value: string
  onTextChange: (v: string) => void
  onSelect: (item: BagdropItem) => void
}) {
  const [open, setOpen] = useState(false)
  const results = searchItems(value)

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onTextChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder="Type or click to select an item"
        className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-sm focus:border-orange-300 focus:bg-white focus:outline-none"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 top-full z-50 max-h-52 w-[360px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {results.map(item => (
            <button
              key={item.id}
              onMouseDown={() => { onSelect(item); setOpen(false) }}
              className="w-full px-3 py-2 text-left hover:bg-orange-50 border-b border-gray-50 last:border-0"
            >
              <p className="text-xs font-semibold text-gray-800 leading-tight">{item.name}</p>
              <p className="text-xs text-orange-600 font-bold mt-0.5">₹{item.rate.toLocaleString('en-IN')}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── DateTimeSelect ─────────────────────────────────────────────────────
function DateTimeSelect({ label, dateValue, timeValue, onDateChange, onTimeChange, required, readOnly }: {
  label: string; dateValue: string; timeValue: string
  onDateChange: (v: string) => void; onTimeChange: (v: string) => void
  required?: boolean; readOnly?: boolean
}) {
  return (
    <div>
      <label className={lbl}>{label}{required && <span className="ml-0.5 text-red-400">*</span>}</label>
      {/* grid 1fr+auto keeps date input from collapsing in production */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px' }}>
        <input type="date" value={dateValue} onChange={e => onDateChange(e.target.value)}
          readOnly={readOnly} className={readOnly ? inpRO : inp} />
        <select value={timeValue} onChange={e => onTimeChange(e.target.value)}
          disabled={readOnly}
          style={{ width: '128px' }}
          className={readOnly ? inpRO : inp}>
          <option value="">-- Time --</option>
          {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────
function QuotePageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const leadId       = searchParams.get('lead_id')
  const isEdit       = searchParams.get('edit') === 'true'   // edit mode = no quote generation, just save lead

  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [lead,     setLead]     = useState<Lead | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState('')
  const [saving,   setSaving]   = useState(false)  // for edit mode save

  // ── Customer fields (editable in both new-quote and edit mode) ─────
  const [custName,    setCustName]    = useState('')
  const [custPhone,   setCustPhone]   = useState('')
  const [custEmail,   setCustEmail]   = useState('')
  const [custSource,  setCustSource]  = useState('admin')
  const [custService, setCustService] = useState('')
  const [custStatus,  setCustStatus]  = useState('new')
  const [custNotes2,  setCustNotes2]  = useState('')   // lead-level notes (different from estimate notes)
  const [pnr,         setPnr]         = useState('')
  const [flightNumber, setFlightNumber] = useState('')

  // Route pricing
  const [routePrice,   setRoutePrice]   = useState<RoutePrice | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)

  // Shared schedule/route
  const [fromCity,     setFromCity]     = useState('')
  const [toCity,       setToCity]       = useState('')
  const [bagsCount,    setBagsCount]    = useState('1')
  const [pickupDate,   setPickupDate]   = useState('')
  const [pickupTime,   setPickupTime]   = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [flightDate,   setFlightDate]   = useState('')
  const [flightTime,   setFlightTime]   = useState('')
  const [pickupAddr,   setPickupAddr]   = useState('')
  const [dropAddr,     setDropAddr]     = useState('')

  // Quote-specific header
  const [agentName,   setAgentName]   = useState('')
  const [salesperson, setSalesperson] = useState('Saurabh Muley')
  const [expiryDate,  setExpiryDate]  = useState('')

  // Post-booking custom fields
  const [customerIdNo,  setCustomerIdNo]  = useState('')
  const [bagsPickupTag, setBagsPickupTag] = useState('')
  const [mgasCode,      setMgasCode]      = useState('')

  // Estimate document
  const [subject,    setSubject]    = useState('')
  const [custNotes,  setCustNotes]  = useState(DEFAULT_NOTES)
  const [terms,      setTerms]      = useState(DEFAULT_TERMS)
  const [sendEmail,  setSendEmail]  = useState(false)

  // Line items
  const [lineItems, setLineItems] = useState<LineItemRow[]>([
    { id: uid(), name: '', description: '', qty: 1, rate: 0, taxId: TAX_GST5 },
  ])
  const itemsFromPricing = useRef(false)

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{
    estimate_number: string; estimate_id: string; total: number
    zoho_url: string; sent_to_customer: boolean; is_return_quote?: boolean
  } | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // ── Auth ────────────────────────────────────────────────────────────
  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  // ── Fetch lead ───────────────────────────────────────────────────────
  const fetchLead = useCallback(async () => {
    if (!adminKey || !leadId) { setLoading(false); return }
    const res = await fetch(`/api/admin/leads/${leadId}?key=${adminKey}`)
    if (res.ok) {
      const d: Lead = (await res.json()).lead
      setLead(d)
      // Always populate shared fields from lead
      setFromCity(d.from_city ?? '')
      setToCity(d.to_city ?? '')
      setBagsCount(String(d.bags_count ?? 1))
      if (d.pickup_date) setPickupDate(toLocalDate(d.pickup_date))
      if (d.pickup_time) setPickupTime(d.pickup_time.slice(0, 5))
      setDeliveryDate(toLocalDate(d.delivery_date))
      if (d.flight_time) {
        const ft = d.flight_time.includes('T') ? d.flight_time : d.flight_time.replace(' ', 'T')
        setFlightDate(ft.slice(0, 10)); setFlightTime(toLocalTime(d.flight_time))
      }
      setPickupAddr(d.pickup_address ?? '')
      setDropAddr(d.drop_address ?? '')
      // Populate editable customer fields (always, used in edit mode)
      setCustName(d.name)
      setCustPhone(d.phone)
      setCustEmail(d.email ?? '')
      setCustSource(d.source ?? 'admin')
      setCustService(d.service_interest ?? '')
      setCustStatus(d.status ?? 'new')
      setCustNotes2(d.notes ?? '')
      setPnr(d.pnr ?? '')
      setFlightNumber(d.flight_number ?? '')
    } else setErr('Lead not found')
    setLoading(false)
  }, [adminKey, leadId])

  useEffect(() => { if (authed) fetchLead() }, [authed, fetchLead])

  // ── Route pricing ────────────────────────────────────────────────────
  useEffect(() => {
    if (!fromCity || !toCity || !adminKey) { setRoutePrice(null); return }
    const t = setTimeout(async () => {
      setPriceLoading(true)
      try {
        const qs  = new URLSearchParams({ key: adminKey, from: fromCity, to: toCity, bags: bagsCount || '1' })
        const res = await fetch(`/api/admin/route-pricing/calculate?${qs}`)
        if (res.ok) {
          const p: RoutePrice = await res.json()
          setRoutePrice(p)
          if (p.found && p.base_price != null && !itemsFromPricing.current) {
            populateItemsFromRoute(p, fromCity, toCity, Number(bagsCount) || 1)
          }
        } else setRoutePrice({ found: false })
      } catch { setRoutePrice({ found: false }) }
      setPriceLoading(false)
    }, 500)
    return () => clearTimeout(t)
  }, [fromCity, toCity, bagsCount, adminKey]) // eslint-disable-line

  function populateItemsFromRoute(p: RoutePrice, from: string, to: string, bags: number) {
    const items: LineItemRow[] = [{
      id: uid(), name: `Transportation of Goods (Upto 2 Bags) — ${from} → ${to}`,
      description: 'Airport-to-Doorstep / Doorstep-to-Airport baggage delivery · SAC 996511',
      qty: 1, rate: p.base_price!, taxId: TAX_GST5,
    }]
    if (bags > 2) items.push({
      id: uid(), name: `Additional Bag(s) — ${from} → ${to}`,
      description: 'Per extra bag beyond 2 · SAC 996511',
      qty: bags - 2, rate: p.per_bag_rate ?? 0, taxId: TAX_GST5,
    })
    setLineItems(items); itemsFromPricing.current = true
  }

  // ── Line item helpers ────────────────────────────────────────────────
  function addRow() { setLineItems(prev => [...prev, { id: uid(), name: '', description: '', qty: 1, rate: 0, taxId: TAX_GST5 }]) }
  function removeRow(id: string) { setLineItems(prev => prev.filter(r => r.id !== id)) }
  function updateRow(id: string, field: keyof Omit<LineItemRow, 'id'>, value: string | number) {
    setLineItems(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    itemsFromPricing.current = false
  }
  function resetItems() {
    if (routePrice?.found && routePrice.base_price != null) {
      itemsFromPricing.current = false
      populateItemsFromRoute(routePrice, fromCity, toCity, Number(bagsCount) || 1)
    }
  }

  function selectItem(rowId: string, item: BagdropItem) {
    setLineItems(prev => prev.map(r =>
      r.id === rowId
        ? { ...r, name: item.name, description: item.description ?? '', rate: item.rate }
        : r
    ))
    itemsFromPricing.current = false
  }

  const [discountType,  setDiscountType]  = useState<'pct' | 'fixed'>('pct')
  const [discountPct,   setDiscountPct]   = useState(0)
  const [discountFixed, setDiscountFixed] = useState(0)

  const subtotal    = lineItems.reduce((s, r) => s + r.qty * r.rate, 0)
  const discountAmt = discountType === 'fixed'
    ? Math.min(Math.max(0, discountFixed), subtotal)
    : parseFloat((subtotal * discountPct / 100).toFixed(2))
  const taxableAmt  = subtotal - discountAmt
  const taxAmt      = taxableAmt * 0.05
  const total       = taxableAmt + taxAmt

  // ── Save lead changes (Edit mode) ────────────────────────────────────
  async function saveLeadChanges() {
    if (!custName.trim()) { setErr('Customer name is required.'); return }
    if (!custPhone.trim()) { setErr('Customer phone is required.'); return }
    setSaving(true); setErr('')
    const res = await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        name:             custName.trim(),
        phone:            custPhone.trim(),
        email:            custEmail.trim() || null,
        source:           custSource,
        service_interest: custService || null,
        service_type:     custService || null,
        status:           custStatus,
        from_city:        fromCity.trim() || null,
        to_city:          toCity.trim()   || null,
        bags_count:       Number(bagsCount) || 1,
        pickup_date:      pickupDate  || null,
        delivery_date:    deliveryDate || null,
        pickup_time:      pickupTime  || null,
        pickup_address:   pickupAddr.trim() || null,
        drop_address:     dropAddr.trim()   || null,
        flight_number:    flightNumber.trim() || null,
        flight_time:      combineDateTime(flightDate, flightTime) || null,
        pnr:              pnr.trim() || null,
        notes:            custNotes2.trim() || null,
      }),
    })
    setSaving(false)
    if (res.ok) { setSaveSuccess(true); setTimeout(() => router.push('/admin/leads'), 1200) }
    else { const j = await res.json().catch(() => ({})); setErr(j.error ?? 'Save failed') }
  }

  // ── Generate quote ───────────────────────────────────────────────────
  async function generate() {
    setErr('')
    const effectiveName  = lead?.name  ?? custName.trim()
    const effectivePhone = lead?.phone ?? custPhone.trim()
    if (!effectiveName)  { setErr('Customer name is required.'); return }
    if (!effectivePhone) { setErr('Customer phone is required.'); return }
    if (!pickupAddr.trim()) { setErr('Pickup address is required.'); return }
    const validItems = lineItems.filter(r => r.name.trim() && r.rate > 0)
    if (validItems.length === 0) { setErr('Add at least one item with a name and rate.'); return }

    setGenerating(true)

    let resolvedLeadId = lead?.id ?? null
    if (!resolvedLeadId) {
      const createRes = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          name: effectiveName, phone: effectivePhone, email: custEmail.trim() || null,
          source: custSource, service_interest: custService || null, service_type: custService || null,
          from_city: fromCity.trim() || null, to_city: toCity.trim() || null,
          pickup_date: pickupDate || null, delivery_date: deliveryDate || null, pickup_time: pickupTime || null,
          pickup_address: pickupAddr.trim() || null, drop_address: dropAddr.trim() || null,
          bags_count: Number(bagsCount) || 1, status: 'new',
        }),
      })
      const cj = await createRes.json().catch(() => ({}))
      if (!createRes.ok) {
        // DUPLICATE_PHONE (409): a lead already exists for this phone.
        // Use the existing lead's ID instead of erroring out — the user is
        // simply generating a new quote for a returning customer.
        if (createRes.status === 409 && cj.code === 'DUPLICATE_PHONE' && cj.duplicate_lead?.id) {
          resolvedLeadId = cj.duplicate_lead.id
        } else {
          setErr(cj.error ?? 'Failed to create lead')
          setGenerating(false)
          return
        }
      } else {
        resolvedLeadId = cj.lead?.id ?? null
      }
      if (!resolvedLeadId) { setErr('Failed to get lead ID after creation'); setGenerating(false); return }
    }

    const pickupDT = combineDateTime(pickupDate, pickupTime)
    const flightDT = combineDateTime(flightDate, flightTime)

    const payload: Record<string, unknown> = {
      lead_id:             resolvedLeadId,
      from_city:           fromCity.trim() || undefined,
      to_city:             toCity.trim()   || undefined,
      bags_count:          Number(bagsCount) || undefined,
      pickup_address:      pickupAddr.trim(),
      salesperson_name:    salesperson || undefined,
      explicit_line_items: validItems.map(r => ({ name: r.name, description: r.description, quantity: r.qty, rate: r.rate, tax_id: r.taxId, hsn_or_sac: SAC_CODE })),
      send_email: sendEmail,
      is_return_quote: !!(lead?.quote_number),
    }
    if (agentName.trim())     payload.agent_name       = agentName.trim()
    if (expiryDate)           payload.expiry_date      = expiryDate
    if (pickupDT)             payload.pickup_datetime  = pickupDT
    if (deliveryDate)         payload.delivery_date    = deliveryDate
    if (flightDT)             payload.flight_datetime  = flightDT
    if (subject.trim())       payload.subject          = subject.trim()
    if (custNotes.trim())     payload.customer_notes   = custNotes.trim()
    if (terms.trim())         payload.terms_conditions = terms.trim()
    if (customerIdNo.trim())  payload.customer_id_no   = customerIdNo.trim()
    if (bagsPickupTag.trim()) payload.bags_pickup_tag  = bagsPickupTag.trim()
    if (mgasCode.trim())      payload.mgas_code        = mgasCode.trim()
    if (discountType === 'pct' && discountPct > 0) {
      payload.discount_pct  = discountPct
      payload.discount_type = 'pct'
    } else if (discountType === 'fixed' && discountFixed > 0) {
      payload.discount_fixed_amt = discountFixed
      payload.discount_type      = 'fixed'
    }

    const res = await fetch('/api/admin/zoho/generate-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.message ?? d.error ?? 'Failed to generate quote'); setGenerating(false); return }

    setResult({ estimate_number: d.estimate_number, estimate_id: d.estimate_id, total: d.total, zoho_url: d.zoho_url, sent_to_customer: d.sent_to_customer, is_return_quote: d.is_return_quote })
    if (lead) setLead(l => l ? { ...l, zoho_estimate_number: d.estimate_number, zoho_estimate_id: d.estimate_id } : l)
    setGenerating(false)
  }

  if (!authed) return null
  const today = new Date().toISOString().slice(0, 10)

  // ── Save success ─────────────────────────────────────────────────────
  if (saveSuccess) return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <p className="font-semibold text-gray-900">Changes saved!</p>
        <p className="text-sm text-gray-400 mt-1">Returning to leads…</p>
      </div>
    </div>
  )

  // ── Quote generated success ──────────────────────────────────────────
  if (result) return (
    <>
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <Link href="/admin/leads" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to Leads
        </Link>
      </div>
      <main className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">{result.is_return_quote ? 'Return Quote Saved!' : 'Quote Created!'}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {result.is_return_quote ? 'Return quote' : 'Quote'}: <span className="font-mono font-bold text-blue-700">{result.estimate_number}</span>
        </p>
        <div className="mt-6 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-left text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-semibold">{lead?.name ?? custName}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Route</span><span className="font-semibold">{fromCity} → {toCity}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold text-orange-600">{rupees(result.total)}</span></div>
          {result.sent_to_customer && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
              <Send className="h-3 w-3" /> Estimate emailed to customer
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <Link href={leadId ? `/admin/quotes/view/${leadId}` : '/admin/leads'}
            className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
            <FileText className="h-4 w-4" /> View Estimate
          </Link>
          {result.zoho_url && (
            <a href={result.zoho_url} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <ExternalLink className="h-3.5 w-3.5" /> Open in Books
            </a>
          )}
          <Link href="/admin/leads" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Back to Leads
          </Link>
        </div>
      </main>
    </>
  )

  if (leadId && loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-orange-400" /></div>
  if (leadId && !loading && !lead) return <div className="flex min-h-[50vh] items-center justify-center"><p className="text-sm text-gray-400">{err || 'Lead not found'}</p></div>

  const displayName  = lead?.name  ?? custName
  const displayPhone = lead?.phone ?? custPhone

  // ── FORM ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* Topbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/admin/leads" className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> Leads
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-semibold text-gray-800">{isEdit ? `Edit — ${lead?.lead_number ?? 'Quote'}` : 'New Quote'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lead?.zoho_estimate_number && (
            <a href={`https://books.zoho.in/app/${ZOHO_ORG_ID}#/estimates/${lead.zoho_estimate_id}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
              <ExternalLink className="h-3 w-3" /> {lead.zoho_estimate_number}
            </a>
          )}
          <Link href="/admin/leads" className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </Link>
          {isEdit ? (
            <button onClick={saveLeadChanges} disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save Changes</>}
            </button>
          ) : null}
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><FileText className="h-3.5 w-3.5" /> Generate Quote</>}
          </button>
        </div>
      </div>

      {/* Split panel */}
      <div className="flex h-[calc(100vh-57px)] overflow-hidden min-w-0">

        {/* ── Left form ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-5 space-y-4 min-w-0">

          {lead?.quote_number && !isEdit && !lead?.return_quote_number && (
            <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-purple-500" />
              <span className="text-purple-800">
                Quote <strong>{lead.quote_number}</strong> already exists for this lead.
                {' '}This will be saved as the <strong>Return Journey Quote</strong> — the primary quote will not be changed.
              </span>
            </div>
          )}
          {lead?.return_quote_number && !isEdit && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="text-amber-800">
                Return quote <strong>{lead.return_quote_number}</strong> already exists — generating again will overwrite it.
              </span>
            </div>
          )}

          {/* ── Customer Information ── */}
          <div className={sect}>
            <p className={sectH}><User className="inline h-3.5 w-3.5 mr-1 mb-0.5" />Customer Information</p>

            {/* Always editable when: no lead (new quote) OR isEdit mode */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={lbl}>Full Name <span className="text-red-400">*</span></label>
                <div className="relative">
                  <User className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input type="text" value={custName} onChange={e => setCustName(e.target.value)}
                    readOnly={!!lead && !isEdit}
                    placeholder="Customer full name"
                    className={(!!lead && !isEdit ? inpRO : inp) + ' pl-7'} />
                </div>
              </div>
              <div>
                <label className={lbl}>Phone <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Phone className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)}
                    readOnly={!!lead && !isEdit}
                    placeholder="+91 98765 43210"
                    className={(!!lead && !isEdit ? inpRO : inp) + ' pl-7'} />
                </div>
              </div>
              <div>
                <label className={lbl}>Email</label>
                <div className="relative">
                  <Mail className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)}
                    readOnly={!!lead && !isEdit}
                    placeholder="customer@email.com"
                    className={(!!lead && !isEdit ? inpRO : inp) + ' pl-7'} />
                </div>
              </div>
              <div>
                <label className={lbl}>Source</label>
                <select value={custSource} onChange={e => setCustSource(e.target.value)}
                  disabled={!!lead && !isEdit} className={!!lead && !isEdit ? inpRO : inp}>
                  {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Service Type</label>
                <select value={custService} onChange={e => setCustService(e.target.value)}
                  disabled={!!lead && !isEdit} className={!!lead && !isEdit ? inpRO : inp}>
                  <option value="">— Select service type —</option>
                  {SERVICE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {isEdit && (
                <div>
                  <label className={lbl}>Lead Status</label>
                  <select value={custStatus} onChange={e => setCustStatus(e.target.value)} className={inp}>
                    {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              )}
              {lead && !isEdit && lead.lead_number && (
                <div className="col-span-2">
                  <div className="flex items-center justify-between rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                    <span className="text-xs text-gray-500">Lead</span>
                    <span className="font-mono text-xs font-bold text-orange-600">{lead.lead_number}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quote header fields */}
            <div className="border-t border-gray-100 pt-3 grid grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Reference # (Agent / Partner)</label>
                <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="e.g. M/S Riya Travels" className={inp} />
              </div>
              <div>
                <label className={lbl}>Salesperson</label>
                <select value={salesperson} onChange={e => setSalesperson(e.target.value)} className={inp}>
                  {SALESPERSONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Expiry Date</label>
                <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Quote Date</label>
                <input type="date" value={today} readOnly className={inpRO} />
              </div>
            </div>
          </div>

          {/* ── Route & Schedule ── */}
          <div className={sect}>
            <p className={sectH}>Route &amp; Schedule</p>
            {/* Row 1: From / To / Bags */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className={lbl}>From</label>
                <input type="text" value={fromCity} onChange={e => setFromCity(e.target.value)} placeholder="Ahmedabad" className={inp} />
              </div>
              <div>
                <label className={lbl}>To</label>
                <input type="text" value={toCity} onChange={e => setToCity(e.target.value)} placeholder="Mumbai" className={inp} />
              </div>
              <div>
                <label className={lbl}>No. of Bags</label>
                <input type="number" min="1" value={bagsCount} onChange={e => setBagsCount(e.target.value)} className={inp} />
              </div>
            </div>
            {/* Row 2: Pickup Date+Time / Delivery Date */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <DateTimeSelect label="Pick up Date &amp; Time" dateValue={pickupDate} timeValue={pickupTime} onDateChange={setPickupDate} onTimeChange={setPickupTime} />
              <div>
                <label className={lbl}>Delivery Date</label>
                <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={inp} />
              </div>
            </div>
            {/* Row 3: INTL Flight Date+Time (full left) / Flight Number + PNR (right) */}
            <div className="grid grid-cols-2 gap-3">
              <DateTimeSelect label="INTL Flight Time (Arr/Dep)" dateValue={flightDate} timeValue={flightTime} onDateChange={setFlightDate} onTimeChange={setFlightTime} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Flight Number</label>
                  <input type="text" value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="6E 234" className={inp} />
                </div>
                <div>
                  <label className={lbl}>PNR / Ticket</label>
                  <input type="text" value={pnr} onChange={e => setPnr(e.target.value)} placeholder="6-char PNR" className={inp} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Custom Fields ── */}
          <div className={sect}>
            <p className={sectH}>Custom Fields</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Pick up Address <span className="text-red-400">*</span></label>
                <input type="text" value={pickupAddr} onChange={e => setPickupAddr(e.target.value)}
                  placeholder="Terminal 2, CSIA, Andheri East, Mumbai 400099" className={inp} />
              </div>
              <div>
                <label className={lbl}>Drop / Delivery Address</label>
                <input type="text" value={dropAddr} onChange={e => setDropAddr(e.target.value)}
                  placeholder="Hotel / Home address" className={inp} />
              </div>
              <div>
                <label className={lbl}>Payment Status</label>
                <input type="text" value="Pending" readOnly className={inpRO} />
              </div>
              <div>
                <label className={lbl}>Undertaking Status</label>
                <input type="text" value="Pending" readOnly className={inpRO} />
              </div>
              <div>
                <label className={lbl}>Client Contact Number</label>
                <input type="text" value={displayPhone.replace(/\D/g, '').slice(-10)} readOnly className={inpRO} />
              </div>
              <div>
                <label className={lbl}>Scan &amp; Pay QR</label>
                <div className="flex h-[34px] items-center rounded border border-gray-200 bg-gray-50 px-2.5 text-xs text-gray-400">
                  QR Auto-attached (Bagdrop standard)
                </div>
              </div>
              <div>
                <label className={lbl}>Customer ID No</label>
                <input type="text" value={customerIdNo} onChange={e => setCustomerIdNo(e.target.value)} placeholder="Optional — post-booking" className={inp} />
              </div>
              <div>
                <label className={lbl}>Customer Bags Pickup Tag No</label>
                <input type="text" value={bagsPickupTag} onChange={e => setBagsPickupTag(e.target.value)} placeholder="Optional — post-booking" className={inp} />
              </div>
              <div>
                <label className={lbl}>BagDrop Code No</label>
                <input type="text" value={mgasCode} onChange={e => setMgasCode(e.target.value)} placeholder="Optional — post-booking" className={inp} />
              </div>
            </div>
          </div>

          {/* ── Lead Notes (edit mode) ── */}
          {isEdit && (
            <div className={sect}>
              <p className={sectH}>Notes / Special Instructions</p>
              <textarea rows={3} value={custNotes2} onChange={e => setCustNotes2(e.target.value)}
                placeholder="Any special instructions, weight details, fragile items…" className={inp + ' resize-none'} />
            </div>
          )}

          {/* ── Subject (estimate) ── */}
          <div className={sect}>
            <p className={sectH}>Subject</p>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="Let your customer know what this Quote is for" className={inp} />
          </div>

          {/* ── Item Table ── */}
          <div className={sect + ' overflow-x-auto'}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className={sectH} style={{ marginBottom: 0 }}>Item Table</p>
              </div>
              <div className="flex items-center gap-2">
                {priceLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />}
                {routePrice?.found && (
                  <button onClick={resetItems} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50">
                    <RotateCcw className="h-3 w-3" /> Reset from route pricing
                  </button>
                )}
              </div>
            </div>

            <table className="w-full min-w-0 text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase text-gray-500">
                  <th className="pb-2 pr-2">Item Details</th>
                  <th className="pb-2 px-2 w-14 text-center">Qty</th>
                  <th className="pb-2 px-2 w-28 text-right">Rate (₹)</th>
                  <th className="pb-2 px-2 w-20 text-center">Tax</th>
                  <th className="pb-2 px-2 w-24 text-right">Amount (₹)</th>
                  <th className="pb-2 pl-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineItems.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-xs text-gray-400">No items. Click &ldquo;Add New Row&rdquo; or fill From / To to auto-load from route pricing.</td></tr>
                ) : (
                  lineItems.map(row => (
                    <tr key={row.id} className="group align-top">
                      <td className="py-1.5 pr-2">
                        <ItemSearchLocal
                          value={row.name}
                          onTextChange={v => updateRow(row.id, 'name', v)}
                          onSelect={item => selectItem(row.id, item)}
                        />
                        <input type="text" value={row.description}
                          onChange={e => updateRow(row.id, 'description', e.target.value)}
                          placeholder="Description (optional)"
                          className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-gray-400 focus:border-orange-200 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input type="number" min="1" value={row.qty}
                          onChange={e => updateRow(row.id, 'qty', Number(e.target.value))}
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-center text-sm focus:border-orange-300 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input type="number" min="0" step="100" value={row.rate}
                          onChange={e => updateRow(row.id, 'rate', Number(e.target.value))}
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm focus:border-orange-300 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <select value={row.taxId} onChange={e => updateRow(row.id, 'taxId', e.target.value)}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs focus:border-orange-300 focus:bg-white focus:outline-none">
                          <option value={TAX_GST5}>GST 5%</option>
                        </select>
                      </td>
                      <td className="py-1.5 px-2 text-right text-sm font-medium text-gray-800">{(row.qty * row.rate).toLocaleString('en-IN')}</td>
                      <td className="py-1.5 pl-2">
                        <button onClick={() => removeRow(row.id)} className="mt-1.5 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {lineItems.length > 0 && (
                <tfoot>
                  <tr><td colSpan={6} className="pt-2 pb-1">
                    <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-semibold text-orange-500 hover:text-orange-700">
                      <Plus className="h-3.5 w-3.5" /> Add New Row
                    </button>
                  </td></tr>
                  <tr className="border-t border-gray-200 text-xs text-gray-500">
                    <td colSpan={4} className="pt-2 pr-2 text-right">Sub Total</td>
                    <td className="pt-2 px-2 text-right">{subtotal.toLocaleString('en-IN')}</td>
                    <td></td>
                  </tr>
                  <tr className="text-xs text-gray-500">
                    <td colSpan={3} className="pr-2 text-right">Discount</td>
                    <td className="px-2">
                      <div className="flex items-center justify-end gap-1">
                        {/* Type toggle */}
                        <div className="flex rounded border border-gray-200 overflow-hidden text-[10px] font-semibold">
                          <button type="button"
                            onClick={() => setDiscountType('pct')}
                            className={`px-1.5 py-0.5 transition-colors ${discountType === 'pct' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                            %
                          </button>
                          <button type="button"
                            onClick={() => setDiscountType('fixed')}
                            className={`px-1.5 py-0.5 transition-colors ${discountType === 'fixed' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                            ₹
                          </button>
                        </div>
                        {discountType === 'pct' ? (
                          <input
                            type="number" min="0" max="100" step="0.5"
                            value={discountPct}
                            onChange={e => setDiscountPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                            className="w-14 rounded border border-gray-200 px-1.5 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-orange-300"
                          />
                        ) : (
                          <input
                            type="number" min="0" step="1"
                            value={discountFixed || ''}
                            placeholder="0"
                            onChange={e => setDiscountFixed(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-20 rounded border border-gray-200 px-1.5 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-orange-300"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-2 text-right text-red-500">
                      {discountAmt > 0 ? `-${discountAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="text-xs text-gray-500">
                    <td colSpan={4} className="pr-2 text-right">GST 5% (CGST 2.5% + SGST 2.5%)</td>
                    <td className="px-2 text-right">{Math.round(taxAmt).toLocaleString('en-IN')}</td>
                    <td></td>
                  </tr>
                  <tr className="text-sm font-bold text-gray-900">
                    <td colSpan={4} className="pt-1 pr-2 text-right">Total (₹)</td>
                    <td className="pt-1 px-2 text-right text-orange-600">{rupees(total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
            {lineItems.length === 0 && (
              <button onClick={addRow} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-orange-500 hover:text-orange-700">
                <Plus className="h-3.5 w-3.5" /> Add New Row
              </button>
            )}
          </div>

          {/* ── Estimate Notes ── */}
          <div className={sect}>
            <p className={sectH}>Customer Notes</p>
            <textarea rows={3} value={custNotes} onChange={e => setCustNotes(e.target.value)}
              placeholder="Visible to customer on the estimate PDF" className={inp + ' resize-none'} />
          </div>

          {/* ── Terms ── */}
          <div className={sect}>
            <p className={sectH}>Terms &amp; Conditions</p>
            <textarea rows={5} value={terms} onChange={e => setTerms(e.target.value)}
              className={inp + ' resize-y font-mono text-xs leading-relaxed'} />
          </div>

          {/* ── Send email ── */}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-orange-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Send estimate email to customer</p>
              <p className="text-xs text-gray-400">Estimate PDF will be emailed to {(lead?.email ?? custEmail) || (lead?.phone ?? custPhone) || 'customer'} immediately after creation.</p>
            </div>
          </label>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-semibold text-red-700">Error</p>
              <p className="mt-0.5 text-sm text-red-600">{err}</p>
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="w-60 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-400">
            {isEdit ? 'Edit Summary' : 'Quote Summary'}
          </p>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Customer</p>
              <p className="font-semibold text-gray-900">{displayName || '—'}</p>
              <p className="text-xs text-gray-500">{displayPhone || '—'}</p>
            </div>
            {lead?.lead_number && <div><p className="text-xs text-gray-400">Lead #</p><p className="font-mono font-bold text-orange-600 text-xs">{lead.lead_number}</p></div>}
            <div><p className="text-xs text-gray-400">Route</p><p className="font-semibold">{fromCity || '—'} → {toCity || '—'}</p></div>
            <div><p className="text-xs text-gray-400">Bags</p><p className="font-semibold">{bagsCount}</p></div>
            {pickupDate && <div><p className="text-xs text-gray-400">Pickup</p><p className="text-xs font-semibold">{pickupDate} {pickupTime}</p></div>}
            {deliveryDate && <div><p className="text-xs text-gray-400">Delivery</p><p className="text-xs font-semibold">{deliveryDate}</p></div>}
            <div><p className="text-xs text-gray-400">Salesperson</p><p className="font-semibold">{salesperson}</p></div>
            <div><p className="text-xs text-gray-400">Items</p><p className="font-semibold">{lineItems.length} row{lineItems.length !== 1 ? 's' : ''}</p></div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400">Estimated Total</p>
              <p className="text-xl font-black text-orange-600">{lineItems.length > 0 ? rupees(total) : '—'}</p>
              {discountAmt > 0 && (
                <p className="text-xs font-semibold text-red-500">
                  Discount: −{rupees(discountAmt)}
                  {discountType === 'pct' ? ` (${discountPct}%)` : ' (fixed)'}
                </p>
              )}
              <p className="text-xs text-gray-400">incl. 5% GST</p>
            </div>

            {isEdit && (
              <button onClick={saveLeadChanges} disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save Changes</>}
              </button>
            )}

            <button onClick={generate} disabled={generating}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
              {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><FileText className="h-3.5 w-3.5" /> {lead?.quote_number ? 'Generate Return Quote' : 'Generate Quote'}</>}
            </button>

            <div className="pt-2 space-y-1 text-xs text-gray-400">
              <p className="font-semibold text-gray-500">Auto-set by system:</p>
              <p>✓ Payment Status: Pending</p>
              <p>✓ Undertaking: Pending</p>
              <p>✓ Scan &amp; Pay QR</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Suspense wrapper (required by Next.js 15 for useSearchParams) ───────
export default function GenerateQuotePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-orange-400" />
      </div>
    }>
      <QuotePageInner />
    </Suspense>
  )
}
