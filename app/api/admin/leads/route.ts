import { NextRequest, NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendInquiryNotification } from '@/lib/email'
import { sendNewInquiryWhatsApp } from '@/lib/new-inquiry-notification'
import { sendLeadAcknowledgment } from '@/lib/lead-acknowledgment'
import { parseStoredPhone } from '@/lib/phone-format'
import { TITLE_OPTIONS, DEFAULT_TITLE, type TitleId } from '@/lib/constants'
import { nextInquiryNumberPair } from '@/lib/number-series'
import { autoMarkLostInquiries } from '@/lib/auto-lost-inquiries'
import { ACTIVE_BOOKING_STATUSES } from '@/lib/lifecycle-notifications'
import { alertCreationFailure } from '@/lib/creation-failure-alert'
import { findOpenWebsiteInquiry } from '@/lib/duplicate-inquiry-check'
import { tokenizeSearch, looksLikePhone, digitsOnly, phoneMatches, buildTokenOr } from '@/lib/lead-search'

let lastAutoLostRun = 0

// ── Fast list path (2026-10-28) ─────────────────────────────────────────────
// The Leads tab was slow because every load (and every search keystroke) ran
// several full-table scans — all bookings, all leads with a booking, all lead phone
// numbers — before the real query, and then a second lookup for the quoted leads' booking
// statuses. The linked booking's status is now fetched in the SAME query through an embedded
// relationship (leads.booking_id → bookings), and every status the page shows is derived from
// it with the exact same rules as before (see `derive` below). Phone search uses an indexed-style
// query plus a 60s cached id/phone list for format variants. If the relationship is not
// available for any reason, `fastList` returns null and the original code path below runs
// unchanged, so behaviour never regresses.
const ACTIVE_SET = new Set<string>(ACTIVE_BOOKING_STATUSES as readonly string[])
let embedUnsupported = false
let phoneCache: { at: number; rows: { id: string; phone: string | null }[] } | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllTop<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  cap = 20000,
): Promise<{ rows: T[]; error: { message: string } | null }> {
  const PAGE = 1000
  const rows: T[] = []
  for (let from = 0; from < cap; from += PAGE) {
    const { data: chunk, error: err } = await build(from, from + PAGE - 1)
    if (err) return { rows, error: err }
    rows.push(...(chunk ?? []))
    if (!chunk || chunk.length < PAGE) break
  }
  return { rows, error: null }
}

async function loadPhoneRows(): Promise<{ id: string; phone: string | null }[]> {
  if (phoneCache && Date.now() - phoneCache.at < 60_000) return phoneCache.rows
  const { rows } = await fetchAllTop<{ id: string; phone: string | null }>((f, t) =>
    supabaseAdmin.from('leads').select('id, phone').order('id').range(f, t))
  phoneCache = { at: Date.now(), rows }
  return rows
}

