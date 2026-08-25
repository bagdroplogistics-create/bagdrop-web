import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Self-heal: flip any lead whose requested pickup_date has already
  // passed with no real booking progress to 'lost', on every load — so
  // this works immediately even before the external cron
  // (app/api/cron/mark-lost-inquiries) is registered. Best-effort; a
  // failure here must never break the Leads tab itself.
  try {
    await autoMarkLostInquiries()
  } catch (e) {
    console.warn('[leads GET] autoMarkLostInquiries failed:', e)
  }

  const { searchParams } = req.nextUrl
  const status        = searchParams.get('status')
  const excludeStatus = searchParams.get('exclude_status')
  const search        = searchParams.get('search')
  const source         = searchParams.get('source')
  const deleted        = searchParams.get('deleted') === 'true'
  const bookingId      = searchParams.get('booking_id')       // Dashboard "Manage in Leads" direct-open lookup
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

  // ── Build excluded booking IDs for status filter ─────────────────────────
  let excludedBookingIds: string[] = []
  if (!deleted && excludeStatus) {
    const { data: cancelledBookings } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('status', excludeStatus)
    excludedBookingIds = (cancelledBookings ?? []).map(b => b.id)
  }

  // ── "Confirmed" — matches the Dashboard's "Total Confirmed Bookings" ──
  // leads.status is a separate CRM-funnel field (new/contacted/qualified/
  // converted/lost — see STATUS_CONFIG in app/(admin)/admin/leads/page.tsx)
  // that never itself contains 'confirmed'; a booking's real progress lives
  // on bookings.status instead, and 'confirmed' there is only a brief,
  // transient point a booking passes through on its way to
  // invoice_generated/pickup_scheduled/etc. — almost nothing ever sits at
  // literal status='confirmed'. What the Dashboard actually calls "Total
  // Confirmed Bookings" is its 'active' bucket: bookings.status in
  // ACTIVE_STATUSES below AND the lead has a real quote_number (the
  // "hasQuote" guard — see the identical logic + comment in
  // app/api/admin/dashboard-analytics/route.ts, which this must stay in
  // sync with). Matching that exact definition here so the Leads tab's
  // Confirmed count always agrees with the Dashboard's. `effective_status`
  // is computed read-only below — leads.status is never written to, so
  // this can't create a duplicate record or change the confirmation
  // workflow itself.
  // 2026-08-24 fix — was a locally hardcoded array missing
  // 'indemnity_bond_signed'; now the single shared definition (see
  // ACTIVE_BOOKING_STATUSES's doc comment in lib/lifecycle-notifications.ts).
  const ACTIVE_STATUSES = ACTIVE_BOOKING_STATUSES
  let confirmedLeadIds: string[] = []
  // booking_id -> its real bookings.status (e.g. 'invoice_sent',
  // 'payment_received', 'pickup_scheduled') — so a Confirmed lead's badge
  // can show exactly where it actually is in the pipeline, the same way
  // the Dashboard's bookings table does, instead of a single flat
  // "Confirmed" label that would hide that detail.
  let bookingStatusMap: Record<string, string> = {}
  // Leads whose linked booking has actually reached 'completed' — kept
  // deliberately separate from confirmedLeadIds/ACTIVE_STATUSES (which
  // intentionally excludes 'completed' — that set powers the Dashboard's
  // "Total Confirmed Bookings" count via dashboard-analytics/route.ts, and
  // changing its membership would change that metric too). Added
  // 2026-08-22 after a lead (BDL-2026-0119) whose booking was force-
  // completed via /api/admin/repair/force-complete-booking still showed
  // "Lost" here — leads.status is a raw, separate CRM field that a booking
  // reaching Completed never updates, and this table had no path to
  // reflect that. Same read-only, computed-not-stored pattern as
  // effective_status below.
  let completedLeadIds: string[] = []
  if (!deleted) {
    const { data: activeBookings } = await supabaseAdmin
      .from('bookings')
      .select('id, status')
      .in('status', ACTIVE_STATUSES)
    bookingStatusMap = Object.fromEntries((activeBookings ?? []).map(b => [b.id, b.status]))
    const activeBookingIds = Object.keys(bookingStatusMap)
    if (activeBookingIds.length > 0) {
      const { data: confirmedLeads } = await supabaseAdmin
        .from('leads')
        .select('id')
        .in('booking_id', activeBookingIds)
        .not('quote_number', 'is', null)
      confirmedLeadIds = (confirmedLeads ?? []).map(l => l.id)
    }

    const { data: completedBookings } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('status', 'completed')
    const completedBookingIds = (completedBookings ?? []).map(b => b.id)
    if (completedBookingIds.length > 0) {
      const { data: completedLeads } = await supabaseAdmin
        .from('leads')
        .select('id')
        .in('booking_id', completedBookingIds)
        .not('quote_number', 'is', null)
      completedLeadIds = (completedLeads ?? []).map(l => l.id)
    }
  }

  let query = supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (deleted) {
    // Show only soft-deleted leads (for the "Deleted Leads" view)
    query = query.not('deleted_at', 'is', null)
  } else {
    // Default: exclude soft-deleted leads
    query = query.is('deleted_at', null)
  }

  if (!deleted && status && status !== 'all') {
    if (status === 'confirmed') {
      // Every lead that qualifies as Confirmed by the Dashboard's
      // definition — regardless of the lead's own raw funnel status — and
      // none of the "no confirmed leads exist yet" case falling through to
      // an unfiltered (i.e. wrong) list.
      query = confirmedLeadIds.length > 0
        ? query.in('id', confirmedLeadIds)
        : query.eq('id', '00000000-0000-0000-0000-000000000000')
    } else {
      query = query.eq('status', status)
      // A lead that now qualifies as Confirmed is shown under the
      // Confirmed filter instead — never under both, so it's always
      // counted exactly once.
      if (confirmedLeadIds.length > 0) {
        query = query.not('id', 'in', `(${confirmedLeadIds.join(',')})`)
      }
    }
  } else if (!deleted && !search) {
    // Default view (no explicit status filter, no search term) — founder
    // decision (2026-08-19): Lost leads are hidden here by default, not
    // deleted. Picking "Lost" from the status filter dropdown still shows
    // them (goes through the branch above via query.eq('status', 'lost')).
    // A search is left unfiltered on purpose — if staff search for a
    // specific customer by name/phone/email, a Lost lead shouldn't be
    // invisible just because it's excluded from the default browse view.
    query = query.neq('status', 'lost')
  }

  if (source && source !== 'all') {
    query = query.eq('source', source)
  }

  // FIX: PostgreSQL NULL trap — `NOT IN (...)` also excludes rows where booking_id IS NULL.
  // Use `or(booking_id.is.null,booking_id.not.in.(...))` to keep null-booking-id leads visible.
  if (excludedBookingIds.length > 0) {
    query = query.or(
      `booking_id.is.null,booking_id.not.in.(${excludedBookingIds.join(',')})`
    )
  }

  if (search) {
    // lead_number included so the Dashboard's "Manage in Leads" flow can
    // force this exact inquiry to the top of the list by searching its
    // unique Inquiry ID (see app/(admin)/admin/leads/page.tsx) — purely
    // additive, existing name/phone/email search behavior is unchanged.
    //
    // tracking_id (the BDA- number shown everywhere in the admin UI —
    // Dashboard, Booking Workflow, LR/Invoice) lives on `bookings`, not on
    // `leads` itself, so a plain lead_number.ilike match can never find it.
    // Staff naturally search by whichever number they're looking at (often
    // the BDA one, since that's what's on the Dashboard), so this was a
    // silent dead-end — searching a real, existing BDA- number returned
    // "No quotes found" with zero indication that the search simply never
    // checked that column (founder-reported 2026-08-22). Resolve it by
    // first finding any bookings whose tracking_id matches, then OR-ing
    // their booking_id into the same query.
    const trimmedSearch = search.trim()
    let matchingBookingIds: string[] = []
    if (/^BDA-?/i.test(trimmedSearch) || /^\d{4}(-\d{4})?$/.test(trimmedSearch)) {
      const { data: matchingBookings } = await supabaseAdmin
        .from('bookings')
        .select('id')
        .ilike('tracking_id', `%${trimmedSearch}%`)
      matchingBookingIds = (matchingBookings ?? []).map(b => b.id)
    }

    const orClauses = [
      `name.ilike.%${search}%`,
      `phone.ilike.%${search}%`,
      `email.ilike.%${search}%`,
      `lead_number.ilike.%${search}%`,
    ]
    if (matchingBookingIds.length > 0) {
      orClauses.push(`booking_id.in.(${matchingBookingIds.join(',')})`)
    }
    query = query.or(orClauses.join(','))
  }

  let { data, error, count } = await query

  // ── Defensive fallback: deleted_at column may not exist yet (migration not run) ──
  // If the query fails because deleted_at doesn't exist, retry without that filter.
  // This lets the leads page show data even before SOFT_DELETE_MIGRATION.sql is run.
  if (error && error.message?.includes('deleted_at')) {
    console.warn('[leads GET] deleted_at column missing — falling back to unfiltered query. Run SOFT_DELETE_MIGRATION.sql.')
    let fallbackQuery = supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (!deleted && status && status !== 'all') {
      if (status === 'confirmed') {
        fallbackQuery = confirmedLeadIds.length > 0
          ? fallbackQuery.in('id', confirmedLeadIds)
          : fallbackQuery.eq('id', '00000000-0000-0000-0000-000000000000')
      } else {
        fallbackQuery = fallbackQuery.eq('status', status)
        if (confirmedLeadIds.length > 0) {
          fallbackQuery = fallbackQuery.not('id', 'in', `(${confirmedLeadIds.join(',')})`)
        }
      }
    }
    if (source && source !== 'all') {
      fallbackQuery = fallbackQuery.eq('source', source)
    }
    if (excludedBookingIds.length > 0) {
      fallbackQuery = fallbackQuery.or(
        `booking_id.is.null,booking_id.not.in.(${excludedBookingIds.join(',')})`
      )
    }
    if (search) {
      fallbackQuery = fallbackQuery.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
      )
    }
    const { data: fd, error: fe, count: fc } = await fallbackQuery
    if (fe) return NextResponse.json({ error: fe.message }, { status: 500 })
    data = fd; count = fc; error = null
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
        : (l.quote_number && quotedBookingStatusMap[l.booking_id ?? ''])
          ? quotedBookingStatusMap[l.booking_id ?? '']
          : l.status,
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
      id:    lead.id,
      title: lead.title,
      name:  lead.name,
      phone: lead.phone,
      email: lead.email,
    }),
  ]).catch(err => console.error('[leads POST] email notification error:', err))

  return NextResponse.json(
    { lead, lead_number: leadNumber, tracking_id: booking?.tracking_id ?? null },
    { status: 201 }
  )
}
