'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Save, IndianRupee, FileText } from 'lucide-react'
import Link from 'next/link'

const SERVICE_TYPES = [
  { value: 'airport-to-doorstep',  label: 'Airport → Doorstep'  },
  { value: 'doorstep-to-airport',  label: 'Doorstep → Airport'  },
  { value: 'doorstep-to-doorstep', label: 'Doorstep → Doorstep' },
  { value: 'airport-to-airport',   label: 'Airport → Airport'   },
]

const SOURCE_OPTIONS = [
  { value: 'manual',   label: 'Manual'   },
  { value: 'website',  label: 'Website'  },
  { value: 'referral', label: 'Referral' },
  { value: 'b2b',      label: 'B2B'      },
  { value: 'walk-in',  label: 'Walk-in'  },
]

const CITIES = [
  'Mumbai', 'Delhi', 'Ahmedabad', 'Surat', 'Pune', 'Vadodara',
  'Rajkot', 'Gandhinagar', 'Nashik', 'Nagpur', 'Goa (Panaji)',
]

function Label({ text }: { text: string }) {
  return <label className="mb-1.5 block text-xs font-semibold text-gray-600">{text}</label>
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
const selCls   = inputCls + ' bg-white'

export default function NewQuotePage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const leadId       = searchParams.get('lead_id') // set when coming from a lead row
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')
  const [saved,    setSaved]    = useState<{ id: string; quote_number: string; tracking_id: string | null } | null>(null)

  // Form fields
  const [customerName,  setCustomerName]  = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [source,        setSource]        = useState('manual')
  const [serviceType,   setServiceType]   = useState('airport-to-doorstep')
  const [fromCity,      setFromCity]      = useState('')
  const [toCity,        setToCity]        = useState('')
  const [pickupDate,    setPickupDate]    = useState('')
  const [deliveryDate,  setDeliveryDate]  = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [dropAddress,   setDropAddress]   = useState('')
  const [timeSlot,      setTimeSlot]      = useState('')
  const [totalBags,     setTotalBags]     = useState('1')
  const [basePrice,     setBasePrice]     = useState('')
  const [notes,         setNotes]         = useState('')

  // GST auto-calc
  const base  = parseFloat(basePrice) || 0
  const cgst  = parseFloat((base * 0.025).toFixed(2))
  const sgst  = parseFloat((base * 0.025).toFixed(2))
  const total = parseFloat((base + cgst + sgst).toFixed(2))

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  async function submit(status: 'draft' | 'sent') {
    setErr('')
    if (!customerName.trim()) { setErr('Customer name is required'); return }
    if (!customerPhone.trim()) { setErr('Customer phone is required'); return }
    if (!fromCity || !toCity) { setErr('From city and To city are required'); return }
    if (!basePrice || base <= 0) { setErr('Base price must be greater than 0'); return }

    setSaving(true)
    const res = await fetch('/api/admin/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        customer_name:  customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || null,
        source:         source || null,
        service_type:   serviceType,
        from_city:      fromCity,
        to_city:        toCity,
        pickup_date:    pickupDate || null,
        delivery_date:  deliveryDate || null,
        pickup_address: pickupAddress.trim() || null,
        drop_address:   dropAddress.trim() || null,
        time_slot:      timeSlot.trim() || null,
        total_bags:     parseInt(totalBags) || 1,
        base_price:     base,
        status,
        notes:          notes.trim() || null,
        // If opened from a lead row, pass lead_id so the API reuses
        // the existing BDA booking instead of creating a duplicate BDQ one.
        lead_id:        leadId || null,
      }),
    })
    setSaving(false)

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error ?? 'Failed to create quote')
      return
    }

    const j = await res.json()
    setSaved({ id: j.quote.id, quote_number: j.quote.quote_number, tracking_id: j.tracking_id ?? null })
  }

  if (!authed) return null

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <FileText className="h-8 w-8 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Quote Created!</h2>
        <p className="text-gray-500 mb-2">{saved.quote_number} has been saved and added to the booking pipeline.</p>
        {saved.tracking_id && (
          <p className="text-xs font-mono text-orange-500 mb-6">Booking ID: {saved.tracking_id}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => setSaved(null)}
            className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Create Another
          </button>
          <Link
            href="/admin/quotes"
            className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            View All Quotes
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Page header */}
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/quotes" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">New Quote</h1>
            <p className="mt-0.5 text-sm text-gray-400">Create a quote for a customer</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Left — Customer + Service (col 1–2) */}
          <div className="space-y-6 lg:col-span-2">

            {/* Customer Details */}
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-gray-400">Customer Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <Label text="Full Name *" />
                  <input className={inputCls} placeholder="Amit Shah" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label text="Phone *" />
                  <input className={inputCls} placeholder="9876543210" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label text="Email" />
                  <input className={inputCls} placeholder="amit@email.com" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label text="Source" />
                  <select className={selCls} value={source} onChange={e => setSource(e.target.value)}>
                    {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* Service Details */}
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-gray-400">Service Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label text="Service Type *" />
                  <select className={selCls} value={serviceType} onChange={e => setServiceType(e.target.value)}>
                    {SERVICE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label text="From City *" />
                  <select className={selCls} value={fromCity} onChange={e => setFromCity(e.target.value)}>
                    <option value="">— Select —</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label text="To City *" />
                  <select className={selCls} value={toCity} onChange={e => setToCity(e.target.value)}>
                    <option value="">— Select —</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label text="Pickup Date" />
                  <input type="date" className={inputCls} value={pickupDate} onChange={e => setPickupDate(e.target.value)} />
                </div>
                <div>
                  <Label text="Delivery Date" />
                  <input type="date" className={inputCls} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                </div>
                <div>
                  <Label text="Time Slot" />
                  <input className={inputCls} placeholder="e.g. 10:00 AM – 12:00 PM" value={timeSlot} onChange={e => setTimeSlot(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                    Number of Bags
                    <span className="ml-1.5 font-normal text-gray-400 normal-case">(Up to 30 kg per bag)</span>
                  </label>
                  <input type="number" min="1" className={inputCls} value={totalBags} onChange={e => setTotalBags(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label text="Pickup Address" />
                  <input type="text" className={inputCls} placeholder="e.g. 42, Marine Drive, Mumbai 400002" value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label text="Drop Address" />
                  <input type="text" className={inputCls} placeholder="e.g. 15, Alkapuri, Vadodara 390007" value={dropAddress} onChange={e => setDropAddress(e.target.value)} />
                </div>
              </div>
            </section>

            {/* Notes */}
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-gray-400">Notes</h2>
              <textarea
                className={inputCls}
                rows={3}
                placeholder="Any terms, conditions, or special notes for this quote…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </section>
          </div>

          {/* Right — Pricing + Actions (col 3) */}
          <div className="space-y-6">

            {/* Pricing */}
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-gray-400">Pricing</h2>

              <div className="mb-4">
                <Label text="Base Price (₹) *" />
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    min="0"
                    step="50"
                    className={inputCls + ' pl-9'}
                    placeholder="0"
                    value={basePrice}
                    onChange={e => setBasePrice(e.target.value)}
                  />
                </div>
              </div>

              {/* GST breakdown */}
              <div className="rounded-xl bg-orange-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Base Price</span>
                  <span className="font-medium">₹{base.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>CGST (2.5%)</span>
                  <span>₹{cgst.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>SGST (2.5%)</span>
                  <span>₹{sgst.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-t border-orange-200 pt-2 font-bold text-gray-900">
                  <span>Total</span>
                  <span className="text-orange-600 text-base">₹{total.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </section>

            {/* Actions */}
            {err && <p className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-600">{err}</p>}

            <div className="space-y-3">
              <button
                onClick={() => submit('sent')}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Creating…' : 'Create & Mark Sent'}
              </button>
              <button
                onClick={() => submit('draft')}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Save as Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
