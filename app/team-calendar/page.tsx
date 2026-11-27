// app/team-calendar/page.tsx
//
// Simple web page for the ops team: every Confirmed booking's pickup and
// delivery, grouped by day (Today / Tomorrow / Next 7 days / All upcoming /
// Past 14 days). Opens straight in any browser or phone — no Google Calendar
// setup, no login. Protected by the same secret as the calendar feed:
//   https://www.bagdrop.co/team-calendar?token=<CALENDAR_FEED_TOKEN>
// Live data (no caching), so a booking confirmed a minute ago shows up.

import type { Metadata } from 'next'
import { timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { ACTIVE_BOOKING_STATUSES } from '@/lib/booking-status'
import { formatCustomerName } from '@/lib/constants'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Team Calendar',
  robots: { index: false, follow: false, nocache: true },
}

interface Row {
  tracking_id: string
  status: string
  title: string | null
  customer_name: string | null
  customer_phone: string | null
  from_city: string | null
  to_city: string | null
  pickup_address: string | null
  drop_address: string | null
  pickup_date: string | null
  delivery_date: string | null
  time_slot: string | null
  delivery_time_slot?: string | null
  total_bags: number | null
  driver_name: string | null
  vehicle_number: string | null
}

interface Item {
  date: string
  kind: 'Pickup' | 'Delivery'
  slot: string | null
  row: Row
}

const COLS = 'tracking_id, status, title, customer_name, customer_phone, from_city, to_city, pickup_address, drop_address, pickup_date, delivery_date, time_slot, total_bags, driver_name, vehicle_number'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

async function fetchRows(): Promise<Row[]> {
  const run = (cols: string) => supabaseAdmin
    .from('bookings').select(cols)
    .in('status', ACTIVE_BOOKING_STATUSES)
    .eq('is_test', false)
    .limit(2000)
  let { data, error } = await run(`${COLS}, delivery_time_slot`)
  if (error) { // delivery_time_slot not migrated yet
    const retry = await run(COLS); data = retry.data; error = retry.error
  }
  if (error) { console.error('[team-calendar] query failed:', error.message); return [] }
  return (data ?? []) as unknown as Row[]
}

const istDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d) // YYYY-MM-DD
function addDays(date: string, n: number): string {
  const t = new Date(`${date}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
function fmtDay(date: string, today: string): string {
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  if (date === today) return `Today · ${label}`
  if (date === addDays(today, 1)) return `Tomorrow · ${label}`
  return label
}
function statusLabel(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
// Sort key: first clock time in the slot text, else end of day.
function sortMinutes(slot: string | null): number {
  const m = slot?.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m || (!m[2] && !m[3])) return 24 * 60
  let h = Number(m[1]); const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return h * 60 + Number(m[2] ?? '0')
}

const VIEWS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'all', label: 'All upcoming' },
  { key: 'past', label: 'Past 14 days' },
]

export default async function TeamCalendarPage({ searchParams }: { searchParams: Promise<{ token?: string; view?: string }> }) {
  const sp = await searchParams
  const expected = process.env.CALENDAR_FEED_TOKEN
  if (!expected || !safeEqual(sp.token ?? '', expected)) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Team Calendar</h1>
        <p className="mt-2 text-sm text-gray-600">This page needs the private link shared by Bagdrop. Please open the full link you were sent.</p>
      </main>
    )
  }
  const token = sp.token as string
  const view = VIEWS.some(v => v.key === sp.view) ? (sp.view as string) : 'today'
  const today = istDate(new Date())

  const rows = await fetchRows()
  const all: Item[] = []
  for (const r of rows) {
    if (r.pickup_date) all.push({ date: r.pickup_date, kind: 'Pickup', slot: r.time_slot, row: r })
    if (r.delivery_date) all.push({ date: r.delivery_date, kind: 'Delivery', slot: r.delivery_time_slot ?? null, row: r })
  }
  const inView = (d: string) =>
    view === 'today' ? d === today
    : view === 'tomorrow' ? d === addDays(today, 1)
    : view === 'week' ? d >= today && d <= addDays(today, 6)
    : view === 'past' ? d < today && d >= addDays(today, -14)
    : d >= today
  const items = all.filter(i => inView(i.date)).sort((a, b) =>
    view === 'past' ? (a.date < b.date ? 1 : a.date > b.date ? -1 : sortMinutes(a.slot) - sortMinutes(b.slot))
    : a.date < b.date ? -1 : a.date > b.date ? 1 : sortMinutes(a.slot) - sortMinutes(b.slot))

  const byDate = new Map<string, Item[]>()
  for (const i of items) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i])

  const count = (k: 'Pickup' | 'Delivery') => items.filter(i => i.kind === k).length
  const href = (v: string) => `/team-calendar?token=${encodeURIComponent(token)}&view=${v}`

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Bagdrop · Pickups &amp; Deliveries</h1>
        <p className="text-sm text-gray-500">Confirmed bookings only · times in IST · refresh the page for latest</p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2">
        {VIEWS.map(v => (
          <a key={v.key} href={href(v.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${v.key === view ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'}`}>
            {v.label}
          </a>
        ))}
      </nav>

      <p className="mb-4 text-sm text-gray-600">
        <b>{count('Pickup')}</b> pickup{count('Pickup') === 1 ? '' : 's'} · <b>{count('Delivery')}</b> deliver{count('Delivery') === 1 ? 'y' : 'ies'}
      </p>

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">Nothing scheduled for this view.</div>
      )}

      {[...byDate.entries()].map(([date, list]) => (
        <section key={date} className="mb-6">
          <h2 className={`mb-2 rounded-lg px-3 py-2 text-sm font-semibold ${date === today ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700'}`}>
            {fmtDay(date, today)}
          </h2>
          <ul className="space-y-3">
            {list.map((i, idx) => {
              const r = i.row
              const name = formatCustomerName(r.title, r.customer_name) || r.customer_name || 'Customer'
              const route = [r.from_city, r.to_city].filter(Boolean).join(' → ')
              const addr = i.kind === 'Pickup' ? r.pickup_address : r.drop_address
              const pickup = i.kind === 'Pickup'
              return (
                <li key={`${r.tracking_id}-${i.kind}-${idx}`} className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ring-1 ring-gray-200 ${pickup ? 'border-l-indigo-600' : 'border-l-emerald-600'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white ${pickup ? 'bg-indigo-600' : 'bg-emerald-600'}`}>{pickup ? '📦 Pickup' : '🚚 Delivery'}</span>
                    {i.slot && <span className="text-sm font-semibold text-gray-900">{i.slot}</span>}
                    <span className="ml-auto text-xs text-gray-500">{r.tracking_id} · {statusLabel(r.status)}</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-gray-900">{name}</p>
                  <p className="text-sm text-gray-700">{route}{r.total_bags != null ? ` · ${r.total_bags} bag${r.total_bags === 1 ? '' : 's'}` : ''}</p>
                  {addr && <p className="mt-1 text-sm text-gray-600">📍 {addr}</p>}
                  {r.driver_name && <p className="mt-1 text-sm text-gray-600">🚗 {r.driver_name}{r.vehicle_number ? ` (${r.vehicle_number})` : ''}</p>}
                  {r.customer_phone && <a href={`tel:${r.customer_phone}`} className="mt-2 inline-block text-sm font-medium text-orange-600">📞 {r.customer_phone}</a>}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </main>
  )
}