async function resolveTokenOrs(search: string | null): Promise<string[]> {
  const tokens = tokenizeSearch(search)
  const likeEscape = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m)
  return Promise.all(tokens.map(async token => {
    const q = digitsOnly(token)
    const isPhone = looksLikePhone(token)
    const [bk, quick, all] = await Promise.all([
      token.length >= 3
        ? supabaseAdmin.from('bookings').select('id').ilike('tracking_id', `%${likeEscape(token)}%`).limit(300)
        : Promise.resolve({ data: [] as { id: string }[] }),
      isPhone && q.length >= 4
        ? supabaseAdmin.from('leads').select('id').ilike('phone', `%${q.length >= 10 ? q.slice(-10) : q}%`).limit(300)
        : Promise.resolve({ data: [] as { id: string }[] }),
      isPhone ? loadPhoneRows() : Promise.resolve([] as { id: string; phone: string | null }[]),
    ])
    const phoneIds = new Set<string>(((quick as { data: { id: string }[] | null }).data ?? []).map(r => r.id))
    for (const r of all) if (phoneMatches(r.phone, q)) phoneIds.add(r.id)
    const bookingIds = ((bk as { data: { id: string }[] | null }).data ?? []).map(b => b.id)
    return buildTokenOr(token, Array.from(phoneIds).slice(0, 300), bookingIds)
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FastRow = Record<string, any>

// Heavy JSON columns the Leads table never shows. Dropped from the list response when `slim=1`
// (sent only by the Leads page), which makes the payload much smaller. Other callers are unaffected.
const SLIM_DROP = ['quote_line_items', 'return_quote_line_items', 'estimate_line_items'] as const

async function fastList(p: {
  status: string | null; excludeStatus: string | null; search: string | null; source: string | null
  includeTest: boolean; offset: number; limit: number; slim?: boolean
}): Promise<NextResponse | null> {
  try {
    const tokenOrs = await resolveTokenOrs(p.search)
    const statusFilterActive = !!p.status && p.status !== 'all'
    const jsMode = statusFilterActive || !!p.excludeStatus

    const build = (withDeletedAt: boolean) => {
      let q = supabaseAdmin
        .from('leads')
        // `!booking_id` pins the relationship to leads.booking_id (leads also has return_booking_id).
        .select('*, booking:bookings!booking_id(status)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      if (!p.includeTest) q = q.eq('is_test', false)
      if (withDeletedAt) q = q.is('deleted_at', null)
      if (p.source && p.source !== 'all') q = q.eq('source', p.source)
      for (const or of tokenOrs) q = q.or(or)
      return q
    }

    const derive = (l: FastRow) => {
      const b = Array.isArray(l.booking) ? l.booking[0] : l.booking
      const bs: string | null = b?.status ?? null
      const hasQuote = !!l.quote_number
      const confirmed = !!bs && ACTIVE_SET.has(bs) && hasQuote
      const completed = bs === 'completed' && hasQuote
      const cancelled = bs === 'cancelled'
      return { bs, confirmed, completed, cancelled }
    }

    async function run(withDeletedAt: boolean): Promise<{ data: FastRow[] | null; error: { message: string } | null; count: number | null }> {
      if (!jsMode) {
        const { data, error, count } = await build(withDeletedAt).range(p.offset, p.offset + p.limit - 1)
        return { data: data as FastRow[] | null, error, count }
      }
      const { rows, error } = await fetchAllTop<FastRow>((f, t) => build(withDeletedAt).range(f, t), 10000)
      if (error) return { data: null, error, count: null }
      const filtered = rows.filter(l => {
        const d = derive(l)
        if (p.excludeStatus && d.bs === p.excludeStatus) return false
        if (!statusFilterActive) return true
        if (p.status === 'confirmed') return d.confirmed
        if (p.status === 'cancelled') return d.cancelled
        return l.status === p.status && !d.confirmed
      })
      return { data: filtered.slice(p.offset, p.offset + p.limit), error: null, count: filtered.length }
    }

    let { data, error, count } = await run(true)
    if (error && error.message?.includes('deleted_at')) ({ data, error, count } = await run(false))
    if (error) {
      // Relationship missing/ambiguous → remember it and use the original path.
      if (/relationship|PGRST200|PGRST201|embed/i.test(error.message)) embedUnsupported = true
      console.warn('[leads GET] fast path unavailable, using original path:', error.message)
      return null
    }

    const enriched = (data ?? []).map(l => {
      const d = derive(l)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { booking: _booking, ...rest } = l
      if (p.slim) for (const k of SLIM_DROP) delete rest[k]
      const effective_status = d.completed ? 'completed'
        : d.confirmed ? (d.bs ?? 'confirmed')
        : d.cancelled ? 'cancelled'
        : (l.quote_number && d.bs) ? d.bs
        : l.status
      return { ...rest, effective_status, is_confirmed: d.confirmed || d.completed }
    })
    return NextResponse.json({ leads: enriched, total: count, page: Math.floor(p.offset / p.limit) + 1, limit: p.limit })
  } catch (e) {
    console.warn('[leads GET] fast path error, using original path:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Self-heal: flip any lead whose requested pickup_date has already
  // passed with no real booking progress to 'lost', on every load — so
  // this works immediately even before the external cron
  // (app/api/cron/mark-lost-inquiries) is registered. Best-effort; a
  // failure here must never break the Leads tab itself.
  // Throttled to once a minute per server instance: it used to run (several
  // queries) on EVERY list load, i.e. on every search keystroke, which was a
  // large part of the slowness.
  // Now runs AFTER the response is sent (Next's after()), so it never delays the list.
  if (Date.now() - lastAutoLostRun > 60_000) {
    lastAutoLostRun = Date.now()
    after(async () => {
      try {
        await autoMarkLostInquiries()
      } catch (e) {
        console.warn('[leads GET] autoMarkLostInquiries failed:', e)
      }
    })
  }

  const { searchParams } = req.nextUrl
  const status        = searchParams.get('status')
  const excludeStatus = searchParams.get('exclude_status')
  const search        = searchParams.get('search')
  const source         = searchParams.get('source')
  const deleted        = searchParams.get('deleted') === 'true'
  const bookingId      = searchParams.get('booking_id')       // Dashboard "Manage in Leads" direct-open lookup
  // Explicit opt-in only — see the is_test filter below. Used by the New
  // Trip Sheet wizard (app/(admin)/admin/trip-sheets/new/page.tsx) so a
  // deliberately-created Test Mode lead/booking (e.g. a Group Booking used
  // to test the vendor-notification feature) can still be picked to build
  // a trip sheet against.
  const includeTest    = searchParams.get('include_test') === 'true'
  const page          = parseInt(searchParams.get('page') ?? '1', 10)
  const limit         = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset        = (page - 1) * limit

  // ── booking_id lookup: return the exact lead linked to this booking,
  // bypassing every other filter/pagination — used by the Dashboard's
  // "Manage in Leads" button (app/(admin)/admin/page.tsx) to open the
  // exact same inquiry on the Leads tab regardless of its current status,
  // the Leads tab's filter/search state, or whether it'd fall outside the
  // default page-1 window. Mirrors the existing lead_id lookup pattern in
  // app/api/admin/bookings/route.ts. ──────────────────────────────────
  if (bookingId) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ lead: data ?? null, leads: data ? [data] : [], total: data ? 1 : 0 })
  }

  // Fast path (single query, status derived from the embedded booking). Falls through to the
  // original implementation below if it returns null.
  if (!deleted && !embedUnsupported) {
    const fast = await fastList({ status, excludeStatus, search, source, includeTest, offset, limit, slim: searchParams.get('slim') === '1' })
    if (fast) return fast
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  // PostgREST returns at most 1000 rows per request, and long `in.(…)` id
  // lists in the URL can exceed the proxy's URL limit. The old code relied on
  // both (id lists for the Confirmed/Cancelled filters and the prescans), so as
  // the number of bookings grew, those requests could silently come back empty
  // or fail — and the Leads page then kept showing the previous list. Page
  // through results instead, and filter by id in memory.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fetchAllRows<T = any>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>,
    cap = 20000,
  ): Promise<{ rows: T[]; error: { message: string } | null }> {
    const PAGE = 1000
    const rows: T[] = []
    for (let from = 0; from < cap; from += PAGE) {
      const { data: chunk, error: err } = await build(from, from + PAGE - 1)
      if (err) return { rows, error: err }
      rows.push(...(chunk ?? []))
      if (!chunk || chunk.length < PAGE) break
    }
    return { rows, error: null }
  }

  // ── Prescans (run in parallel — they were sequential round-trips) ───────
  const ACTIVE_STATUSES = ACTIVE_BOOKING_STATUSES
  let confirmedLeadIds: string[] = []
  // booking_id -> its real bookings.status (see the Confirmed notes in git
  // history / dashboard-analytics: Confirmed = ACTIVE_STATUSES + has a quote_number).
  let bookingStatusMap: Record<string, string> = {}
  let completedLeadIds: string[] = []
  let cancelledLeadIds: string[] = []
  let excludedBookingIds = new Set<string>()

  const prescanTasks: Promise<void>[] = []
  if (!deleted) {
    prescanTasks.push((async () => {
      const [bk, ld] = await Promise.all([
        fetchAllRows<{ id: string; status: string }>((f, t) => supabaseAdmin
          .from('bookings').select('id, status')
          .in('status', [...ACTIVE_STATUSES, 'completed', 'cancelled'])
          .order('id').range(f, t)),
        fetchAllRows<{ id: string; booking_id: string; quote_number: string | null }>((f, t) => supabaseAdmin
          .from('leads').select('id, booking_id, quote_number')
          .not('booking_id', 'is', null)
          .order('id').range(f, t)),
      ])
      const activeSet    = new Set<string>(ACTIVE_STATUSES as readonly string[])
      const completedSet = new Set<string>()
      const cancelledSet = new Set<string>()
      for (const b of bk.rows) {
        if (activeSet.has(b.status)) bookingStatusMap[b.id] = b.status
        else if (b.status === 'completed') completedSet.add(b.id)
        else if (b.status === 'cancelled') cancelledSet.add(b.id)
      }
      for (const l of ld.rows) {
        if (bookingStatusMap[l.booking_id] && l.quote_number) confirmedLeadIds.push(l.id)
        if (completedSet.has(l.booking_id) && l.quote_number) completedLeadIds.push(l.id)
        // Cancel Booking: deliberately no quote_number requirement (a booking
        // can be cancelled before any quote exists).
        if (cancelledSet.has(l.booking_id)) cancelledLeadIds.push(l.id)
      }
    })())
  }
  if (!deleted && excludeStatus) {
    prescanTasks.push((async () => {
      const { rows } = await fetchAllRows<{ id: string }>((f, t) => supabaseAdmin
        .from('bookings').select('id').eq('status', excludeStatus).order('id').range(f, t))
      excludedBookingIds = new Set(rows.map(b => b.id))
    })())
  }

  // ── Search resolution ───────────────────────────────────────────────────
  // Every token (AND-ed) is matched against name, phone, email, inquiry no.,
  // quote numbers, route cities and addresses (see lib/lead-search.ts), plus:
  //  • tracking_id (BDA-…) — lives on `bookings`, resolved to booking ids;
  //  • phone numbers compared digit-for-digit in JS so formatting / country
  //    code differences don't matter;
  //  • exact lead / booking UUIDs.
  const searchTokens = deleted && !search ? [] : tokenizeSearch(search)
  const hasSearch = searchTokens.length > 0
  const tokenOrs: string[] = []
  if (hasSearch) {
    const likeEscape = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m)
    const resolved = await Promise.all(searchTokens.map(async token => {
      const [bk, ph] = await Promise.all([
        token.length >= 3
          ? supabaseAdmin.from('bookings').select('id').ilike('tracking_id', `%${likeEscape(token)}%`).limit(300)
          : Promise.resolve({ data: [] as { id: string }[] }),
        looksLikePhone(token)
          ? fetchAllRows<{ id: string; phone: string | null }>((f, t) => supabaseAdmin
              .from('leads').select('id, phone').order('id').range(f, t))
          : Promise.resolve({ rows: [] as { id: string; phone: string | null }[] }),
      ])
      const q = digitsOnly(token)
      const phoneIds = 'rows' in ph
        ? ph.rows.filter(r => phoneMatches(r.phone, q)).map(r => r.id).slice(0, 300)
        : []
      const bookingIds = ('data' in bk ? (bk.data ?? []) : []).map(b => b.id)
      return buildTokenOr(token, phoneIds, bookingIds)
    }))
    tokenOrs.push(...resolved)
  }
  await Promise.all(prescanTasks)

  const statusFilterActive = !deleted && !!status && status !== 'all'
  const jsMode = !deleted && (statusFilterActive || excludedBookingIds.size > 0)
  const confirmedSet = new Set(confirmedLeadIds)
  const cancelledSet = new Set(cancelledLeadIds)

  const buildBase = (withDeletedAt: boolean) => {
    let q = supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact' })
      // Test Mode leads never appear in the live Leads tab by default unless
      // the caller opts in via include_test.
      .order('created_at', { ascending: false })
      // Stable tiebreaker so paging never skips/duplicates rows that share a
      // created_at.
      .order('id', { ascending: false })
    if (!includeTest) q = q.eq('is_test', false)
    if (withDeletedAt) {
      q = deleted ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
    }
    // Default view (no status filter, no search): Lost leads hidden, not
    // deleted. A search is left unfiltered on purpose so a Lost lead is still
    // findable by name/phone/ID.
    // 2026-10-15 — Lost leads are NO LONGER hidden from the default view.
    // Rule: every inquiry that appears on the Dashboard must appear here.
    // Auto-Lost (pickup date passed) was silently removing next-day inquiries
    // such as BDL-2026-0275 (Imran Dal) from this list while the Dashboard
    // still showed them. They now stay listed with a "Lost" badge.
    if (source && source !== 'all') q = q.eq('source', source)
    for (const or of tokenOrs) q = q.or(or)
    return q
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type LeadRow = Record<string, any>
  async function runQuery(withDeletedAt: boolean): Promise<{ data: LeadRow[] | null; error: { message: string } | null; count: number | null }> {
    if (!jsMode) {
      const { data: d, error: e, count: c } = await buildBase(withDeletedAt).range(offset, offset + limit - 1)
      return { data: d as LeadRow[] | null, error: e, count: c }
    }
    // Status / exclusion filters depend on booking state, so apply them in
    // memory over the full (search/source-filtered) set, then paginate.
    const { rows, error: e } = await fetchAllRows<LeadRow>((f, t) => buildBase(withDeletedAt).range(f, t), 10000)
    if (e) return { data: null, error: e, count: null }
    const filtered = rows.filter(l => {
      if (excludedBookingIds.size > 0 && l.booking_id && excludedBookingIds.has(l.booking_id)) return false
      if (!statusFilterActive) return true
      if (status === 'confirmed') return confirmedSet.has(l.id)
      if (status === 'cancelled') return cancelledSet.has(l.id)
      return l.status === status && !confirmedSet.has(l.id)
    })
    return { data: filtered.slice(offset, offset + limit), error: null, count: filtered.length }
  }

  let { data, error, count } = await runQuery(true)

  // Defensive fallback: deleted_at column may not exist yet (migration not run).
  if (error && error.message?.includes('deleted_at')) {
    console.warn('[leads GET] deleted_at column missing — falling back to unfiltered query. Run SOFT_DELETE_MIGRATION.sql.')
    ;({ data, error, count } = await runQuery(false))
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Quoted-but-not-yet-Confirmed leads: also surface real booking status ──
  // A lead's linked booking is auto-created at 'quote_created' the moment a
  // quote is generated for it — see app/api/admin/zoho/generate-quote/
  // route.ts — and from there moves through quote_sent/accepted/
  // payment_pending before ever reaching payment_received (the point
  // confirmedLeadIds above starts covering it). Until now, effective_status
  // only ever surfaced the real booking status for that ACTIVE_STATUSES
  // range — anything earlier fell through to the lead's own raw funnel
  // status ('new'/'contacted'/etc), which quote generation deliberately
  // never touches. Net effect (founder-reported 2026-08-25): a lead that
  // was just quoted — including a manually created quote, generated and
  // saved in one action — kept showing "New Inquiry" right up until
  // Confirmed, instead of "Quote Created"/"Quote Sent"/etc. This is the
  // actual backend root cause, not a frontend label to hide: leads.status
  // itself is still never written here (still purely additive/read-only,
  // same as confirmedLeadIds/completedLeadIds above), it's just that a
  // quoted lead's *displayed* status now correctly prefers its booking's
  // real progress over the stale funnel value. Scoped to just this page's
  // rows (not a full-table pre-scan like confirmedLeadIds above) since it's
  // purely for display.
  const quotedBookingIds = Array.from(new Set(
    (data ?? [])
      .filter(l => l.quote_number && l.booking_id && !confirmedLeadIds.includes(l.id) && !completedLeadIds.includes(l.id))
      .map(l => l.booking_id as string)
  ))
  let quotedBookingStatusMap: Record<string, string> = {}
  if (quotedBookingIds.length > 0) {
    const { data: quotedBookings } = await supabaseAdmin
      .from('bookings')
      .select('id, status')
      .in('id', quotedBookingIds)
    quotedBookingStatusMap = Object.fromEntries((quotedBookings ?? []).map(b => [b.id, b.status]))
  }

  // Read-only display status — the linked booking's actual real-time
  // status (e.g. 'invoice_sent', 'pickup_scheduled', 'quote_created') once
  // a lead has a real quote (Confirmed-or-later, or still quote-in-progress
  // per the fix above), so its badge shows exactly what's currently
  // happening instead of a single flat "Confirmed"/"New Inquiry" label;
  // otherwise the lead's own untouched funnel status. Computed here (not
  // stored) so this is purely additive: leads.status keeps meaning exactly
  // what it always has for every other system that reads it (sales-
  // followup reminders, etc.).
  const enriched = (data ?? []).map(l => ({
    ...l,
    effective_status: completedLeadIds.includes(l.id)
      ? 'completed'
      : confirmedLeadIds.includes(l.id)
        ? (bookingStatusMap[l.booking_id ?? ''] ?? 'confirmed')
        // Cancel Booking feature (2026-08-31) — checked before the
        // quote_number branch below, because a cancelled inquiry often has
        // NO quote_number at all (cancelled straight from the Dashboard
        // before any quote was generated), so it would otherwise fall
        // straight through to the lead's stale raw `status` ('new', etc.)
        // and never show as Cancelled here. cancelledLeadIds already
        // covers that case (no quote_number requirement — see where it's
        // built above), unlike quotedBookingStatusMap.
        : cancelledLeadIds.includes(l.id)
          ? 'cancelled'
          : (l.quote_number && quotedBookingStatusMap[l.booking_id ?? ''])
            ? quotedBookingStatusMap[l.booking_id ?? '']
            : l.status,
    // 2026-08-25 fix — explicit, unambiguous "has this lead actually
    // reached Confirmed (payment received/approved) or later" flag, kept
    // SEPARATE from effective_status above. The Leads tab's small orange
    // "Confirmed" sub-label used to infer this by checking whether
    // effective_status matched ANY entry in BOOKING_STATUS_CONFIG — which
    // was a safe proxy back when effective_status only ever held a real
    // booking status for the Confirmed-or-later range. Once the fix above
    // (2026-08-25, same day) started ALSO surfacing early statuses like
    // 'quote_created'/'quote_sent' for any quoted lead, that proxy broke:
    // BOOKING_STATUS_CONFIG has an entry for every pipeline status, not
    // just Confirmed+, so the sub-label started firing for every quoted
    // lead regardless of payment — founder-reported 2026-08-25 ("all
    // inquiries are showing the Confirmed badge, even when payment has not
    // been completed"). is_confirmed reuses the exact same
    // confirmedLeadIds/completedLeadIds sets the Dashboard's own "Total
    // Confirmed Bookings" KPI is built from (see the ACTIVE_STATUSES
    // comment above), so this stays permanently in sync with that
    // definition — Payment Received/Approved onward, never earlier —
    // without the frontend having to re-derive it from a label lookup.
    is_confirmed: confirmedLeadIds.includes(l.id) || completedLeadIds.includes(l.id),
  }))

  return NextResponse.json({ leads: enriched, total: count, page, limit })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Whole-handler try/catch — was missing entirely, unlike every other
  // creation route (bookings/contact/skybird/y2k all wrap their POST body).
  // Without it, an unhandled throw (e.g. nextLeadNumber()/nextTrackingId()
  // failing because the next_series_number() Postgres function/migration
  // isn't present yet — see supabase/migrations/20260817_atomic_number_
  // series.sql) crashed the request with an EMPTY 500 response. The New
  // Quote page's `res.json().catch(() => ({}))` then got `{}`, `cj.error`
  // was undefined, and the admin only ever saw the generic fallback text
  // "Failed to create lead" with no way to tell what actually broke.
  try {
    return await handleCreateLead(req)
  } catch (err) {
    console.error('[leads POST] Unhandled error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create lead (unexpected server error)' },
      { status: 500 }
    )
  }
}

async function handleCreateLead(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null)

  if (!body?.name || !body?.phone) {
    return NextResponse.json(
      { error: 'name and phone are required' },
      { status: 400 }
    )
  }

  const bodyTitle: TitleId = TITLE_OPTIONS.includes(body.title) ? body.title : DEFAULT_TITLE

  const serviceVal =
    (body.service_interest || body.service_type || '').trim() || null

  const nullDate = (v: unknown) =>
    (typeof v === 'string' ? v.trim() : '') || null

  const needsFlight = [
    'airport-to-door',
    'door-to-airport',
    'airport-to-doorstep',
    'doorstep-to-airport',
  ].includes(serviceVal ?? '')

  // The Lead Form now sends a proper dial-code-prefixed international
  // number (e.g. "+14155550100", "+919876543210") via PhoneInput — this
  // used to hardcode +91 onto whatever digits arrived, silently corrupting
  // every non-Indian number regardless of what the admin actually selected.
  // Still defensively normalizes to a leading "+" for any older caller that
  // sends bare digits (assumed India, matching Bagdrop's pre-international
  // legacy behavior).
  const normPhone = body.phone.trim().startsWith('+')
    ? body.phone.trim()
    : (() => {
        const digits = body.phone.replace(/\D/g, '')
        return digits ? '+91' + digits.replace(/^91/, '') : body.phone.trim()
      })()

  // Prefer the country_code/national parts PhoneInput already sent — fall
  // back to re-parsing normPhone for any older caller that doesn't send them.
  const phoneParsed = parseStoredPhone(normPhone)
  const phoneCountryCode = body.phone_country_code || phoneParsed.iso2
  const phoneNational    = body.phone_national     || phoneParsed.nationalNumber

  // ── Website/Contact-Form duplicate-inquiry guard (2026-08-25) ──────────
  // This route (POST /api/admin/leads) is only ever called from admin-
  // facing UI — the real website form, contact form, mobile app, and every
  // partner integration all insert into `leads` directly, never through
  // here (see app/api/bookings/route.ts, app/api/contact/route.ts, etc.).
  // So every request reaching this point is an admin MANUALLY creating a
  // lead — via the New Lead modal (app/(admin)/admin/leads/page.tsx) or the
  // "Add New Quote" page with no lead_id yet (app/(admin)/admin/quotes/new/
  // page.tsx) — and this is the single choke point both of those already
  // go through, so guarding here protects both (and anything else built on
  // this endpoint later) at once.
  //
  // Deliberately narrower than the duplicate-phone guard removed 2026-08-17
  // — see lib/duplicate-inquiry-check.ts's module comment for why. Only
  // fires for a still-open (unquoted), non-lost inquiry that itself came
  // from a genuine self-service channel (website/contact-form/mobile-app),
  // has the SAME trip date (2026-08-25 follow-up — "Different Trip/Inquiry
  // Date = New Inquiry": the same customer booking several separate trips
  // must get a separate tracking number for each one, never merged just
  // because name/phone/email match), and — when both sides have a route on
  // file — the same route too. Never against another admin-created lead.
  // Never blocks outright — `force_duplicate: true` (already sent by the
  // New Lead modal's "Create Anyway" button) always proceeds to create a
  // normal, independent lead.
  if (!body.force_duplicate) {
    const duplicate = await findOpenWebsiteInquiry({
      phone:      normPhone,
      email:      body.email,
      pickupDate: nullDate(body.pickup_date),
      fromCity:   body.from_city,
      toCity:     body.to_city,
    })
    if (duplicate) {
      return NextResponse.json(
        {
          error: 'Existing website inquiry found for this customer.',
          code: 'DUPLICATE_PHONE',
          duplicate_lead: duplicate,
        },
        { status: 409 }
      )
    }
  }

  // Lead number and tracking ID — each atomically assigned via
  // next_series_number() (see lib/number-series.ts / supabase/migrations/
  // 20260817_atomic_number_series.sql), never derived from or reused off
  // an existing lead/booking. Every new inquiry gets its OWN lead row and
  // its OWN booking row, even when the phone number matches an existing
  // customer — same customer does not mean same inquiry.
  //
  // This used to short-circuit here: a 409 DUPLICATE_PHONE guard blocked
  // (or, via the "existing website booking" branch, silently reused) an
  // existing lead/booking whenever the phone matched. That reuse path
  // meant a repeat customer's second inquiry overwrote the FIRST inquiry's
  // quote/pickup/tracking data in place on the same row — exactly the bug
  // reported 2026-08-17 (Sachin Patel's 10 Aug inquiry disappearing when
  // his 15 Aug inquiry reused the same lead, and BDA- tracking numbers
  // getting reassigned to a different inquiry). Every inquiry is now its
  // own independent, permanent record; nothing here ever updates a
  // pre-existing lead or booking row.
  // Mint ONE shared number and derive both prefixes from it (see
  // lib/number-series.ts's nextInquiryNumberPair comment) — calling
  // nextLeadNumber()/nextTrackingId() separately, even back-to-back like
  // this, does NOT guarantee they end up equal if the two underlying
  // counters have ever drifted apart from anything else in the system
  // (which they repeatedly did — 2026-08-21).
  const { trackingId, leadNumber } = await nextInquiryNumberPair()

  const serviceLabelMap: Record<string, string> = {
    'airport-to-doorstep':  'Airport → Doorstep',
    'airport-to-door':      'Airport → Doorstep',
    'doorstep-to-airport':  'Doorstep → Airport',
    'door-to-airport':      'Doorstep → Airport',
    'doorstep-to-doorstep': 'Doorstep → Doorstep',
    'airport-to-airport':   'Airport → Airport',
  }

  const bookingPayload = {
    tracking_id:    trackingId,
    title:          bodyTitle,
    customer_name:  body.name.trim(),
    customer_phone: normPhone,
    customer_phone_country_code: phoneCountryCode,
    customer_phone_national:     phoneNational,
    customer_email: body.email?.trim()?.toLowerCase() || '',
    service_type:   serviceVal || '',
    service_label:  serviceVal ? (serviceLabelMap[serviceVal] ?? serviceVal) : '',
    from_city:      body.from_city?.trim() || '',
    to_city:        body.to_city?.trim() || '',
    pickup_date:    nullDate(body.pickup_date),
    delivery_date:  nullDate(body.delivery_date),
    time_slot:      body.pickup_time?.trim() || null,
    pickup_address: body.pickup_address?.trim() || null,
    drop_address:   body.drop_address?.trim() || null,
    total_bags:     Number(body.bags_count) || 1,
    flight_number:  needsFlight ? (body.flight_number?.trim() || null) : null,
    notes:          body.notes?.trim() || null,
    status:         'inquiry',
    status_history: [{
      from:       null,
      to:         'inquiry',
      timestamp:  new Date().toISOString(),
      changed_by: 'system',
      note:       `Auto-created from lead ${leadNumber}`,
    }],
    // Business Customer support — see supabase/migrations/20260807_
    // business_customer_fields.sql.
    customer_type:    body.customer_type === 'business' ? 'business' : 'individual',
    business_name:    body.business_name?.trim()    || null,
    business_address: body.business_address?.trim() || null,
    gst_number:       body.gst_number?.trim()        || null,
    payment_terms:    body.payment_terms             || 'Due on Receipt',
  }

  let booking: { id: string; tracking_id: string } | null = null

  const { data: newBooking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .insert(bookingPayload)
    .select('id, tracking_id')
    .single()

  if (bookingErr) {
    console.error('[leads POST] booking insert failed:', bookingErr.message)
    // Fallback: try to find an existing booking for this tracking_id (race/retry)
    const { data: existingByTracking } = await supabaseAdmin
      .from('bookings')
      .select('id, tracking_id')
      .eq('tracking_id', trackingId)
      .maybeSingle()
    if (existingByTracking) {
      console.log('[leads POST] Recovered existing booking for', trackingId)
      booking = existingByTracking
    } else {
      // Real, unrecovered failure — surface it immediately instead of
      // letting it become another silent "number vanished" incident (see
      // supabase/migrations/20260822_inquiry_creation_failures.sql).
      await alertCreationFailure({
        source:        'admin-leads',
        trackingId,
        leadNumber,
        failureStage:  'booking_insert',
        customerName:  body.name?.trim() ?? null,
        customerPhone: normPhone,
        customerEmail: body.email?.trim() || null,
        errorMessage:  bookingErr.message,
        rawPayload:    body,
      })
    }
    // If still null, the lead is created without a booking — admin can repair via
    // /api/admin/repair/create-booking-for-lead
  } else {
    booking = newBooking ?? null
  }

  // Create Lead and link it to the booking
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .insert({
      lead_number: leadNumber,

      title: bodyTitle,
      name:  body.name.trim(),
      phone: normPhone,
      phone_country_code: phoneCountryCode,
      phone_national:     phoneNational,
      email: body.email?.trim()?.toLowerCase() || null,

      source: body.source ?? 'admin',

      service_interest: serviceVal,
      service_type:     serviceVal,

      from_city: body.from_city?.trim() || null,
      to_city:   body.to_city?.trim() || null,

      travel_date:   nullDate(body.travel_date),
      pickup_date:   nullDate(body.pickup_date),
      delivery_date: nullDate(body.delivery_date),

      pickup_time: body.pickup_time?.trim() || null,

      pickup_address: body.pickup_address?.trim() || null,
      drop_address:   body.drop_address?.trim() || null,

      bags_count: Number(body.bags_count) || 1,

      pnr: needsFlight
        ? body.pnr?.trim() || null
        : null,

      flight_number: needsFlight
        ? body.flight_number?.trim() || null
        : null,

      flight_time: needsFlight
        ? nullDate(body.flight_time)
        : null,

      flight_ticket_url: needsFlight
        ? body.flight_ticket_url?.trim() || null
        : null,

      notes: body.notes?.trim() || null,

      status: 'new',

      // Link to the auto-created booking
      booking_id: booking?.id ?? null,

      // Business Customer support (New Quote form) — additive, alongside
      // every Individual field above. See
      // supabase/migrations/20260807_business_customer_fields.sql.
      customer_type:    body.customer_type === 'business' ? 'business' : 'individual',
      business_name:    body.business_name?.trim()    || null,
      business_address: body.business_address?.trim() || null,
      gst_number:       body.gst_number?.trim()        || null,
      payment_terms:    body.payment_terms             || 'Due on Receipt',
    })
    .select()
    .single()

  if (leadErr) {
    console.error('[leads POST] lead insert failed:', leadErr.message)
    // Root cause of the 2026-08-22 "BDA-2026-0114 to 0117 vanished" report:
    // the booking above had already committed successfully (with a real,
    // permanently-consumed tracking_id) by the time this lead insert could
    // fail — and nothing ever cleaned it up. That left an orphaned booking
    // sitting on the Dashboard & Bookings tab (which reads `bookings`
    // directly) with NO linked lead row at all, so it was invisible on this
    // Leads/Quote Management page under every filter, including Lost —
    // there was no lead row to find, Lost or otherwise. The BDA/BDL
    // pairing itself was never broken (nextInquiryNumberPair guarantees
    // that); the numbers just went to a booking with no visible way to
    // find it again. Roll the booking back so a failed attempt leaves
    // nothing behind, exactly like the lead side already doesn't.
    if (booking?.id) {
      const { error: rollbackErr } = await supabaseAdmin.from('bookings').delete().eq('id', booking.id)
      if (rollbackErr) {
        console.error(`[leads POST] Failed to roll back orphaned booking ${booking.tracking_id} after lead insert failure:`, rollbackErr.message)
        return NextResponse.json(
          { error: `Lead creation failed (${leadErr.message}), and the booking ${booking.tracking_id} could not be automatically cleaned up — please delete it manually from Dashboard & Bookings before retrying.` },
          { status: 500 }
        )
      }
      console.warn(`[leads POST] Rolled back orphaned booking ${booking.tracking_id} after lead insert failed`)
    }
    await alertCreationFailure({
      source:        'admin-leads',
      trackingId:    booking?.tracking_id ?? trackingId,
      leadNumber,
      failureStage:  bookingErr ? 'both' : 'lead_insert',
      customerName:  body.name?.trim() ?? null,
      customerPhone: normPhone,
      customerEmail: body.email?.trim() || null,
      errorMessage:  leadErr.message,
      rawPayload:    body,
    })
    return NextResponse.json({ error: leadErr.message }, { status: 500 })
  }

  // Note: lead_id on bookings is omitted (column may not exist in all DB schemas).
  // The relationship is maintained via leads.booking_id only.

  // Send inquiry notification + customer acknowledgment. Awaited (not
  // fire-and-forget) so Vercel doesn't tear the function down mid-send.
  const inquiryData = {
    inquiryNumber:   leadNumber,
    source:          body.source ?? 'admin',
    customerTitle:   lead.title,
    customerName:    lead.name,
    customerPhone:   lead.phone,
    customerEmail:   lead.email,
    serviceType:     lead.service_interest,
    fromCity:        lead.from_city,
    toCity:          lead.to_city,
    pickupAddress:   lead.pickup_address,
    deliveryAddress: lead.drop_address,
    bagsCount:       lead.bags_count,
    travelDate:      lead.travel_date,
    pickupDate:      lead.pickup_date,
    deliveryDate:    lead.delivery_date,
    flightNumber:    lead.flight_number,
    pnr:             lead.pnr,
    notes:           lead.notes,
    submittedAt:     lead.created_at ?? new Date().toISOString(),
  }

  await Promise.allSettled([
    sendInquiryNotification(inquiryData),
    // Internal ops WhatsApp ping — mirrors the admin email above via the
    // Meta-approved "new_inquiry_notification" template. See
    // lib/new-inquiry-notification.ts.
    sendNewInquiryWhatsApp(inquiryData),
    // Customer acknowledgment (email + WhatsApp) — covers manual creation,
    // the admin mobile app, and any partner/API integration that creates
    // leads through this endpoint. See lib/lead-acknowledgment.ts.
    sendLeadAcknowledgment({
      id:     lead.id,
      title:  lead.title,
      name:   lead.name,
      phone:  lead.phone,
      email:  lead.email,
      isTest: lead.is_test,
    }),
  ]).catch(err => console.error('[leads POST] email notification error:', err))

  return NextResponse.json(
    { lead, lead_number: leadNumber, tracking_id: booking?.tracking_id ?? null },
    { status: 201 }
  )
}
