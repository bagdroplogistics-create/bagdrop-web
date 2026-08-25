'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, ExternalLink, CheckCircle, AlertTriangle,
  Loader2, Send, Plus, Trash2, RotateCcw, User, Phone, Mail, Save, Search,
  Building2,
} from 'lucide-react'
import { TIME_OPTIONS } from '@/lib/time-options'
import { searchItems, type BagdropItem } from '@/lib/bagdrop-items'
import { PhoneInput } from '@/components/ui/phone-input'
import { parseStoredPhone, toE164 } from '@/lib/phone-format'
import { SOURCE_LABELS } from '@/lib/lead-source'
import {
  TITLE_OPTIONS, DEFAULT_TITLE, formatCustomerName,
  CUSTOMER_TYPES, DEFAULT_CUSTOMER_TYPE, type CustomerType,
  PAYMENT_TERMS_OPTIONS, DEFAULT_PAYMENT_TERMS,
} from '@/lib/constants'

// ── Types ──────────────────────────────────────────────────────────────
interface QuoteLineItem {
  name:         string
  description?: string | null
  quantity:     number
  rate:         number
  tax_pct?:     number
  hsn_or_sac?:  string
  amount?:      number
}

interface Lead {
  id: string; lead_number: string | null; title?: string | null; name: string; phone: string
  phone_country_code?: string | null; phone_national?: string | null
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
  // Saved quote/pricing data — must be reloaded in full when editing,
  // regardless of whether the route exists in the Route Map.
  quote_line_items:   QuoteLineItem[] | null
  quote_discount_pct: number | null
  quote_discount_amt: number | null
  quote_subject:      string | null
  quote_notes:        string | null
  quote_terms:        string | null
  quote_expiry_date:  string | null
  salesperson_name:   string | null
  agent_name:          string | null
  payment_status:      'pending' | 'received' | null
  // Business Customer support — all optional/nullable, additive
  customer_type?:       string | null
  business_name?:       string | null
  business_address?:    string | null
  gst_number?:          string | null
  payment_terms?:       string | null
}

interface RoutePrice {
  found: boolean; subtotal?: number; cgst?: number; sgst?: number
  total?: number; base_price?: number; per_bag_rate?: number
}

// Matches app/api/admin/customers/search/route.ts's response shape.
// No "gender" field — there is no such column anywhere in the schema
// (see that route's comment); deliberately not fabricated here.
interface ExistingCustomer {
  title: string | null; name: string; phone: string; email: string | null
  pickup_address: string | null; drop_address: string | null
  total_bookings: number; last_activity: string
  // Business Customer fields — present only for a customer whose most
  // recent lead had customer_type = 'business'. See requirement #9: an
  // existing Business customer's details fill in automatically on select.
  customer_type?:       string | null
  business_name?:       string | null
  business_address?:    string | null
  gst_number?:          string | null
  payment_terms?:       string | null
}

interface LineItemRow {
  id: string; name: string; description: string
  qty: number; rate: number; taxId: string
  // Optional flat-amount override. When set, this exact amount is used as
  // the row's Amount (both on-screen and when saved/sent to the quote API)
  // INSTEAD of qty × rate. Exists solely for the auto-populated "Upto 2
  // Bags" route-pricing row: the founder wants Qty to visually reflect the
  // real bag count (1 or 2) while the flat "up to 2 bags" price itself
  // never gets multiplied by that quantity (founder instruction,
  // 2026-08-20 — fixes a regression from the 2026-08-19 Qty-display
  // change, which had started doubling the price for 2-bag quotes because
  // Amount was always computed as qty × rate). Cleared automatically the
  // moment the admin manually edits that row's Qty/Rate or picks a
  // different catalog item, so manual edits behave like any normal line
  // item (Amount = qty × rate) — this override is never user-facing.
  amount?: number
}

// ── Constants ──────────────────────────────────────────────────────────
const ZOHO_ORG_ID  = '60041657788'
const TAX_GST5     = '2568730000000033236'
const SAC_CODE     = '996511'
const SALESPERSONS = ['Vijay Thacker']

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
  '3. Included Services : - Only the services mentioned above in the Estimate shall be included and the company reserves all rights to Cancel at any point.\n' +
  '4. Prohibited Items: - Luggage should not contain any items prohibited by the government or legal system. - Alcohol and Illegal substance is strictly prohibited. All bags are processed through the Govt Screening processes.\n' +
  '5. Assistance and Queries: - For any assistance or queries, clients can contact BAGDROP at 63 5711 5711 / 63 5733 5733 or via email at info@bagdrop.co\n' +
  '6. Payment Confirmation: - Clients are requested to share a screenshot of the payment confirmation for booking verification.\n' +
  '7. Cancellation Policy: - Cancellations must be made at least 96 Hours before the scheduled pick-up time to receive a full refund.\n' +
  '8. Liability: - BAGDROP is not liable for any loss, damage, or theft of items during transportation. - Clients are advised to secure valuable items and carry essential documents with them. No Illegal items and Alcohol shall be kept in the luggage bags given for Shipment.\n' +
  '9. The services are subject to availability at the time of booking. The rates may vary or change at any time without any prior Notice.\n' +
  '10. Terms Acceptance: - Booking with BAGDROP implies acceptance of these terms and conditions. We appreciate your trust in BAGDROP for your baggage transportation needs. If you have any questions or concerns, please don\'t hesitate to reach out to us.'

// ── Helpers ────────────────────────────────────────────────────────────
let _rowId = 0
const uid = () => `r_${++_rowId}_${Date.now()}`

