import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { parseStoredPhone } from '@/lib/phone-format'

export const runtime = 'nodejs'

// ── GET /api/admin/customers/search?q=... ────────────────────────────
// Powers the "Select Existing Customer" autocomplete on the New Quote
// form. There is no single normalized `customers` table in this schema
// (see lib/constants.ts) — a customer's data lives spread across
// `leads` and `bookings`, so this searches both by name/phone/email and
// merges the results into one profile per customer, keyed by phone
// (normalized to E.164 so "9876543210" and "+919876543210" collapse to
// the same person instead of showing as two separate results).
//
// Only returns fields that actually exist in the schema today — title,
// name, phone, email, pickup/drop address, total bookings. There is no
// stored "gender" column anywhere (the customer_title migration's
// female-first-name list is a one-time heuristic backfill for the
// Mr./Ms. `title` field, not a real gender field) — deliberately left
// out rather than fabricated. If a real gender field gets added to the
// schema later, add it here too.
interface RawRow {
  source:        'lead' | 'booking'
  title:         string | null
  name:          string | null
  phone:         string | null
  email:         string | null
  pickup_address: string | null
  drop_address:   string | null
  created_at:    string
}

interface CustomerProfile {
  title:          string | null
  name:           string
  phone:          string
  email:          string | null
  pickup_address: string | null
  drop_address:   string | null
  total_bookings: number
  last_activity:  string
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const q = (searchParams.get('q') ?? '').trim()

  // Empty q = "browse all customers" (matches the Zoho-style picker the
  // dropdown is modeled on — clicking the field shows the full list
  // immediately, no typing required). Capped at 300 per table so this
  // stays fast even once the customer base grows; a business this size
  // isn't going to have more unique customers than that any time soon,
  // and typing narrows it down with an actual filter anyway.
  const like = q ? `%${q}%` : null

  let leadsQuery = supabaseAdmin
    .from('leads')
    .select('title, name, phone, email, pickup_address, drop_address, created_at')
    .order('created_at', { ascending: false })
    .limit(300)
  if (like) leadsQuery = leadsQuery.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)

  let bookingsQuery = supabaseAdmin
    .from('bookings')
    .select('title, customer_name, customer_phone, customer_email, pickup_address, drop_address, created_at')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(300)
  if (like) bookingsQuery = bookingsQuery.or(`customer_name.ilike.${like},customer_phone.ilike.${like},customer_email.ilike.${like}`)

  const [leadsRes, bookingsRes] = await Promise.all([leadsQuery, bookingsQuery])

  if (leadsRes.error) {
    return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })
  }
  if (bookingsRes.error) {
    return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 })
  }

  const rows: RawRow[] = [
    ...(leadsRes.data ?? []).map(r => ({
      source: 'lead' as const,
      title: r.title, name: r.name, phone: r.phone, email: r.email,
      pickup_address: r.pickup_address, drop_address: r.drop_address,
      created_at: r.created_at,
    })),
    ...(bookingsRes.data ?? []).map(r => ({
      source: 'booking' as const,
      title: r.title, name: r.customer_name, phone: r.customer_phone, email: r.customer_email,
      pickup_address: r.pickup_address, drop_address: r.drop_address,
      created_at: r.created_at,
    })),
  ]

  // Most-recent-first so that, per phone, the FIRST row we see when
  // filling in a field is also the most recently updated value for it.
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const profiles = new Map<string, CustomerProfile>()

  for (const row of rows) {
    if (!row.phone) continue
    const key = parseStoredPhone(row.phone).e164 || row.phone

    let profile = profiles.get(key)
    if (!profile) {
      profile = {
        title: null, name: row.name ?? '', phone: row.phone, email: null,
        pickup_address: null, drop_address: null, total_bookings: 0,
        last_activity: row.created_at,
      }
      profiles.set(key, profile)
    }
    // Rows are already sorted newest-first, so only fill a field the
    // first time we see it for this customer — that's always the most
    // recent non-empty value across all their leads/bookings.
    if (!profile.title && row.title) profile.title = row.title
    if (!profile.email && row.email) profile.email = row.email
    if (!profile.pickup_address && row.pickup_address) profile.pickup_address = row.pickup_address
    if (!profile.drop_address && row.drop_address) profile.drop_address = row.drop_address
    if (row.source === 'booking') profile.total_bookings++
  }

  // Alphabetical by name (matches the Zoho-style picker this is modeled
  // on), not most-recent — this is a "find Aditya Shah in the full list"
  // picker, not an activity feed.
  const customers = Array.from(profiles.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 200)

  return NextResponse.json({ customers, total: customers.length })
}
