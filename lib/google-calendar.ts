// BAGDROP — lib/google-calendar.ts
//
// One shared "Bagdrop Ops" Google Calendar, not per-admin OAuth — see
// supabase/migrations/20260731_google_calendar.sql for why. One admin
// connects a single Google account once; every confirmed booking gets an
// event created/updated/deleted on that one calendar automatically. Team
// members subscribe to that one calendar from their own Google Calendar app
// to get reminders on their own devices.
//
// Every exported function here is best-effort and never throws — matches
// the established pattern for every other side-effect integration in this
// codebase (lib/notifications.ts, lib/lifecycle-notifications.ts,
// lib/driver-details.ts): a calendar sync failure must never turn a
// successful booking update into a failed request.
//
// Event timing: bookings.time_slot is a free-text field (e.g.
// "10:00 AM – 12:00 PM") entered inconsistently across the website form,
// Skybird partner form, and admin-created quotes — there's no reliable way
// to parse it into an exact start/end time. Events are created as all-day
// events on pickup_date instead, with the time slot text (and everything
// else) shown in the event description. Safer than guessing at a parse and
// creating events with wrong times.

import { supabaseAdmin } from './supabase'

const TOKEN_URL      = 'https://oauth2.googleapis.com/token'
const AUTH_URL       = 'https://accounts.google.com/o/oauth2/v2/auth'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
export const REDIRECT_URI = 'https://bagdrop.co/api/admin/google-calendar/callback'

interface ConnectionRow {
  id: string
  google_email: string | null
  access_token: string
  refresh_token: string
  token_expires_at: string
  calendar_id: string
}

interface BookingForCalendar {
  id:                        string
  tracking_id:               string
  status:                    string
  customer_name:             string | null
  customer_phone:            string | null
  customer_email:            string | null
  service_type:              string | null
  service_label:             string | null
  from_city:                 string | null
  to_city:                   string | null
  pickup_date:                string | null
  delivery_date:              string | null
  time_slot:                  string | null
  pickup_address:             string | null
  drop_address:                string | null
  notes:                      string | null
  google_calendar_event_id:   string | null
}

export function buildGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? ''
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         CALENDAR_SCOPE,
    access_type:   'offline',   // required to get a refresh_token
    prompt:        'consent',   // forces refresh_token on every connect, not just the first time
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number
} | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    })
    const json = await res.json()
    if (!res.ok || !json.access_token || !json.refresh_token) {
      console.error('[google-calendar] token exchange failed:', json)
      return null
    }
    return { access_token: json.access_token, refresh_token: json.refresh_token, expires_in: json.expires_in }
  } catch (err) {
    console.error('[google-calendar] token exchange error:', err)
    return null
  }
}

async function getConnection(): Promise<ConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('id, google_email, access_token, refresh_token, token_expires_at, calendar_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[google-calendar] connection lookup failed:', error.message)
    return null
  }
  return (data ?? null) as unknown as ConnectionRow | null
}

/** Returns a valid access token for the connected calendar, refreshing it first if expired. Null if not connected or refresh failed. */
async function getValidAccessToken(): Promise<{ accessToken: string; calendarId: string } | null> {
  const conn = await getConnection()
  if (!conn) return null

  const expiresAt = new Date(conn.token_expires_at).getTime()
  if (Date.now() < expiresAt - 60_000) {
    return { accessToken: conn.access_token, calendarId: conn.calendar_id }
  }

  // Expired (or about to) — refresh.
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
        refresh_token: conn.refresh_token,
        grant_type:    'refresh_token',
      }),
    })
    const json = await res.json()
    if (!res.ok || !json.access_token) {
      console.error('[google-calendar] token refresh failed:', json)
      return null
    }
    const newExpiry = new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000).toISOString()
    await supabaseAdmin
      .from('google_calendar_connections')
      .update({ access_token: json.access_token, token_expires_at: newExpiry })
      .eq('id', conn.id)
    return { accessToken: json.access_token, calendarId: conn.calendar_id }
  } catch (err) {
    console.error('[google-calendar] token refresh error:', err)
    return null
  }
}