// Founder spec 2026-08-25 — Subject auto-generated from Pickup/Delivery
// Location, so admins never retype "Transportation of Goods From X to Y" by
// hand. Degrades gracefully while either side is still blank (a brand new
// manual quote before the admin has picked a route yet): both blank →
// just the fixed prefix; only one side filled → prefix + that side. See the
// subjectAutoValue-tracking effect in the component below for how this
// stays in sync with From City / To City without clobbering a subject an
// admin has deliberately customized away from the auto-generated pattern.
function buildQuoteSubject(from: string, to: string): string {
  const f = from.trim()
  const t = to.trim()
  if (!f && !t) return 'Transportation of Goods From'
  if (f && t)   return `Transportation of Goods From ${f} to ${t}`
  if (f)        return `Transportation of Goods From ${f} to`
  return `Transportation of Goods From to ${t}`
}

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
  const [custTitle,   setCustTitle]   = useState<string>(DEFAULT_TITLE)
  const [custName,    setCustName]    = useState('')
  const [custPhone,   setCustPhone]   = useState('')       // national digits only — see PhoneInput
  const [custCountryIso2, setCustCountryIso2] = useState('IN')
  const [custEmail,   setCustEmail]   = useState('')

  // ── Existing website/contact-form inquiry check (2026-08-25) ──────────
  // Live, non-blocking inline warning (checked on every phone/email
  // change) — purely informational, shown alongside the form so the admin
  // can catch a duplicate before they even try to submit. The actual
  // enforcement is server-side on POST /api/admin/leads (see
  // lib/duplicate-inquiry-check.ts and dupModal below), so this can never
  // itself block a legitimate new inquiry — worst case it's just wrong/
  // stale for a moment while the debounce settles.
  const [inlineDuplicate, setInlineDuplicate] = useState<{
    id: string; lead_number: string | null; tracking_id: string | null
    name: string; source: string; created_at: string
  } | null>(null)
  // The hard-stop modal shown when Generate itself hits the 409 guard.
  const [dupModal, setDupModal] = useState<typeof inlineDuplicate>(null)
  const [custSource,  setCustSource]  = useState('admin')
  const [custService, setCustService] = useState('')
  const [custStatus,  setCustStatus]  = useState('new')
  const [custNotes2,  setCustNotes2]  = useState('')   // lead-level notes (different from estimate notes)
  const [pnr,         setPnr]         = useState('')
  const [flightNumber, setFlightNumber] = useState('')

  // ── Business Customer support ──────────────────────────────────────
  // "Payment By" selector: Individual (default, unchanged behavior) vs
  // Business / Company. The Business Information card below is only
  // shown when Business / Company is selected — purely a UI/UX choice
  // so admins quoting an ordinary individual customer never see business
  // fields. None of the fields inside are marked required in the UI and
  // leaving them blank never blocks quote/booking creation.
  // See supabase/migrations/20260807_business_customer_fields.sql.
  const [paymentBy, setPaymentBy] = useState<CustomerType>(DEFAULT_CUSTOMER_TYPE)
  const [businessName,    setBusinessName]    = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [gstNumber,       setGstNumber]       = useState('')
  const [paymentTerms,    setPaymentTerms]    = useState(DEFAULT_PAYMENT_TERMS)

  // ── "Select Existing Customer" autocomplete (new-quote only) ──────
  // Purely a convenience layer above the existing Customer Information
  // fields above — it only ever calls the same setCustX setters those
  // fields already use, so nothing about the existing New Quote workflow
  // changes. Ignoring this field entirely (for a brand-new customer)
  // behaves exactly as before.
  const [custSearchQ,       setCustSearchQ]       = useState('')
  const [custSearchResults, setCustSearchResults] = useState<ExistingCustomer[]>([])
  const [custSearchLoading, setCustSearchLoading] = useState(false)
  const [custSearchOpen,    setCustSearchOpen]    = useState(false)

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
  const [salesperson, setSalesperson] = useState('Vijay Thacker')
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
  // Tracks the exact string the Subject-auto-fill effect (below) last wrote
  // into `subject` — used to tell "still exactly what we auto-generated, so
  // safe to keep syncing on every From/To City change" apart from "the admin
  // has typed something different into Subject, so leave it alone from now
  // on". Same non-destructive-auto-fill pattern as itemsFromPricing/
  // lastAutoFillBags above (Qty-sync fix, 2026-08-24) — populate/re-sync
  // automatically until the admin's own edit diverges from it.
  const subjectAutoValue = useRef<string | null>(null)

  // ── Return Trip ──────────────────────────────────────────────────────
  // Trip Type only applies to a fresh lead with no primary quote yet — once
  // lead.quote_number exists, the backend already auto-detects return-quote
  // mode on its own (that's the pre-existing behavior reached via the
  // "Return Quote" button on the Leads tab, and it can't be turned off here
  // — it's a safety net against accidentally overwriting a primary quote).
  // For a brand-new lead, choosing "Return Trip" here shows a full Return
  // Journey Details section and — on Generate — fires a SECOND
  // generate-quote call right after the onward one succeeds, so both legs
  // are created from one click.
  const [tripType, setTripType] = useState<'one_way' | 'return'>('one_way')
  const [returnFromCity,    setReturnFromCity]    = useState('')
  const [returnToCity,      setReturnToCity]      = useState('')
  const [returnBagsCount,   setReturnBagsCount]   = useState('1')
  const [returnPickupDate,  setReturnPickupDate]  = useState('')
  const [returnPickupTime,  setReturnPickupTime]  = useState('')
  const [returnPickupAddr,  setReturnPickupAddr]  = useState('')
  const [returnDropAddr,    setReturnDropAddr]    = useState('')
  const [returnNotes,       setReturnNotes]       = useState('')
  const [returnRoutePrice,   setReturnRoutePrice]   = useState<RoutePrice | null>(null)
  const [returnPriceLoading, setReturnPriceLoading] = useState(false)
  const [returnLineItems,    setReturnLineItems]    = useState<LineItemRow[]>([])
  const returnItemsFromPricing = useRef(false)
  // Same 2026-08-24 fix as lastAutoFillBags above, mirrored for the return
  // journey's Item Table.
  const lastAutoFillReturnBags = useRef<number | null>(null)

  function enableReturnTrip() {
    setTripType('return')
    // Prefill once, first time it's turned on — reversed route + swapped
    // addresses (the return leg's pickup is usually the onward drop, and
    // vice versa). All fields stay fully editable afterward.
    if (!returnFromCity && !returnToCity) { setReturnFromCity(toCity); setReturnToCity(fromCity) }
    if (!returnPickupAddr && !returnDropAddr) { setReturnPickupAddr(dropAddr); setReturnDropAddr(pickupAddr) }
    if (returnBagsCount === '1' && bagsCount && bagsCount !== '1') setReturnBagsCount(bagsCount)
  }

  function populateReturnItemsFromRoute(p: RoutePrice, from: string, to: string, bags: number) {
    const items: LineItemRow[] = [{
      id: uid(), name: `Transportation of Goods (Upto 2 Bags) — ${from} → ${to}`,
      // Description sub-line removed per founder request (2026-08-19) —
      // "Airport-to-Doorstep..." text no longer appears anywhere this
      // quote's line items are shown (quote preview, PDF, or any invoice
      // later generated from it). Not replaced with anything else.
      description: '',
      // Qty reflects the real bag count, capped at 2 (this item covers
      // "up to 2 bags") — was hardcoded to 1 regardless of whether the
      // customer had 1 or 2 bags, which read as if only 1 bag was
      // covered. `rate` (p.base_price!) is deliberately untouched per
      // founder instruction (2026-08-19) — the flat "up to 2 bags" price
      // itself is not being recalculated, only the displayed quantity.
      // `amount` is pinned to the flat p.base_price! (not qty × rate) —
      // see the LineItemRow.amount doc comment for why this exists.
      qty: Math.min(bags, 2), rate: p.base_price!, taxId: TAX_GST5, amount: p.base_price!,
    }]
    if (bags > 2) items.push({
      id: uid(), name: `Additional Bag(s) — ${from} → ${to}`,
      description: '',
      // Per-extra-bag row — no amount override; multiplies normally.
      qty: bags - 2, rate: p.per_bag_rate ?? 0, taxId: TAX_GST5,
    })
    setReturnLineItems(items); returnItemsFromPricing.current = true
    lastAutoFillReturnBags.current = bags
  }

  function updateReturnRow(id: string, field: keyof Omit<LineItemRow, 'id'>, value: string | number) {
    setReturnLineItems(prev => prev.map(r => r.id === id
      // Same override-clearing behavior as updateRow() above.
      ? { ...r, [field]: value, ...(field === 'qty' || field === 'rate' ? { amount: undefined } : {}) }
      : r
    ))
    returnItemsFromPricing.current = false
  }
  function addReturnRow() { setReturnLineItems(prev => [...prev, { id: uid(), name: '', description: '', qty: 1, rate: 0, taxId: TAX_GST5 }]) }
  function removeReturnRow(id: string) { setReturnLineItems(prev => prev.filter(r => r.id !== id)) }

  // Line items
  const [lineItems, setLineItems] = useState<LineItemRow[]>([
    { id: uid(), name: '', description: '', qty: 1, rate: 0, taxId: TAX_GST5 },
  ])
  const itemsFromPricing = useRef(false)
  // Bag count the auto-fill row was last built for (2026-08-24 fix). The
  // route-pricing effect below used to ONLY populate once — itemsFromPricing
  // latches to true after the first fill and then blocks every future run,
  // so changing "No. of Bags" AFTER that first auto-fill never updated the
  // flat-price row's Qty (it stayed frozen at whatever bag count was set
  // when the effect first fired; Amount stayed correctly flat, only Qty
  // went stale). Tracking the bags count separately lets the effect
  // re-populate specifically when the admin changes bag count, while still
  // never touching a saved quote's custom items in edit mode (that path
  // never sets this ref, so it stays null) and still stopping the moment
  // the admin manually edits a row (updateRow/selectItem reset
  // itemsFromPricing to false, which already re-opens the guard on its own).
  const lastAutoFillBags = useRef<number | null>(null)

  const [generating, setGenerating] = useState(false)
  // Set once the onward quote has been created for a fresh lead (Return
  // Trip flow). Lets a retry — e.g. after the return leg failed because
  // Return Journey Items was empty — reuse the same lead and skip
  // re-creating the onward quote, instead of duplicating it.
  const [createdLeadId, setCreatedLeadId]   = useState<string | null>(null)
  const [onwardQuote,   setOnwardQuote]     = useState<{ estimate_number: string; estimate_id: string | null; total: number; zoho_url: string; sent_to_customer: boolean } | null>(null)
  const [result, setResult] = useState<{
    estimate_number: string; estimate_id: string | null; total: number
    zoho_url: string; sent_to_customer: boolean; is_return_quote?: boolean
    // Populated only when Trip Type = Return Trip generated both legs in one click
    return_estimate_number?: string; return_total?: number
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
      // Populate editable customer fields (always, used in edit mode).
      // Re-parses the stored E.164 string so the correct flag/dial code
      // shows automatically instead of defaulting back to India.
      setCustTitle(d.title && TITLE_OPTIONS.includes(d.title as never) ? d.title : DEFAULT_TITLE)
      setCustName(d.name)
      const parsedPhone = parseStoredPhone(d.phone)
      setCustPhone(parsedPhone.nationalNumber)
      setCustCountryIso2(d.phone_country_code || parsedPhone.iso2)
      setCustEmail(d.email ?? '')
      setCustSource(d.source ?? 'admin')
      setCustService(d.service_interest ?? '')
      setCustStatus(d.status ?? 'new')
      setCustNotes2(d.notes ?? '')
      setPnr(d.pnr ?? '')
      setFlightNumber(d.flight_number ?? '')

      // Business Customer fields — reload in full when editing, same
      // reasoning as every other field above.
      setPaymentBy(d.customer_type === 'business' ? 'business' : DEFAULT_CUSTOMER_TYPE)
      setBusinessName(d.business_name ?? '')
      setBusinessAddress(d.business_address ?? '')
      setGstNumber(d.gst_number ?? '')
      setPaymentTerms(d.payment_terms ?? DEFAULT_PAYMENT_TERMS)

      // Editing an existing quote: reload EVERY previously saved value —
      // pricing, discount, payment status, notes, etc. — regardless of
      // whether the route exists in the Route Map. Without this, quotes
      // built on a custom/manual route (not in Route Map) would open with
      // an empty pricing table because the auto route-pricing lookup below
      // finds nothing for that route and there'd be nothing to fall back on.
      if (isEdit) {
        if (d.quote_line_items && d.quote_line_items.length > 0) {
          setLineItems(d.quote_line_items.map(li => ({
            id:          uid(),
            name:        li.name ?? '',
            description: li.description ?? '',
            qty:         li.quantity ?? 1,
            rate:        li.rate ?? 0,
            // Was dropped here entirely, so every edit-mode row fell back
            // to the qty*rate calc below (subtotal uses r.amount ?? r.qty
            // * r.rate) instead of the flat amount actually saved on this
            // quote — e.g. Vadodara→Delhi "Upto 2 Bags" (qty 2, rate
            // 10000) showed Amount 20,000 on re-open instead of the real
            // flat 10,000. This mirrors the same amount-override fix
            // already applied to populateItemsFromRoute (create mode).
            amount:      li.amount ?? undefined,
            taxId:       TAX_GST5,
          })))
          // Mark items as already resolved so the route-pricing effect below
          // does not overwrite this saved data (found or not found in Route Map).
          itemsFromPricing.current = true
        }
        if (d.quote_discount_amt != null && d.quote_discount_amt > 0) {
          setDiscountType('fixed'); setDiscountFixed(d.quote_discount_amt)
        } else if (d.quote_discount_pct != null && d.quote_discount_pct > 0) {
          setDiscountType('pct'); setDiscountPct(d.quote_discount_pct)
        }
        if (d.payment_status === 'pending' || d.payment_status === 'received') {
          setPaymentStatus(d.payment_status)
        }
        setSubject(d.quote_subject ?? '')
        // If this quote's saved Subject was itself auto-generated (never
        // customized) when it was first created, re-arm the auto-sync latch
        // so editing From/To City here keeps it in sync too — otherwise
        // leave the latch unset (null) so a genuinely custom subject is
        // never silently overwritten. Compares against the ROUTE fields as
        // loaded from this same lead, matching what the auto-fill effect
        // below will compute once fromCity/toCity settle to these values.
        if (d.quote_subject && d.quote_subject === buildQuoteSubject(d.from_city ?? '', d.to_city ?? '')) {
          subjectAutoValue.current = d.quote_subject
        }
        setCustNotes(d.quote_notes ?? DEFAULT_NOTES)
        setTerms(d.quote_terms ?? DEFAULT_TERMS)
        setExpiryDate(d.quote_expiry_date ? toLocalDate(d.quote_expiry_date) : '')
        if (d.salesperson_name) setSalesperson(d.salesperson_name)
        setAgentName(d.agent_name ?? '')
      }
    } else setErr('Lead not found')
    setLoading(false)
  }, [adminKey, leadId, isEdit])

  useEffect(() => { if (authed) fetchLead() }, [authed, fetchLead])

  // ── Auto-generate Subject from Pickup/Delivery Location ────────────
  // Founder spec 2026-08-25: Subject should read "Transportation of Goods
  // From {Pickup} to {Delivery}" automatically — for a brand-new manual
  // quote (fromCity/toCity still blank, generates just the fixed prefix so
  // the admin never retypes it), for a quote opened from any inquiry source
  // (fromCity/toCity load from the lead's own from_city/to_city — this
  // effect fires the moment fetchLead sets them), and it re-syncs live if
  // the admin edits From City / To City afterward. Never overwrites a
  // Subject the admin has deliberately customized away from the
  // auto-generated pattern — see subjectAutoValue's doc comment above.
  useEffect(() => {
    const generated = buildQuoteSubject(fromCity, toCity)
    setSubject(prev => {
      if (prev !== '' && prev !== subjectAutoValue.current) return prev // admin customized it — leave alone
      subjectAutoValue.current = generated
      return generated
    })
  }, [fromCity, toCity])

  // ── "Select Existing Customer" search (debounced, new-quote only) ──
  // Fetches as soon as the field is focused (custSearchOpen), even with
  // an empty query — matches the Zoho-style picker in the reference
  // screenshot, which shows the full customer list immediately on click
  // rather than waiting for the admin to type something first. Typing
  // narrows the same list via the server-side filter.
  useEffect(() => {
    if (lead || !custSearchOpen || !adminKey) return
    setCustSearchLoading(true)
    const t = setTimeout(async () => {
      try {
        const qs  = new URLSearchParams({ key: adminKey, q: custSearchQ.trim() })
        const res = await fetch(`/api/admin/customers/search?${qs}`)
        const j   = await res.json()
        setCustSearchResults(res.ok ? (j.customers ?? []) : [])
      } catch {
        setCustSearchResults([])
      } finally {
        setCustSearchLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [custSearchQ, adminKey, lead, custSearchOpen])

  // ── Live duplicate-inquiry check (debounced, new-quote only) ──────────
  // Founder spec 2026-08-25 UI Improvements: warn as soon as phone/email
  // matches an existing still-open website/contact-form/mobile-app inquiry
  // for the SAME trip date — before the admin even reaches Generate.
  // Purely informational (see inlineDuplicate's doc comment above); `lead`
  // being set means this page is already working an existing/edit record,
  // so there's nothing to check against itself.
  //
  // 2026-08-25 follow-up — "Different Trip / Inquiry Date = New Inquiry":
  // pickupDate/fromCity/toCity now feed into the match too (see
  // findOpenWebsiteInquiry's doc comment), so this only ever fires for the
  // SAME trip, never just because the same customer is booking a second,
  // genuinely different one. No pickupDate yet = nothing to check against
  // (the server always requires it before matching), so this effect simply
  // stays quiet until the admin fills one in.
  useEffect(() => {
    if (lead || !adminKey) { setInlineDuplicate(null); return }
    const phoneE164 = custPhone.trim() ? toE164(custPhone, custCountryIso2) : ''
    const email     = custEmail.trim()
    if ((!phoneE164 && !email) || !pickupDate) { setInlineDuplicate(null); return }
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          key: adminKey,
          pickup_date: pickupDate,
          ...(phoneE164 ? { phone: phoneE164 } : {}),
          ...(email ? { email } : {}),
          ...(fromCity.trim() ? { from_city: fromCity.trim() } : {}),
          ...(toCity.trim()   ? { to_city:   toCity.trim()   } : {}),
        })
        const res = await fetch(`/api/admin/leads/check-duplicate?${qs}`)
        const j   = await res.json().catch(() => ({}))
        setInlineDuplicate(res.ok ? (j.duplicate ?? null) : null)
      } catch {
        setInlineDuplicate(null)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [custPhone, custCountryIso2, custEmail, pickupDate, fromCity, toCity, adminKey, lead])

  // Fills in the same fields the Customer Information section below
  // already exposes for manual entry — nothing new is written anywhere
  // that the admin couldn't already type in by hand.
  function selectExistingCustomer(c: ExistingCustomer) {
    if (c.title && TITLE_OPTIONS.includes(c.title as never)) setCustTitle(c.title)
    setCustName(c.name)
    const parsed = parseStoredPhone(c.phone)
    setCustPhone(parsed.nationalNumber)
    setCustCountryIso2(parsed.iso2)
    if (c.email) setCustEmail(c.email)
    if (c.pickup_address) setPickupAddr(c.pickup_address)
    if (c.drop_address) setDropAddr(c.drop_address)

    // Business Customer fields — requirement #9: selecting an existing
    // Business customer auto-fills everything below (and switches
    // Payment By to Business/Company so the fields become visible),
    // alongside the Individual fields above, same as the rest of this
    // function.
    if (c.customer_type === 'business') {
      setPaymentBy('business')
      if (c.business_name)    setBusinessName(c.business_name)
      if (c.business_address) setBusinessAddress(c.business_address)
      if (c.gst_number)       setGstNumber(c.gst_number)
      if (c.payment_terms)    setPaymentTerms(c.payment_terms)
    }

    setCustSearchQ('')
    setCustSearchResults([])
    setCustSearchOpen(false)
  }

  // Shared by every lead create/update call below (new lead, Edit save,
  // duplicate-phone sync) so all three stay consistent. Business fields
  // are explicitly nulled out when Payment By = Individual, so switching
  // back from Business/Company doesn't leave stale data behind on save.
  // None of these fields are required — an admin can select Business/
  // Company and still leave Name/Address/GST/Terms blank with no
  // validation error; this just controls what gets written.
  function businessFieldsPayload(): Record<string, unknown> {
    if (paymentBy !== 'business') {
      return {
        customer_type:    'individual',
        business_name:    null,
        business_address: null,
        gst_number:       null,
      }
    }
    return {
      customer_type:     'business',
      business_name:     businessName.trim()    || null,
      business_address:  businessAddress.trim() || null,
      gst_number:        gstNumber.trim()       || null,
      payment_terms:     paymentTerms           || DEFAULT_PAYMENT_TERMS,
    }
  }

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
          const wantBags = Number(bagsCount) || 1
          // Populate on first fill (!itemsFromPricing.current), OR
          // re-populate when the admin has changed "No. of Bags" since the
          // last auto-fill (lastAutoFillBags.current !== null — never true
          // for a saved quote loaded in edit mode, since that path sets
          // itemsFromPricing.current directly without ever calling
          // populateItemsFromRoute — so this can never override edit mode's
          // protection of custom saved items).
          const bagsChangedSinceFill = lastAutoFillBags.current !== null && lastAutoFillBags.current !== wantBags
          if (p.found && p.base_price != null && (!itemsFromPricing.current || bagsChangedSinceFill)) {
            populateItemsFromRoute(p, fromCity, toCity, wantBags)
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
      // Description sub-line removed per founder request (2026-08-19) —
      // "Airport-to-Doorstep..." text no longer appears anywhere this
      // quote's line items are shown (quote preview, PDF, or any invoice
      // later generated from it). Not replaced with anything else.
      description: '',
      // Qty reflects the real bag count, capped at 2 (this item covers
      // "up to 2 bags") — was hardcoded to 1 regardless of whether the
      // customer had 1 or 2 bags, which read as if only 1 bag was
      // covered. `rate` (p.base_price!) is deliberately untouched per
      // founder instruction (2026-08-19) — the flat "up to 2 bags" price
      // itself is not being recalculated, only the displayed quantity.
      // `amount` is pinned to the flat p.base_price! (not qty × rate) —
      // see the LineItemRow.amount doc comment above for why this exists.
      qty: Math.min(bags, 2), rate: p.base_price!, taxId: TAX_GST5, amount: p.base_price!,
    }]
    if (bags > 2) items.push({
      id: uid(), name: `Additional Bag(s) — ${from} → ${to}`,
      description: '',
      // Per-extra-bag row — no amount override; each additional bag really
      // does cost qty × per_bag_rate, so it multiplies normally.
      qty: bags - 2, rate: p.per_bag_rate ?? 0, taxId: TAX_GST5,
    })
    setLineItems(items); itemsFromPricing.current = true
    lastAutoFillBags.current = bags
  }

  // ── Return journey route pricing — mirrors the onward effect above,
  // only runs once Trip Type is set to Return Trip ──────────────────────
  useEffect(() => {
    if (tripType !== 'return' || !returnFromCity || !returnToCity || !adminKey) { setReturnRoutePrice(null); return }
    const t = setTimeout(async () => {
      setReturnPriceLoading(true)
      try {
        const qs  = new URLSearchParams({ key: adminKey, from: returnFromCity, to: returnToCity, bags: returnBagsCount || '1' })
        const res = await fetch(`/api/admin/route-pricing/calculate?${qs}`)
        if (res.ok) {
          const p: RoutePrice = await res.json()
          setReturnRoutePrice(p)
          const wantReturnBags = Number(returnBagsCount) || 1
          const returnBagsChangedSinceFill = lastAutoFillReturnBags.current !== null && lastAutoFillReturnBags.current !== wantReturnBags
          if (p.found && p.base_price != null && (!returnItemsFromPricing.current || returnBagsChangedSinceFill)) {
            populateReturnItemsFromRoute(p, returnFromCity, returnToCity, wantReturnBags)
          }
        } else setReturnRoutePrice({ found: false })
      } catch { setReturnRoutePrice({ found: false }) }
      setReturnPriceLoading(false)
    }, 500)
    return () => clearTimeout(t)
  }, [tripType, returnFromCity, returnToCity, returnBagsCount, adminKey]) // eslint-disable-line

  // ── Line item helpers ────────────────────────────────────────────────
  function addRow() { setLineItems(prev => [...prev, { id: uid(), name: '', description: '', qty: 1, rate: 0, taxId: TAX_GST5 }]) }
  function removeRow(id: string) { setLineItems(prev => prev.filter(r => r.id !== id)) }
  function updateRow(id: string, field: keyof Omit<LineItemRow, 'id'>, value: string | number) {
    setLineItems(prev => prev.map(r => r.id === id
      // Manually touching Qty or Rate takes the row out of "flat amount"
      // mode — clear the override so Amount goes back to the normal
      // qty × rate (matches every other, non-auto-populated row).
      ? { ...r, [field]: value, ...(field === 'qty' || field === 'rate' ? { amount: undefined } : {}) }
      : r
    ))
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
        // Picking a catalog item replaces the rate entirely, so any flat
        // "up to 2 bags" amount override no longer applies — clear it,
        // same as a manual Qty/Rate edit (see updateRow above).
        ? { ...r, name: item.name, description: item.description ?? '', rate: item.rate, amount: undefined }
        : r
    ))
    itemsFromPricing.current = false
  }

  const [discountType,   setDiscountType]   = useState<'pct' | 'fixed'>('pct')
  const [discountPct,    setDiscountPct]    = useState(0)
  const [discountFixed,  setDiscountFixed]  = useState(0)
  const [paymentStatus,  setPaymentStatus]  = useState<'pending' | 'received'>('pending')

  const subtotal    = lineItems.reduce((s, r) => s + (r.amount ?? r.qty * r.rate), 0)
  const discountAmt = discountType === 'fixed'
    ? Math.min(Math.max(0, discountFixed), subtotal)
    : parseFloat((subtotal * discountPct / 100).toFixed(2))
  const taxableAmt  = subtotal - discountAmt
  const taxAmt      = taxableAmt * 0.05
  const total       = taxableAmt + taxAmt

  // Return journey totals — no discount in this phase, kept simple
  const returnSubtotal = returnLineItems.reduce((s, r) => s + (r.amount ?? r.qty * r.rate), 0)
  const returnTaxAmt   = returnSubtotal * 0.05
  const returnTotal    = returnSubtotal + returnTaxAmt

  // ── Save lead changes (Edit mode) ────────────────────────────────────
  async function saveLeadChanges() {
    if (!custName.trim()) { setErr('Customer name is required.'); return }
    if (!custPhone.trim()) { setErr('Customer phone is required.'); return }
    setSaving(true); setErr('')

    // Only touch saved quote/pricing fields if this lead actually has a quote
    // (i.e. we loaded quote data on edit) — otherwise leave them untouched.
    const validItems = lineItems.filter(r => r.name.trim() && r.rate > 0)
    const hasQuote    = !!lead?.quote_number
    const quotePayload = hasQuote ? {
      quote_line_items: validItems.map(r => ({
        name: r.name, description: r.description, quantity: r.qty, rate: r.rate,
        tax_pct: 5, hsn_or_sac: SAC_CODE, amount: r.amount ?? r.qty * r.rate,
      })),
      quote_subtotal:     subtotal,
      quote_discount_pct: (discountType === 'pct'   && discountPct   > 0) ? discountPct   : null,
      quote_discount_amt: (discountType === 'fixed' && discountFixed > 0) ? discountAmt   : null,
      quote_tax:          taxAmt,
      quote_total:        total,
      quote_subject:      subject.trim()   || null,
      quote_notes:        custNotes.trim() || null,
      quote_terms:        terms.trim()     || null,
      quote_expiry_date:  expiryDate || null,
      salesperson_name:   salesperson || null,
      agent_name:         agentName.trim() || null,
      payment_status:     paymentStatus,
    } : {}

    const res = await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        title:            custTitle,
        name:             custName.trim(),
        phone:            toE164(custPhone, custCountryIso2),
        phone_country_code: custCountryIso2,
        phone_national:      custPhone.trim(),
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
        ...businessFieldsPayload(),
        ...quotePayload,
      }),
    })
    setSaving(false)
    if (res.ok) { setSaveSuccess(true); setTimeout(() => router.push('/admin/leads'), 1200) }
    else { const j = await res.json().catch(() => ({})); setErr(j.error ?? 'Save failed') }
  }

  // ── Generate quote ───────────────────────────────────────────────────
  // forceDuplicate: passed true only from the dupModal's "Create Anyway"
  // button below — re-runs generate() bypassing the server's 409 guard
  // (see lib/duplicate-inquiry-check.ts), for the rare genuine case (per
  // spec: "avoid false duplicate warnings when two genuinely different
  // customers have the same [phone]") where the admin confirms this really
  // is a separate, new inquiry.
  async function generate(forceDuplicate = false) {
    setErr('')
    setDupModal(null)
    const effectiveName  = lead?.name  ?? custName.trim()
    const effectivePhone = lead?.phone ?? toE164(custPhone, custCountryIso2)
    const effectivePhoneCountryCode = lead?.phone_country_code ?? custCountryIso2
    const effectivePhoneNational    = lead?.phone_national     ?? custPhone.trim()
    if (!effectiveName)  { setErr('Customer name is required.'); return }
    if (!effectivePhone) { setErr('Customer phone is required.'); return }
    if (!pickupAddr.trim()) { setErr('Pickup address is required.'); return }
    const validItems = lineItems.filter(r => r.name.trim() && r.rate > 0)
    if (validItems.length === 0) { setErr('Add at least one item with a name and rate.'); return }

    // Guard against accidentally re-generating a quote for a lead that
    // already has one (e.g. reopening this page for an already-quoted
    // lead outside Edit mode). This used to silently create a "Return
    // Journey Quote" with a copy of the same data — Return Trip quotes
    // must now only ever be created together with the onward quote, in
    // the same click, via the Trip Type toggle on a fresh lead.
    if (!isEdit && lead?.quote_number) {
      setErr(`This lead already has quote ${lead.quote_number}. To make changes, use the Edit (pencil) action on the Leads tab instead — Generate here would create an unintended duplicate/return quote.`)
      return
    }

    setGenerating(true)

    let resolvedLeadId = lead?.id ?? createdLeadId ?? null
    if (!resolvedLeadId) {
      const createRes = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          title: custTitle, name: effectiveName, phone: effectivePhone,
          phone_country_code: effectivePhoneCountryCode, phone_national: effectivePhoneNational,
          email: custEmail.trim() || null,
          source: custSource, service_interest: custService || null, service_type: custService || null,
          from_city: fromCity.trim() || null, to_city: toCity.trim() || null,
          pickup_date: pickupDate || null, delivery_date: deliveryDate || null, pickup_time: pickupTime || null,
          pickup_address: pickupAddr.trim() || null, drop_address: dropAddr.trim() || null,
          bags_count: Number(bagsCount) || 1, status: 'new',
          ...(forceDuplicate ? { force_duplicate: true } : {}),
          ...businessFieldsPayload(),
        }),
      })
      const cj = await createRes.json().catch(() => ({}))
      if (!createRes.ok) {
        // 2026-08-25 — the blanket "any matching phone = duplicate" guard
        // stays removed (see that route's comment on why: same customer
        // does not mean same inquiry), but a narrower guard is back for one
        // specific case: this customer already has a still-open, unquoted
        // inquiry that itself came from the website/contact form/mobile
        // app. Stop and let the admin open that instead, rather than
        // silently creating a second record for the same inquiry.
        if (createRes.status === 409 && cj.code === 'DUPLICATE_PHONE' && cj.duplicate_lead) {
          setDupModal(cj.duplicate_lead)
          setGenerating(false)
          return
        }
        setErr(cj.error ?? 'Failed to create lead')
        setGenerating(false)
        return
      } else {
        resolvedLeadId = cj.lead?.id ?? null
      }
      if (!resolvedLeadId) { setErr('Failed to get lead ID after creation'); setGenerating(false); return }
      setCreatedLeadId(resolvedLeadId)
      // 2026-08-25 fix — sync the URL with the just-created lead immediately,
      // not only after the quote itself finishes generating below. Without
      // this, a manual quote (opened at /admin/quotes/new with no lead_id)
      // whose quote-generation call then failed (network hiccup, a
      // validation error, etc.) left a real lead already created in the DB,
      // but the address bar still had no lead_id — a page refresh or
      // back/forward navigation lost the in-memory createdLeadId, so
      // retrying created a genuinely SECOND lead for the same customer
      // (founder-reported 2026-08-25: "the same record can appear again or
      // create duplicate records"). replace (not push) so this doesn't add
      // a back-button entry — from the admin's perspective they're still on
      // the same "creating this quote" screen, just now safely resumable.
      router.replace(`/admin/quotes/new?lead_id=${resolvedLeadId}`)
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
      // amount: only included when this row has a flat-amount override
      // (the "Upto 2 Bags" route-pricing row) — the server respects it
      // instead of recomputing quantity × rate. Every other row omits it
      // and prices exactly as before.
      explicit_line_items: validItems.map(r => ({ name: r.name, description: r.description, quantity: r.qty, rate: r.rate, tax_id: r.taxId, hsn_or_sac: SAC_CODE, amount: r.amount })),
      send_email: sendEmail,
      // Never true here — is_return_quote: true is only ever sent from the
      // dedicated returnPayload block below, for the return leg itself.
      // The guard above already blocks reaching this point for an
      // already-quoted lead outside Edit mode.
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
    payload.payment_status = paymentStatus

    // If the onward quote was already created in an earlier click (Return
    // Trip: this is a retry after the return leg failed or had no items),
    // reuse that result instead of generating the onward quote a second
    // time — otherwise every retry would create another duplicate onward
    // quote/estimate number.
    let d: { estimate_number: string; estimate_id: string | null; total: number; zoho_url: string; sent_to_customer: boolean; is_return_quote?: boolean }
    if (onwardQuote) {
      d = onwardQuote
    } else {
      const res = await fetch('/api/admin/zoho/generate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify(payload),
      })
      const resJson = await res.json()
      if (!res.ok) { setErr(resJson.message ?? resJson.error ?? 'Failed to generate quote'); setGenerating(false); return }
      d = resJson
      setOnwardQuote({ estimate_number: d.estimate_number, estimate_id: d.estimate_id, total: d.total, zoho_url: d.zoho_url, sent_to_customer: d.sent_to_customer })
    }

    // ── Trip Type = Return Trip on a fresh lead: fire the return-leg
    // quote right after the onward one succeeds, in the same click.
    // (If the lead already had a primary quote — the Leads-tab "Return
    // Quote" entry point — the call above was already the return quote
    // via auto-detection, and tripType is locked to 'one_way' below so
    // this block is skipped.)
    let returnResult: { estimate_number: string; total: number } | null = null
    if (tripType === 'return' && !lead?.quote_number) {
      const returnValidItems = returnLineItems.filter(r => r.name.trim() && r.rate > 0)
      if (returnValidItems.length === 0) {
        // Important: do NOT call setResult() here — that would immediately
        // switch to the success screen and hide this error entirely (the
        // success screen renders instead of the form, and err is only
        // shown on the form). Stay on the form so the admin actually sees
        // this and can fix it — this is the bug that made Return Trip
        // silently produce only a one-way quote with no visible reason.
        setErr(`Onward quote ${d.estimate_number} was created. The Return Journey still needs at least one item with a name and rate before the return leg can be generated — check "Return Journey Items" below (it's likely empty because no route pricing was found for ${returnFromCity || '—'} → ${returnToCity || '—'}), add a row manually if needed, then click Generate again.`)
        setGenerating(false)
        return
      }

      const returnPickupDT = combineDateTime(returnPickupDate, returnPickupTime)
      const returnPayload: Record<string, unknown> = {
        lead_id:             resolvedLeadId,
        is_return_quote:     true,
        from_city:           returnFromCity.trim() || undefined,
        to_city:             returnToCity.trim()   || undefined,
        bags_count:          Number(returnBagsCount) || undefined,
        pickup_address:      returnPickupAddr.trim() || undefined,
        drop_address:        returnDropAddr.trim()   || undefined,
        // See onward explicit_line_items above for why `amount` is included.
        explicit_line_items: returnValidItems.map(r => ({ name: r.name, description: r.description, quantity: r.qty, rate: r.rate, tax_id: r.taxId, hsn_or_sac: SAC_CODE, amount: r.amount })),
        // Don't re-send the quote email for the return leg — if sendEmail
        // was on, the customer already got the onward quote email above.
        send_email: false,
      }
      if (returnPickupDT)       returnPayload.pickup_datetime = returnPickupDT
      if (returnNotes.trim())   returnPayload.customer_notes  = returnNotes.trim()
      if (salesperson)          returnPayload.salesperson_name = salesperson
      if (agentName.trim())    returnPayload.agent_name       = agentName.trim()

      const returnRes = await fetch('/api/admin/zoho/generate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify(returnPayload),
      })
      const rd = await returnRes.json()
      if (!returnRes.ok) {
        // Same reasoning as above — no setResult() here, stay on the form
        // so the error is actually visible instead of being hidden by the
        // success screen.
        setErr(`Onward quote ${d.estimate_number} was created. The return quote failed: ${rd.message ?? rd.error ?? 'unknown error'} — fix the issue and click Generate again (the onward quote won't be re-created).`)
        setGenerating(false)
        return
      }
      returnResult = { estimate_number: rd.estimate_number, total: rd.total }
    }

    setResult({
      estimate_number: d.estimate_number, estimate_id: d.estimate_id, total: d.total,
      zoho_url: d.zoho_url, sent_to_customer: d.sent_to_customer, is_return_quote: d.is_return_quote,
      ...(returnResult ? { return_estimate_number: returnResult.estimate_number, return_total: returnResult.total } : {}),
    })
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
        <h2 className="text-xl font-bold text-gray-900">
          {result.return_estimate_number ? 'Both Quotes Saved!' : result.is_return_quote ? 'Return Quote Saved!' : 'Quote Created!'}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {result.is_return_quote ? 'Return quote' : 'Quote'}: <span className="font-mono font-bold text-blue-700">{result.estimate_number}</span>
        </p>
        <div className="mt-6 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-left text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-semibold">{formatCustomerName(lead?.title ?? custTitle, lead?.name ?? custName) || (lead?.name ?? custName)}</span></div>
          {result.return_estimate_number ? (
            <>
              <div className="flex justify-between"><span className="text-gray-500">Journey 1 (Onward)</span><span className="font-semibold">{fromCity} → {toCity}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Onward Total</span><span className="font-semibold text-orange-600">{rupees(result.total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Journey 2 (Return)</span><span className="font-semibold">{returnFromCity} → {returnToCity}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Return Total</span><span className="font-semibold text-purple-600">{rupees(result.return_total ?? 0)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-1"><span className="font-bold text-gray-700">Grand Total</span><span className="font-bold text-gray-900">{rupees(result.total + (result.return_total ?? 0))}</span></div>
            </>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-gray-500">Route</span><span className="font-semibold">{fromCity} → {toCity}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold text-orange-600">{rupees(result.total)}</span></div>
            </>
          )}
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

  const displayName  = formatCustomerName(lead?.title ?? custTitle, lead?.name ?? custName) || (lead?.name ?? custName)
  const displayPhone = lead?.phone ?? toE164(custPhone, custCountryIso2)
  const displayPhoneNational = lead?.phone_national ?? custPhone

  // ── FORM ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* Existing Website Inquiry Found — hard-stop modal shown when
          Generate itself hits the server's 409 duplicate guard (see
          lib/duplicate-inquiry-check.ts). Separate from inlineDuplicate's
          non-blocking warning card above the form — this is the actual
          enforcement point, since the admin could type quickly and hit
          Generate before the debounced inline check settles. */}
      {dupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-base font-bold text-amber-800">⚠️ Existing Website Inquiry Found</p>
            <p className="mt-2 text-sm text-gray-600">
              This customer already has an inquiry received from the website
              ({SOURCE_LABELS[dupModal.source] ?? dupModal.source}):{' '}
              <span className="font-semibold text-gray-800">{dupModal.lead_number}</span>
              {dupModal.tracking_id && <> · <span className="font-mono">{dupModal.tracking_id}</span></>}
              {' '}({dupModal.name}), created {new Date(dupModal.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Please create the quote from the existing inquiry in the Dashboard / Lead Table instead of creating a new one.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                onClick={() => router.push(`/admin/quotes/new?lead_id=${dupModal.id}`)}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors">
                Open Existing Inquiry →
              </button>
              <button
                onClick={() => setDupModal(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => generate(true)}
                disabled={generating}
                className="ml-auto text-xs text-gray-400 underline hover:text-gray-600 disabled:opacity-50">
                This is a different inquiry — create anyway
              </button>
            </div>
          </div>
        </div>
      )}

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
          <button onClick={() => generate()} disabled={generating || (!isEdit && !!lead?.quote_number)}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><FileText className="h-3.5 w-3.5" /> {tripType === 'return' ? 'Generate Both Quotes' : 'Generate Quote'}</>}
          </button>
        </div>
      </div>

      {/* Split panel */}
      <div className="flex h-[calc(100vh-57px)] overflow-hidden min-w-0">

        {/* ── Left form ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-5 space-y-4 min-w-0">

          {/* Trip Type — only relevant for a fresh lead with no primary quote
              yet. Return Trip quotes can only be created together with the
              onward quote at this point; once a lead already has a primary
              quote, Generate is disabled entirely (see the amber banner
              below) rather than offering any further quote actions here. */}
          {!isEdit && !lead?.quote_number && (
            <div className={sect}>
              <p className={sectH}>Trip Type</p>
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                <button type="button" onClick={() => setTripType('one_way')}
                  className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${tripType === 'one_way' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  One Way
                </button>
                <button type="button" onClick={enableReturnTrip}
                  className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${tripType === 'return' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Return Trip
                </button>
              </div>
              {tripType === 'return' && (
                <p className="mt-2 text-xs text-purple-700">
                  Generating this quote will create <strong>two</strong> quotes on this lead — the onward journey below, and the return journey in the section that follows — with one click of Generate.
                </p>
              )}
            </div>
          )}

          {/* A lead already having a quote_number here (outside Edit mode)
              means this page was reopened for an already-quoted lead —
              Generate is blocked (see the guard in generate()) rather than
              silently creating an unintended Return Journey Quote, which is
              what used to happen here. Direct the admin to Edit instead. */}
          {lead?.quote_number && !isEdit && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="text-amber-800">
                Quote <strong>{lead.quote_number}</strong> already exists for this lead. Use the Edit (pencil) action on the Leads tab to make changes — Generate is disabled here to prevent creating a duplicate quote.
              </span>
            </div>
          )}

          {/* ── Customer Information ── */}
          <div className={sect}>
            <p className={sectH}><User className="inline h-3.5 w-3.5 mr-1 mb-0.5" />Customer Information</p>

            {/* Select Existing Customer — new-quote only (hidden once a
                lead is loaded/being edited, since its fields are already
                populated at that point). Purely a fast-fill convenience
                above the Customer Name field below — ignore it entirely
                for a brand-new customer and this form behaves exactly as
                it always has. */}
            {!lead && (
              <div className="relative mb-3">
                <label className={lbl}>Select Existing Customer <span className="text-gray-400">(optional — click to browse all, or type to filter by name, mobile, or email)</span></label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={custSearchQ}
                    onChange={e => { setCustSearchQ(e.target.value); setCustSearchOpen(true) }}
                    onFocus={() => setCustSearchOpen(true)}
                    onBlur={() => setTimeout(() => setCustSearchOpen(false), 150)}
                    placeholder="Search existing customers…"
                    className={inp + ' pl-7'}
                  />
                  {custSearchLoading && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />
                  )}
                </div>
                {custSearchOpen && (
                  <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {custSearchLoading && custSearchResults.length === 0 && (
                      <div className="px-3 py-2.5 text-xs text-gray-400">Loading customers…</div>
                    )}
                    {custSearchResults.length === 0 && !custSearchLoading && (
                      <div className="px-3 py-2.5 text-xs text-gray-400">
                        {custSearchQ.trim() ? 'No matching customers — continue below to add a new one.' : 'No existing customers yet — continue below to add one.'}
                      </div>
                    )}
                    {custSearchResults.map((c, i) => (
                      <button
                        key={c.phone + i}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => selectExistingCustomer(c)}
                        className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-orange-50"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                            {c.customer_type === 'business' && <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                            {c.customer_type === 'business' && c.business_name ? c.business_name : (formatCustomerName(c.title, c.name) || c.name)}
                          </span>
                          {c.total_bookings > 0 && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{c.total_bookings} booking{c.total_bookings === 1 ? '' : 's'}</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {c.phone}{c.email ? ` · ${c.email}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Always editable when: no lead (new quote) OR isEdit mode */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={lbl}>Title <span className="text-red-400">*</span></label>
                <select value={custTitle} onChange={e => setCustTitle(e.target.value)}
                  disabled={!!lead && !isEdit} className={!!lead && !isEdit ? inpRO : inp}>
                  {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
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
                <PhoneInput
                  countryIso2={custCountryIso2}
                  nationalNumber={custPhone}
                  onCountryChange={setCustCountryIso2}
                  onNumberChange={setCustPhone}
                  disabled={!!lead && !isEdit}
                  placeholder="98765 43210"
                  required
                />
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

              {/* Live existing-inquiry warning (2026-08-25) — see
                  inlineDuplicate's doc comment above. Purely informational;
                  the admin can still fill in and submit the form normally —
                  the real gate is the dupModal shown from Generate itself. */}
              {inlineDuplicate && (
                <div className="col-span-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800">⚠️ Existing inquiry found</p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    A website inquiry already exists for this customer.
                    {inlineDuplicate.tracking_id && <> Tracking ID: <span className="font-semibold">{inlineDuplicate.tracking_id}</span>.</>}
                    {' '}Source: {SOURCE_LABELS[inlineDuplicate.source] ?? inlineDuplicate.source} · Date: {new Date(inlineDuplicate.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.
                    Please open the existing inquiry and create the quote from there.
                  </p>
                  <button type="button"
                    onClick={() => router.push(`/admin/quotes/new?lead_id=${inlineDuplicate.id}`)}
                    className="mt-1.5 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 transition-colors">
                    View Existing Inquiry →
                  </button>
                </div>
              )}

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

            {/* Payment By — Individual (default, unchanged behavior) vs
                Business / Company. Gates the Business Information card
                below so admins quoting an ordinary individual customer
                never see business fields. Purely a UI/UX choice — no
                field inside is required, and leaving them blank never
                blocks quote/booking creation either way. */}
            <div className="mb-3">
              <label className={lbl}>Payment By</label>
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                {CUSTOMER_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    disabled={!!lead && !isEdit}
                    onClick={() => setPaymentBy(t)}
                    className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      paymentBy === t ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t === 'business' && <Building2 className="h-3.5 w-3.5" />}
                    {t === 'business' ? 'Business / Company' : 'Individual'}
                  </button>
                ))}
              </div>
            </div>

            {/* Business Information — shown only when Payment By =
                Business / Company. Just the 4 fields BagDrop operations
                actually need (name, address, GST, payment terms); none
                are marked required — leaving them blank saves the quote
                as a normal individual customer with no validation errors. */}
            {paymentBy === 'business' && (
              <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-400">
                  <Building2 className="h-3.5 w-3.5" /> Business Information
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={lbl}>Business / Company Name</label>
                    <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)}
                      disabled={!!lead && !isEdit} placeholder="e.g. Riya Travels Pvt. Ltd."
                      className={!!lead && !isEdit ? inpRO : inp} />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>Business / Company Address</label>
                    <textarea value={businessAddress} onChange={e => setBusinessAddress(e.target.value)}
                      disabled={!!lead && !isEdit} rows={2} placeholder="Registered / billing address"
                      className={(!!lead && !isEdit ? inpRO : inp) + ' resize-none'} />
                  </div>
                  <div>
                    <label className={lbl}>GST Number</label>
                    <input type="text" value={gstNumber} onChange={e => setGstNumber(e.target.value)}
                      disabled={!!lead && !isEdit} placeholder="22AAAAA0000A1Z5"
                      className={!!lead && !isEdit ? inpRO : inp} />
                  </div>
                  <div>
                    <label className={lbl}>Payment Terms</label>
                    <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                      disabled={!!lead && !isEdit} className={!!lead && !isEdit ? inpRO : inp}>
                      {PAYMENT_TERMS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

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
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as 'pending' | 'received')} className={inp}>
                  <option value="pending">Pending</option>
                  <option value="received">Received</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Undertaking Status</label>
                <input type="text" value="Pending" readOnly className={inpRO} />
              </div>
              <div>
                <label className={lbl}>Client Contact Number</label>
                <input type="text" value={displayPhoneNational} readOnly className={inpRO} />
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
                      <td className="py-1.5 px-2 text-right text-sm font-medium text-gray-800">{(row.amount ?? row.qty * row.rate).toLocaleString('en-IN')}</td>
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
              <p className="text-xs text-gray-400">Estimate PDF will be emailed to {(lead?.email ?? custEmail) || displayPhone || 'customer'} immediately after creation.</p>
            </div>
          </label>

          {/* ── Return Journey Details — positioned last, only visible when
              Return Trip is selected. Kept purely additive on top of the
              existing one-way form; nothing above this point changed. ── */}
          {!isEdit && !lead?.quote_number && tripType === 'return' && (
            <div className={sect + ' border-purple-200'}>
              <p className={sectH + ' text-purple-500'}>Return Journey Details</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={lbl}>Return From</label>
                  <input type="text" value={returnFromCity} onChange={e => setReturnFromCity(e.target.value)} placeholder="e.g. Mumbai" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Return To</label>
                  <input type="text" value={returnToCity} onChange={e => setReturnToCity(e.target.value)} placeholder="e.g. Ahmedabad" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Return Pickup Date</label>
                  <input type="date" value={returnPickupDate} onChange={e => setReturnPickupDate(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Return Pickup Time</label>
                  <select value={returnPickupTime} onChange={e => setReturnPickupTime(e.target.value)} className={inp}>
                    <option value="">-- Time --</option>
                    {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Return Pickup Location</label>
                  <input type="text" value={returnPickupAddr} onChange={e => setReturnPickupAddr(e.target.value)} placeholder="Pickup address for the return leg" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Return Drop Location</label>
                  <input type="text" value={returnDropAddr} onChange={e => setReturnDropAddr(e.target.value)} placeholder="Drop address for the return leg" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Number of Bags (if different)</label>
                  <input type="number" min="1" value={returnBagsCount} onChange={e => setReturnBagsCount(e.target.value)} className={inp} />
                </div>
                <div className="col-span-2">
                  <label className={lbl}>Additional Notes (optional)</label>
                  <input type="text" value={returnNotes} onChange={e => setReturnNotes(e.target.value)} placeholder="Anything specific to the return journey" className={inp} />
                </div>
              </div>

              {/* Return item table — auto-fills from route pricing, editable */}
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500">Return Journey Items</p>
                {returnPriceLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />}
              </div>
              <table className="w-full min-w-0 text-sm mb-2">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase text-gray-500">
                    <th className="pb-2 pr-2">Item</th>
                    <th className="pb-2 px-2 w-14 text-center">Qty</th>
                    <th className="pb-2 px-2 w-24 text-right">Rate (₹)</th>
                    <th className="pb-2 px-2 w-24 text-right">Amount (₹)</th>
                    <th className="pb-2 pl-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {returnLineItems.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-xs text-gray-400">Fill Return From / To to auto-load from route pricing, or add a row manually.</td></tr>
                  ) : (
                    returnLineItems.map(row => (
                      <tr key={row.id} className="align-top">
                        <td className="py-1.5 pr-2">
                          <input type="text" value={row.name} onChange={e => updateReturnRow(row.id, 'name', e.target.value)}
                            placeholder="Item name" className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-purple-300 focus:outline-none" />
                        </td>
                        <td className="py-1.5 px-2">
                          <input type="number" min="1" value={row.qty} onChange={e => updateReturnRow(row.id, 'qty', Number(e.target.value))}
                            className="w-full rounded border border-gray-200 px-2 py-1 text-center text-sm focus:border-purple-300 focus:outline-none" />
                        </td>
                        <td className="py-1.5 px-2">
                          <input type="number" min="0" value={row.rate} onChange={e => updateReturnRow(row.id, 'rate', Number(e.target.value))}
                            className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm focus:border-purple-300 focus:outline-none" />
                        </td>
                        <td className="py-1.5 px-2 text-right font-semibold text-gray-700">{(row.amount ?? row.qty * row.rate).toLocaleString('en-IN')}</td>
                        <td className="py-1.5 pl-2">
                          <button type="button" onClick={() => removeReturnRow(row.id)} className="text-gray-300 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <button type="button" onClick={addReturnRow} className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-700">
                <Plus className="h-3.5 w-3.5" /> Add Row
              </button>

              <div className="mt-3 rounded-lg bg-purple-50 border border-purple-100 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Return Sub Total</span><span className="font-semibold">₹ {returnSubtotal.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">GST (5%)</span><span className="font-semibold">₹ {returnTaxAmt.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between border-t border-purple-200 pt-1 mt-1"><span className="font-bold text-purple-700">Return Total</span><span className="font-bold text-purple-700">₹ {returnTotal.toLocaleString('en-IN')}</span></div>
              </div>
            </div>
          )}

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

            <button onClick={() => generate()} disabled={generating || (!isEdit && !!lead?.quote_number)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
              {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><FileText className="h-3.5 w-3.5" /> {tripType === 'return' ? 'Generate Both Quotes' : 'Generate Quote'}</>}
            </button>

            <div className="pt-2 space-y-1 text-xs text-gray-400">
              <p className="font-semibold text-gray-500">Auto-set by system:</p>
              <p>✓ Payment Status: <span className={paymentStatus === 'received' ? 'text-green-600 font-bold' : ''}>{paymentStatus === 'received' ? 'Received' : 'Pending'}</span></p>
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
