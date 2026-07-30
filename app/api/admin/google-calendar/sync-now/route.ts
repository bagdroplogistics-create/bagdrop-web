import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { STATUS_ORDER } from '@/lib/lifecycle-notifications'
import { upsertBookingCalendarEvent } from '@/lib/google-calendar'

export const runtime = 'nodejs'

const CONFIRMED_ONWARD_STATUSES = STATUS_ORDER.slice(STATUS_ORDER.indexOf('confirmed'))

interface SyncBookingRow {
  id: string; tracking_id: string; status: string
  customer_name: string | null; customer_phone: string | null; customer_email: string | null
  service_type: string | null; service_label: string | null
  from_city: string | null; to_city: string | null
  pickup_date: string | null; delivery_date: string | null; time_slot: string | null
  pickup_address: string | null; drop_address: string | null; notes: string | null
  google_calendar_event_id: string | null
}

const SYNC_SELECT = 'id, tracking_id, status, customer_name, customer_phone, customer_email, service_type, service_label, from_city, to_city, pickup_date, delivery_date, time_slot, pickup_address, drop_address, notes, google_calendar_event_id'

// ── POST /api/admin/google-calendar/sync-now ────────────────────────────────
// One-time backfill: pushes every upcoming confirmed booking onto the
// calendar. For bookings confirmed before the calendar was connected (or
// while sync was broken) — new confirmations sync automatically from
// app/api/admin/bookings/[id]/route.ts already, this is just for catch-up.
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Only admin can run a calendar sync' }, { status: 403 })
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(SYNC_SELECT)
    .in('status', CONFIRMED_ONWARD_STATUSES)
    .gte('pickup_date', todayStr)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bookings = (data ?? []) as unknown as SyncBookingRow[]

  let synced = 0
  for (const b of bookings) {
    await upsertBookingCalendarEvent(b)
    synced++
  }

  return NextResponse.json({ synced, total: bookings.length })
}