function buildEventPayload(b: BookingForCalendar) {
  const route = [b.from_city, b.to_city].filter(Boolean).join(' → ')
  const descriptionLines = [
    `Booking ID: ${b.tracking_id}`,
    `Customer: ${b.customer_name ?? '—'}`,
    b.customer_phone ? `Contact: ${b.customer_phone}` : null,
    `Service: ${b.service_label ?? b.service_type ?? '—'}`,
    route ? `Route: ${route}` : null,
    b.pickup_address ? `Pickup Address: ${b.pickup_address}` : null,
    b.drop_address ? `Delivery Address: ${b.drop_address}` : null,
    b.time_slot ? `Time Slot: ${b.time_slot}` : null,
    b.notes ? `Notes: ${b.notes}` : null,
    '',
    `Open booking: https://bagdrop.co/admin?highlight=${b.id}`,
  ].filter((l): l is string => l !== null)

  return {
    summary:     `${b.tracking_id} — ${b.customer_name ?? 'Bagdrop pickup'}${route ? ' (' + route + ')' : ''}`,
    description: descriptionLines.join('\n'),
    location:    b.pickup_address ?? undefined,
    start:       { date: b.pickup_date ?? undefined },
    end:         { date: b.pickup_date ?? undefined },
    extendedProperties: { private: { bagdrop_booking_id: b.id } },
  }
}

/** Creates (or updates, if already synced) the calendar event for a confirmed booking. Never throws. */
export async function upsertBookingCalendarEvent(booking: BookingForCalendar): Promise<void> {
  try {
    if (!booking.pickup_date) return // nothing to put on a calendar without a date
    const auth = await getValidAccessToken()
    if (!auth) return // not connected — silently skip, this is optional

    const eventsBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events`
    const payload = buildEventPayload(booking)
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` }

    if (booking.google_calendar_event_id) {
      const res = await fetch(`${eventsBase}/${booking.google_calendar_event_id}`, {
        method: 'PATCH', headers, body: JSON.stringify(payload),
      })
      if (res.ok) return
      // Event may have been deleted on the Google side — fall through and recreate.
      console.warn(`[google-calendar] update failed for booking ${booking.tracking_id} (status ${res.status}), recreating`)
    }

    const createRes = await fetch(eventsBase, { method: 'POST', headers, body: JSON.stringify(payload) })
    const created = await createRes.json().catch(() => ({}))
    if (!createRes.ok || !created.id) {
      console.error(`[google-calendar] create failed for booking ${booking.tracking_id}:`, created)
      return
    }
    await supabaseAdmin.from('bookings').update({ google_calendar_event_id: created.id }).eq('id', booking.id)
  } catch (err) {
    console.error('[google-calendar] upsertBookingCalendarEvent error (non-fatal):', err)
  }
}

/** Removes the calendar event for a booking (e.g. on cancellation). Never throws. */
export async function deleteBookingCalendarEvent(booking: BookingForCalendar): Promise<void> {
  try {
    if (!booking.google_calendar_event_id) return
    const auth = await getValidAccessToken()
    if (!auth) return

    const eventsBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events`
    await fetch(`${eventsBase}/${booking.google_calendar_event_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
    // 404/410 (already gone) is fine too — either way, clear our reference.
    await supabaseAdmin.from('bookings').update({ google_calendar_event_id: null }).eq('id', booking.id)
  } catch (err) {
    console.error('[google-calendar] deleteBookingCalendarEvent error (non-fatal):', err)
  }
}

export async function isCalendarConnected(): Promise<{ connected: boolean; email: string | null; calendarId: string | null }> {
  const conn = await getConnection()
  return conn
    ? { connected: true, email: conn.google_email, calendarId: conn.calendar_id }
    : { connected: false, email: null, calendarId: null }
}
