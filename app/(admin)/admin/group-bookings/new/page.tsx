'use client'

// BAGDROP — Create a new Group / Wedding Booking (spec section 2: Group /
// Event Details). Submits straight to POST /api/admin/group-bookings,
// which creates the underlying booking + linked lead + group_booking_
// details row in one request, then redirects into the manifest hub
// (app/(admin)/admin/group-bookings/[id]/page.tsx) where guests/bags are
// added and the quote gets generated via the EXISTING quote engine.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users2 } from 'lucide-react'

const EVENT_TYPES = ['Wedding', 'Corporate Event', 'Family Group', 'Student Group', 'Large Group Travel', 'Other']

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
const labelCls = 'mb-1.5 block text-xs font-semibold text-gray-600'

interface FormState {
  event_name: string
  event_type: string
  primary_contact_name: string
  primary_contact_number: string
  email: string
  event_date: string
  pickup_city: string
  pickup_address: string
  delivery_city: string
  delivery_address: string
  hotel_name: string
  estimated_total_bags: string
  pickup_window_start: string
  pickup_window_end: string
  special_instructions: string
  remarks: string
}

const EMPTY: FormState = {
  event_name: '', event_type: 'Wedding', primary_contact_name: '', primary_contact_number: '', email: '',
  event_date: '', pickup_city: '', pickup_address: '', delivery_city: '', delivery_address: '', hotel_name: '',
  estimated_total_bags: '', pickup_window_start: '', pickup_window_end: '', special_instructions: '', remarks: '',
}

export default function NewGroupBookingPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed]     = useState(false)
  const [form, setForm]         = useState<FormState>(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setAuthed(true)
  }, [router])

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    setErr('')
    if (!form.event_name.trim())            { setErr('Group / Event Name is required'); return }
    if (!form.primary_contact_name.trim())  { setErr('Primary Contact Name is required'); return }
    if (!form.primary_contact_number.trim()) { setErr('Primary Contact Number is required'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/group-bookings?key=${adminKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify(form),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error ?? 'Could not create group booking'); setSaving(false); return }
      router.push(`/admin/group-bookings/${j.group_booking.booking_id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error')
      setSaving(false)
    }
  }

  if (!authed) return null

  return (
    <>
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <button onClick={() => router.push('/admin/group-bookings')}
          className="mb-2 flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Group Bookings
        </button>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <Users2 className="h-5 w-5 text-orange-500" /> New Group / Wedding Booking
        </h1>
        <p className="mt-0.5 text-sm text-gray-400">One Group Booking ID, one quote, one payment — guests and bags are added on the next screen.</p>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Group / Event Name<span className="ml-0.5 text-orange-500">*</span></label>
              <input className={inputCls} value={form.event_name} onChange={set('event_name')} placeholder="Yashna & Yash Wedding" />
            </div>
            <div>
              <label className={labelCls}>Event Type</label>
              <select className={inputCls} value={form.event_type} onChange={set('event_type')}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Wedding / Event Date</label>
              <input type="date" className={inputCls} value={form.event_date} onChange={set('event_date')} />
            </div>

            <div className="col-span-2 border-t border-gray-100 pt-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Primary Contact</p>
            </div>
            <div>
              <label className={labelCls}>Primary Contact Name<span className="ml-0.5 text-orange-500">*</span></label>
              <input className={inputCls} value={form.primary_contact_name} onChange={set('primary_contact_name')} placeholder="Rahul Shah" />
            </div>
            <div>
              <label className={labelCls}>Primary Contact Number<span className="ml-0.5 text-orange-500">*</span></label>
              <input className={inputCls} value={form.primary_contact_number} onChange={set('primary_contact_number')} placeholder="9876543210" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Email Address</label>
              <input type="email" className={inputCls} value={form.email} onChange={set('email')} placeholder="rahul@example.com" />
            </div>

            <div className="col-span-2 border-t border-gray-100 pt-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Route & Logistics</p>
            </div>
            <div>
              <label className={labelCls}>Pickup City</label>
              <input className={inputCls} value={form.pickup_city} onChange={set('pickup_city')} placeholder="Mumbai" />
            </div>
            <div>
              <label className={labelCls}>Delivery City</label>
              <input className={inputCls} value={form.delivery_city} onChange={set('delivery_city')} placeholder="Udaipur" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Pickup Address</label>
              <input className={inputCls} value={form.pickup_address} onChange={set('pickup_address')} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Delivery Address</label>
              <input className={inputCls} value={form.delivery_address} onChange={set('delivery_address')} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Hotel Name</label>
              <input className={inputCls} value={form.hotel_name} onChange={set('hotel_name')} />
            </div>
            <div>
              <label className={labelCls}>Pickup Window — From</label>
              <input type="date" className={inputCls} value={form.pickup_window_start} onChange={set('pickup_window_start')} />
            </div>
            <div>
              <label className={labelCls}>Pickup Window — To</label>
              <input type="date" className={inputCls} value={form.pickup_window_end} onChange={set('pickup_window_end')} />
            </div>
            <div>
              <label className={labelCls}>Estimated Total Bags</label>
              <input type="number" min={1} className={inputCls} value={form.estimated_total_bags} onChange={set('estimated_total_bags')} placeholder="150" />
              <p className="mt-1 text-[11px] text-gray-400">Used for the quote. Refine to the exact count later once guests/bags are added.</p>
            </div>

            <div className="col-span-2">
              <label className={labelCls}>Special Instructions</label>
              <textarea rows={2} className={inputCls} value={form.special_instructions} onChange={set('special_instructions')} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Remarks</label>
              <textarea rows={2} className={inputCls} value={form.remarks} onChange={set('remarks')} />
            </div>
          </div>

          {err && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</div>}

          <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button onClick={() => router.push('/admin/group-bookings')}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create Group Booking →'}
            </button>
          </div>
        </div>
      </main>
    </>
  )
}
