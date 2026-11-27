// app/api/calendar/feed/route.ts
//
// Live iCalendar (.ics) feed of every Confirmed booking (payment received through delivered) so the
// ops team can subscribe once in Google Calendar ("Other calendars" -> "From
// URL") and see, per day, which customer is being picked up / delivered.
//
// One event per booking per leg-date: a "Pickup" event on pickup_date and a
// "Delivery" event on delivery_date. Return-journey legs are stored as their
// own booking rows, so they appear automatically with their own dates.
// Bookings that move to Completed / Cancelled / Lost drop out of the feed and
// Google removes them on its next refresh (Google polls subscribed feeds
// roughly every few hours — it cannot be forced).
//
// Auth: a shared secret in the URL (Google Calendar cannot send headers).
//   https://www.bagdrop.co/api/calendar/feed?token=<CALENDAR_FEED_TOKEN>
// Set CALENDAR_FEED_TOKEN in Vercel env vars (a long random string).
// No customer phone number / payment data is put in the feed.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { ACTIVE_BOOKING_STATUSES } from '@/lib/booking-status'
import { formatCustomerName } from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Same definition of "Confirmed" the rest of the app uses (Dashboard KPI,
// Leads tab badge): payment received/approved and every fulfilment status up
// to, but not including, 'completed'. The earlier version only covered
// 'confirmed' onward, which dropped bookings still at Payment Received /
// Payment Approved (e.g. a 28 Nov pickup that showed Confirmed in the app).
const INCLUDED = ACTIVE_BOOKING_STATUSES

interface Row {
  tracking_id: string
  status: string
  title: string | null
  customer_name: string | null
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

const BASE_COLS = 'tracking_id, status, title, customer_name, from_city, to_city, pickup_address, drop_address, pickup_date, delivery_date, time_slot, total_bags, driver_name, vehicle_number'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// RFC 5545: lines max 75 octets, continuation lines start with a space.
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--
    out.push(rest.slice(0, cut))
    rest = ' ' + rest.slice(cut)
  }
  out.push(rest)
  return out.join('\r\n')
}

/** First clock time found in a free-text slot ("10:00 AM - 12 PM", "14:30"). null = no usable time. */
function parseTime(slot: string | null): { h: number; m: number } | null {
  if (!slot) return null
  const m = slot.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return null
  if (!m[2] && !m[3]) return null // bare number like "9-12" is ambiguous -> all-day
  let h = Number(m[1]); const min = Number(m[2] ?? '0'); const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return { h, m: min }
}

const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: string) => d.replace(/-/g, '')

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n)
  return `${t.getUTCFullYear()}${p2(t.getUTCMonth() + 1)}${p2(t.getUTCDate())}`
}

/** IST (UTC+5:30, no DST) wall time -> iCal UTC stamp. */
function istToUtc(d: string, h: number, m: number): string {
  const t = new Date(`${d}T${p2(h)}:${p2(m)}:00+05:30`)
  return `${t.getUTCFullYear()}${p2(t.getUTCMonth() + 1)}${p2(t.getUTCDate())}T${p2(t.getUTCHours())}${p2(t.getUTCMinutes())}00Z`
}

function buildEvent(kind: 'Pickup' | 'Delivery', r: Row, stamp: string): string[] {
  const date = kind === 'Pickup' ? r.pickup_date : r.delivery_date
  if (!date) return []
  const slot = kind === 'Pickup' ? r.time_slot : (r.delivery_time_slot ?? null)
  const t = parseTime(slot)
  const name = formatCustomerName(r.title, r.customer_name) || r.customer_name || 'Customer'
  const route = [r.from_city, r.to_city].filter(Boolean).join(' → ')
  const where = kind === 'Pickup' ? r.pickup_address : r.drop_address
  const status = r.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const lines = [
    'BEGIN:VEVENT',
    `UID:${r.tracking_id}-${kind.toLowerCase()}@bagdrop.co`,
    `DTSTAMP:${stamp}`,
  ]
  if (t) {
    const startH = t.h, startM = t.m
    const end = new Date(`${date}T${p2(startH)}:${p2(startM)}:00+05:30`); end.setUTCHours(end.getUTCHours() + 1)
    const endStamp = `${end.getUTCFullYear()}${p2(end.getUTCMonth() + 1)}${p2(end.getUTCDate())}T${p2(end.getUTCHours())}${p2(end.getUTCMinutes())}00Z`
    lines.push(`DTSTART:${istToUtc(date, startH, startM)}`, `DTEND:${endStamp}`)
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${addDays(date, 1)}`)
  }
  const bags = r.total_bags != null ? `${r.total_bags} bag${r.total_bags === 1 ? '' : 's'}` : ''
  lines.push(`SUMMARY:${esc(`${kind === 'Pickup' ? '📦 Pickup' : '🚚 Delivery'} · ${name}${bags ? ' · ' + bags : ''} · ${r.tracking_id}`)}`)
  const desc = [
    `${kind} — ${name}`,
    `Booking: ${r.tracking_id} (${status})`,
    route && `Route: ${route}`,
    bags && `Bags: ${bags}`,
    slot && `Time: ${slot}`,
    `Pickup address: ${r.pickup_address || '—'}`,
    `Delivery address: ${r.drop_address || '—'}`,
    r.driver_name && `Driver: ${r.driver_name}${r.vehicle_number ? ' (' + r.vehicle_number + ')' : ''}`,
  ].filter(Boolean).join('\n')
  lines.push(`DESCRIPTION:${esc(desc)}`)
  if (where) lines.push(`LOCATION:${esc(where)}`)
  lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  return lines
}

async function fetchRows(): Promise<Row[]> {
  const run = (cols: string) => supabaseAdmin
    .from('bookings').select(cols)
    .in('status', INCLUDED)
    .eq('is_test', false)
    .limit(2000)
  let { data, error } = await run(`${BASE_COLS}, delivery_time_slot`)
  if (error) {
    // delivery_time_slot column not migrated yet -> retry without it.
    const retry = await run(BASE_COLS)
    data = retry.data; error = retry.error
  }
  if (error) { console.error('[calendar-feed] query failed:', error.message); return [] }
  return (data ?? []) as unknown as Row[]
}

export async function GET(req: NextRequest) {
  const expected = process.env.CALENDAR_FEED_TOKEN
  if (!expected) return new NextResponse('Calendar feed not configured', { status: 503 })
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!safeEqual(token, expected)) return new NextResponse('Unauthorized', { status: 401 })

  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`
  const rows = await fetchRows()

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bagdrop//Confirmed Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Bagdrop Pickups & Deliveries',
    'X-WR-TIMEZONE:Asia/Kolkata',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const r of rows) {
    lines.push(...buildEvent('Pickup', r, stamp), ...buildEvent('Delivery', r, stamp))
  }
  lines.push('END:VCALENDAR')

  return new NextResponse(lines.map(fold).join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="bagdrop-bookings.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
