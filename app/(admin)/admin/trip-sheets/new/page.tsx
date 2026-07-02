'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Truck, Search } from 'lucide-react'

interface Booking {
  id:            string
  tracking_id:   string
  customer_name: string
  service_label: string
  from_city:     string
  to_city:       string
  status:        string
}

export default function NewTripSheetPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [creating, setCreating] = useState<string | null>(null)  // booking id being created
  const [err,      setErr]      = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchBookings = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = new URLSearchParams({ key: adminKey, statuses: 'confirmed', limit: '100' })
    if (search) qs.set('search', search)
    const res = await fetch(`/api/admin/bookings?${qs}`)
    if (res.ok) setBookings((await res.json()).bookings ?? [])
    setLoading(false)
  }, [adminKey, search])

  useEffect(() => { if (authed) fetchBookings() }, [authed, fetchBookings])

  // Click booking → create immediately → redirect
  async function createFromBooking(b: Booking) {
    if (creating) return
    setCreating(b.id); setErr('')
    const res = await fetch('/api/admin/trip-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ booking_id: b.id }),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Failed to create trip sheet'); setCreating(null); return }
    router.push('/admin/trip-sheets/' + d.trip_sheet.id)
  }

  if (!authed) return null

  return (
    <>
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/trip-sheets" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> Trip Sheets
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">New Trip Sheet</span>
        </div>
      </div>

      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Select a Confirmed Booking</h2>
              <p className="text-xs text-gray-400">Click any booking below to create its trip sheet instantly</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by customer name or tracking ID…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-4 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>

          {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

          {/* Booking list */}
          <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-100">
            {loading ? (
              <div className="flex items-center justify-center py-14">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
              </div>
            ) : bookings.length === 0 ? (
              <div className="py-14 text-center">
                <Truck className="mx-auto h-8 w-8 text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No confirmed bookings found</p>
                <p className="text-xs text-gray-300 mt-1">Change a booking status to "Confirmed" first</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {bookings.map(b => (
                  <li key={b.id}>
                    <button
                      onClick={() => createFromBooking(b)}
                      disabled={!!creating}
                      className="w-full px-4 py-3.5 text-left transition-colors hover:bg-orange-50 disabled:opacity-60 group">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-orange-700">
                            {b.customer_name}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {b.from_city} → {b.to_city} · {b.service_label}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-xs font-bold text-orange-500">{b.tracking_id}</p>
                          {creating === b.id ? (
                            <span className="mt-0.5 flex items-center justify-end gap-1 text-xs text-orange-500">
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
                              Creating…
                            </span>
                          ) : (
                            <p className="text-xs text-green-600 font-semibold mt-0.5">confirmed</p>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <Link href="/admin/trip-sheets"
              className="block text-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
              Cancel
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
