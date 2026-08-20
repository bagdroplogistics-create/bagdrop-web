/**
 * POST /api/admin/zoho/generate-quote
 *
 * Generates a quote INTERNALLY in Supabase — no Zoho Books required.
 * Computes line items from route pricing (or explicit items passed by the frontend),
 * saves them to the leads table, and updates the linked booking total + status.
 *
 * If the lead ALREADY has a primary quote (quote_number is set), this call
 * is treated as a RETURN QUOTE and stored in return_quote_* fields WITHOUT
 * overwriting the primary quote or downgrading the booking status.
 *
 * Body:
 *   lead_id              string   (required)
 *   is_return_quote      boolean  (optional — forces return-quote mode)
 *   agent_name           string   (optional)
 *   salesperson_name     string   (optional)
 *   expiry_date          string   (optional, YYYY-MM-DD)
 *   subject              string   (optional)
 *   customer_notes       string   (optional)
 *   terms_conditions     string   (optional)
 *   pricing_mode         'route' | 'custom'
 *   explicit_line_items  array    (optional — used directly if provided)
 *   custom_price_per_bag number   (required if pricing_mode === 'custom' and no explicit_line_items)
 *   pickup_datetime      string   "YYYY-MM-DD HH:mm"
 *   delivery_date        string   "YYYY-MM-DD"
 *   flight_datetime      string   "YYYY-MM-DD HH:mm"
 *   pickup_address       string
 *   from_city            string
 *   to_city              string
 *   bags_count           number
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth }          from '@/lib/admin-auth'
import { supabaseAdmin }             from '@/lib/supabase'
import { SAC_TRANSPORT }             from '@/lib/zoho-books'
import { sendQuoteEmail }            from '@/lib/email'
import { findRouteMatch }            from '@/lib/city-normalize'
import { nextTrackingId }            from '@/lib/number-series'

const GST_PCT = 5   // 5% total GST (2.5% CGST + 2.5% SGST)

// Booking statuses that are "early enough" to be safely set to quote_created.
// Used below to decide whether to advance a booking to quote_sent after a
// quote email goes out — deliberately a narrow whitelist there, since that
// check only needs to catch the two known pre-quote states.
const QUOTE_STAGE_STATUSES = new Set([
  'inquiry', 'quote_created', 'quote_sent',
])

// Statuses that mean the booking has genuinely progressed PAST the quote
// stage — these are the only ones Generate Quote must never downgrade.
// Deliberately a blacklist, not a whitelist of "safe" statuses: any status
// string not in this list (including legacy/unrecognized values like the
// old 'pending' default, or a status from a future integration we haven't
// seen yet) is treated as safe to advance. The previous whitelist approach
// silently refused to advance the booking for ANY unrecognized status —
// including 'pending', which is how bookings created via the public
// website form (before that was fixed to use 'inquiry') got permanently
// stuck with a fully-generated quote but a workflow that never unlocked.
const PROTECTED_LATE_STAGE_STATUSES = new Set([
  'accepted', 'payment_pending', 'payment_received', 'payment_approved',
  'confirmed', 'indemnity_bond_sent', 'indemnity_bond_signed',
  'invoice_generated', 'invoice_sent', 'pickup_scheduled',
  'picked_up', 'in_transit', 'out_for_delivery', 'driver_details_shared',
  'delivered', 'trip_created', 'completed', 'rejected',
])

interface ExplicitItem {
  name:         string
  description?: string
  quantity:     number
  rate:         number
  tax_id?:      string
  hsn_or_sac?:  string
  // Optional flat-amount override, sent only for the auto-populated "Upto
  // 2 Bags" route-pricing row — the founder wants Qty to show the real bag
  // count (1 or 2) without that quantity multiplying the flat "up to 2
  // bags" price (founder instruction, 2026-08-20). When present, this
  // exact value is used as the line's amount instead of quantity × rate;
  // every other item (manual rows, per-extra-bag rows) omits it and prices
  // exactly as before.
  amount?:      number
}

interface LineItem {
  name:        string
  description: string
  quantity:    number
  rate:        number
  tax_pct:     number
  hsn_or_sac:  string
  amount:      number   // rate × quantity (before tax)
}

function buildRouteItems(from: string, to: string, bags: number, base: number, perBag: number): LineItem[] {
  const route = `${from} → ${to}`
  const items: LineItem[] = [{
    name:        `Transportation of Goods (Upto 2 Bags) — ${route}`,
    description: 'Airport-to-Doorstep / Doorstep-to-Airport baggage delivery · SAC 996511',
    quantity:    1,
    rate:        base,
    tax_pct:     GST_PCT,
    hsn_or_sac:  SAC_TRANSPORT,
    amount:      base,
  }]
  if (bags > 2) {
    const extra = bags - 2
    items.push({
      name:        `Additional Bag(s) — ${route}`,
      description: `Per extra bag beyond 2 · SAC 996511`,
      quantity:    extra,
      rate:        perBag,
      tax_pct:     GST_PCT,
      hsn_or_sac:  SAC_TRANSPORT,
      amount:      extra * perBag,
    })
  }
  return items
}

function buildCustomItems(from: string, to: string, bags: number, pricePerBag: number): LineItem[] {
  return [{
    name:        `Transportation of Goods (${bags} Bag${bags !== 1 ? 's' : ''}) — ${from} → ${to}`,
    description: 'Airport-to-Doorstep / Doorstep-to-Airport baggage delivery · SAC 996511',
    quantity:    bags,
    rate:        pricePerBag,
    tax_pct:     GST_PCT,
    hsn_or_sac:  SAC_TRANSPORT,
    amount:      bags * pricePerBag,
  }]
}

function fromExplicit(items: ExplicitItem[]): LineItem[] {
  return items.map(i => ({
    name:        i.name,
    description: i.description ?? '',
    quantity:    i.quantity,
    rate:        i.rate,
    tax_pct:     GST_PCT,
    hsn_or_sac:  i.hsn_or_sac ?? SAC_TRANSPORT,
    // Respect an explicit flat-amount override when the frontend sends one
    // (the "Upto 2 Bags" route-pricing row) — otherwise price exactly as
    // before: quantity × rate. See ExplicitItem.amount doc comment above.
    amount:      i.amount ?? i.quantity * i.rate,
  }))
}

function deriveQuoteNumber(leadNumber: string): string {
  // BDL-2026-0022 → QT-2026-0022
  const parts = leadNumber.split('-')
  return parts.length >= 3 ? 'QT-' + parts.slice(1).join('-') : 'QT-' + leadNumber
}

// City normalization (strips airport terminal suffixes, aliases short
// codes/spelling variants) now lives in lib/city-normalize.ts, shared with
// app/api/admin/route-pricing/calculate/route.ts so both route-pricing
// lookups match the exact same route_pricing rows.

// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.lead_id) {
    return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })
  }

  const {
    lead_id,
    is_return_quote:      forceReturnQuote,
    agent_name,
    salesperson_name,
    expiry_date,
    subject,
    customer_notes,
    terms_conditions,
    pricing_mode          = 'route',
    explicit_line_items,
    custom_price_per_bag,
    pickup_datetime:      pickupDtOverride,
    delivery_date:        deliveryDateOverride,
    flight_datetime:      flightDtOverride,
    pickup_address:       pickupAddrOverride,
    drop_address:         dropAddrOverride,
    from_city:            fromCityOverride,
    to_city:              toCityOverride,
    bags_count:           bagsCountOverride,
    discount_pct:         discountPct,
    discount_type:        discountType,
    discount_fixed_amt:   discountFixedAmt,
    payment_status:       paymentStatusIn,
  } = body as {
    lead_id:               string
    is_return_quote?:      boolean
    agent_name?:           string
    salesperson_name?:     string
    expiry_date?:          string
    subject?:              string
    customer_notes?:       string
    terms_conditions?:     string
    pricing_mode?:         'route' | 'custom'
    explicit_line_items?:  ExplicitItem[]
    custom_price_per_bag?: number
    pickup_datetime?:      string
    delivery_date?:        string
    flight_datetime?:      string
    pickup_address?:       string
    drop_address?:         string
    from_city?:            string
    to_city?:              string
    bags_count?:           number
    discount_pct?:         number
    discount_type?:        'pct' | 'fixed'
    discount_fixed_amt?:   number
    payment_status?:       'pending' | 'received'
  }

  // ── Fetch lead ────────────────────────────────────────────────────
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', lead_id)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const bags     = Number(bagsCountOverride ?? lead.bags_count) || 1
  const fromCity = (fromCityOverride ?? lead.from_city  ?? '').trim()
  const toCity   = (toCityOverride   ?? lead.to_city    ?? '').trim()

  // ── Detect return quote ───────────────────────────────────────────
  // ONLY when the caller explicitly requests it. Previously this also
  // auto-detected "return quote" whenever the lead already had a primary
  // quote number — that silently converted ANY second call to this
  // endpoint for an already-quoted lead into a return-quote write (e.g. an
  // admin accidentally opening the New Quote page for an already-quoted
  // lead and clicking Generate again), corrupting one-way leads with a
  // phantom "Return Journey Quote" that was never intended. Return quotes
  // must now only ever be created together with the onward quote, in the
  // same click, via the explicit Trip Type = Return Trip toggle on a fresh
  // lead (see app/(admin)/admin/quotes/new/page.tsx) — this is the single
  // source of truth for Return Trip creation.
  const isReturnQuote = forceReturnQuote === true

  // ── Resolve line items ────────────────────────────────────────────
  let lineItems: LineItem[]

  if (explicit_line_items && explicit_line_items.length > 0) {
    lineItems = fromExplicit(explicit_line_items)

  } else if (pricing_mode === 'custom') {
    if (!custom_price_per_bag || custom_price_per_bag <= 0) {
      return NextResponse.json(
        { error: 'custom_price_per_bag is required for custom pricing' },
        { status: 400 }
      )
    }
    lineItems = buildCustomItems(fromCity, toCity, bags, custom_price_per_bag)

  } else {
    // Route pricing DB lookup — compare against ALL active routes with
    // normalized (aliased) city keys, not a raw `.eq()`, so rows saved with
    // a non-canonical spelling ("Vadodara" instead of "Baroda") still match.
    // See findRouteMatch() in lib/city-normalize.ts.
    const { data: routes } = await supabaseAdmin
      .from('route_pricing')
      .select('from_city, to_city, base_price, per_bag_rate')
      .eq('is_active', true)

    const route = findRouteMatch(routes ?? [], fromCity, toCity)

    if (!route) {
      return NextResponse.json(
        {
          error: 'no_pricing',
          message: `No route pricing found for ${fromCity} → ${toCity}. Use custom pricing or add the route in Route Pricing settings.`,
        },
        { status: 422 }
      )
    }

    lineItems = buildRouteItems(fromCity, toCity, bags, route.base_price, route.per_bag_rate)
  }

  // ── Calculate totals ──────────────────────────────────────────────
  const subtotal = lineItems.reduce((s, i) => s + i.amount, 0)

  let discountRate: number
  let discountAmt: number

  if (discountType === 'fixed') {
    discountAmt  = Math.min(Math.max(0, Number(discountFixedAmt ?? 0)), subtotal)
    discountRate = 0
  } else {
    discountRate = Math.min(100, Math.max(0, Number(discountPct ?? 0)))
    discountAmt  = parseFloat((subtotal * discountRate / 100).toFixed(2))
  }

  const taxableAmt = subtotal - discountAmt
  const taxAmt     = Math.round(taxableAmt * GST_PCT) / 100
  const total      = Math.round((taxableAmt + taxAmt) * 100) / 100

  // ── Quote number ──────────────────────────────────────────────────
  // Primary:  QT-2026-0022
  // Return:   QT-2026-0022-R
  const primaryQuoteNumber = deriveQuoteNumber(lead.lead_number)
  const quoteNumber        = isReturnQuote ? primaryQuoteNumber + '-R' : primaryQuoteNumber
  const today              = new Date().toISOString().slice(0, 10)

  // ── Save to leads table ───────────────────────────────────────────
  let leadUpdates: Record<string, unknown>

  if (isReturnQuote) {
    // ── RETURN QUOTE: write to return_quote_* fields only ─────────
    // Primary quote fields are NOT touched. Booking status is NOT changed.
    leadUpdates = {
      return_quote_number:     quoteNumber,
      return_quote_line_items: lineItems,
      return_quote_total:      total,
      return_quote_subtotal:   subtotal,
      return_quote_tax:        taxAmt,
      return_quote_date:       today,
      return_from_city:        fromCity || null,
      return_to_city:          toCity   || null,
      return_bags_count:       bags,
      ...(discountAmt  > 0 ? { return_discount_amt: discountAmt  } : { return_discount_amt: null }),
      ...(discountRate > 0 && discountType !== 'fixed' ? { return_discount_pct: discountRate } : { return_discount_pct: null }),
      ...(customer_notes    ? { return_quote_notes: customer_notes } : {}),
      ...(pickupAddrOverride ? { return_pickup_address: pickupAddrOverride } : {}),
      ...(dropAddrOverride   ? { return_drop_address:  dropAddrOverride   } : {}),
      ...(pickupDtOverride  ? {
        return_pickup_date: pickupDtOverride.slice(0, 10),
        return_pickup_time: pickupDtOverride.slice(11, 16),
      } : {}),
    }
  } else {
    // ── PRIMARY QUOTE: write to main quote fields ──────────────────
    leadUpdates = {
      quote_number:         quoteNumber,
      quote_line_items:     lineItems,
      quote_total:          total,
      quote_subtotal:       subtotal,
      quote_discount_pct:   (discountType !== 'fixed' && discountRate > 0) ? discountRate : null,
      quote_discount_amt:   discountAmt  > 0 ? discountAmt  : null,
      quote_tax:            taxAmt,
      quote_date:           today,
      payment_status:       paymentStatusIn ?? 'pending',
      zoho_estimate_id:     null,
      zoho_estimate_number: quoteNumber,
      ...(expiry_date       ? { quote_expiry_date: expiry_date      } : {}),
      ...(subject           ? { quote_subject:     subject          } : {}),
      ...(customer_notes    ? { quote_notes:       customer_notes   } : {}),
      ...(terms_conditions  ? { quote_terms:       terms_conditions } : {}),
      ...(salesperson_name  ? { salesperson_name                    } : {}),
      ...(agent_name        ? { agent_name                          } : {}),
      ...(fromCityOverride      ? { from_city:      fromCity        } : {}),
      ...(toCityOverride        ? { to_city:        toCity          } : {}),
      ...(bagsCountOverride     ? { bags_count:     bags            } : {}),
      ...(pickupAddrOverride    ? { pickup_address: pickupAddrOverride } : {}),
      ...(pickupDtOverride ? {
        pickup_date: pickupDtOverride.slice(0, 10),
        pickup_time: pickupDtOverride.slice(11, 16),
      } : {}),
      ...(deliveryDateOverride  ? { delivery_date: deliveryDateOverride } : {}),
      ...(flightDtOverride      ? { flight_time:   flightDtOverride    } : {}),
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from('leads')
    .update(leadUpdates)
    .eq('id', lead_id)

  if (updateErr) {
    console.error('[generate-quote] lead update failed:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Declared outside the branch below (not `let` inside it) because the
  // "advance to quote_sent" step further down still needs to read it —
  // it's a no-op for return quotes since that step already checks
  // !isReturnQuote itself.
  let bookingId: string | null = lead.booking_id ?? null

  if (!isReturnQuote) {
  // ── Ensure linked booking exists (PRIMARY / ONWARD quote) ──────────
  if (!bookingId) {
    // No booking yet — create one. Tracking ID comes from its own atomic
    // sequence (lib/number-series.ts) — it used to be derived by swapping
    // the lead number's "BDL-" prefix for "BDA-", which meant a booking's
    // number was never actually independent of its lead. That's fine as
    // long as every lead is genuinely a new inquiry (now true — see
    // app/api/admin/leads/route.ts), but deriving it was never necessary
    // and isn't race-safe, so it's generated fresh here regardless.
    const trackingId = await nextTrackingId()

    const { data: newBooking, error: createErr } = await supabaseAdmin
      .from('bookings')
      .insert({
        tracking_id:    trackingId,
        // lead_id intentionally omitted — column may not exist in all DB schemas.
        // The link is maintained via leads.booking_id (updated below).
        customer_name:  lead.name,
        customer_phone: lead.phone,
        customer_phone_country_code: lead.phone_country_code ?? null,
        customer_phone_national:     lead.phone_national ?? null,
        customer_email: lead.email ?? '',
        service_type:   lead.service_type ?? lead.service_interest ?? '',
        from_city:      fromCity || lead.from_city || '',
        to_city:        toCity   || lead.to_city   || '',
        pickup_date:    pickupDtOverride ? pickupDtOverride.slice(0, 10) : (lead.pickup_date ?? null),
        delivery_date:  deliveryDateOverride ?? lead.delivery_date ?? null,
        time_slot:      pickupDtOverride ? pickupDtOverride.slice(11, 16) : (lead.pickup_time ?? null),
        pickup_address: pickupAddrOverride ?? lead.pickup_address ?? null,
        total_bags:     bags,
        total_amount:   total,
        status:         'quote_created',
        status_history: [{
          from:       null,
          to:         'quote_created',
          timestamp:  new Date().toISOString(),
          changed_by: 'system',
          note:       `Auto-created during quote generation for lead ${lead.lead_number}`,
        }],
      })
      .select('id, tracking_id')
      .single()

    if (createErr) {
      // Could happen if tracking_id already exists (race condition or stale lead.booking_id).
      // Find the existing booking, re-link it, and un-cancel it if necessary.
      console.warn('[generate-quote] auto-create booking failed:', createErr.message)
      const { data: existing } = await supabaseAdmin
        .from('bookings')
        .select('id, status')
        .eq('tracking_id', trackingId)
        .maybeSingle()
      if (existing?.id) {
        bookingId = existing.id
        // Re-link booking → lead
        await supabaseAdmin.from('leads').update({ booking_id: bookingId }).eq('id', lead.id)
        // Un-cancel: if the booking was cancelled (e.g., from a prior delete/error),
        // reset it to quote_created so the lead becomes visible again in all modules.
        // (lead_id omitted — may not exist in older DB schemas)
        await supabaseAdmin.from('bookings').update({
          total_amount: total,
          notes:        null,
          ...(!existing.status || existing.status === 'cancelled'
            ? { status: 'quote_created' }
            : {}),
        }).eq('id', bookingId)
        console.log(`[generate-quote] Recovered booking ${trackingId} (was: ${existing.status ?? 'unknown'}) for lead ${lead.lead_number}`)
      }
    } else if (newBooking) {
      bookingId = newBooking.id
      await supabaseAdmin.from('leads').update({ booking_id: bookingId }).eq('id', lead.id)
      console.log(`[generate-quote] Auto-created booking ${trackingId} for lead ${lead.lead_number}`)
    }
  } else {
    // ── Primary quote: update existing booking ────────────────────
    // Fetch current booking status so we don't accidentally downgrade it.
    const { data: existingBooking } = await supabaseAdmin
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .maybeSingle()

    const currentStatus = existingBooking?.status ?? null
    // Can update status unless the booking has genuinely progressed past the
    // quote stage. Any unrecognized/legacy status (not just the known early
    // ones) defaults to advanceable — see PROTECTED_LATE_STAGE_STATUSES above.
    const canUpdateStatus = !currentStatus || !PROTECTED_LATE_STAGE_STATUSES.has(currentStatus)

    const bookingUpdates: Record<string, unknown> = {
      total_amount: total,
      // Keep the booking's customer info in sync with the lead — otherwise a
      // booking created against an older name/email (e.g. reused via the
      // duplicate-phone path) stays stale forever and won't show up when
      // searching the Dashboard by the customer's current name.
      customer_name:  lead.name,
      customer_email: lead.email ?? '',
      // Only reset to quote_created if booking hasn't progressed past the quote stage
      ...(canUpdateStatus ? { status: 'quote_created' } : {}),
    }
    if (fromCityOverride)     bookingUpdates.from_city      = fromCity
    if (toCityOverride)       bookingUpdates.to_city        = toCity
    if (bagsCountOverride)    bookingUpdates.total_bags     = bags
    if (pickupAddrOverride)   bookingUpdates.pickup_address = pickupAddrOverride
    if (pickupDtOverride) {
      bookingUpdates.pickup_date = pickupDtOverride.slice(0, 10)
      bookingUpdates.time_slot   = pickupDtOverride.slice(11, 16)
    }
    if (deliveryDateOverride) bookingUpdates.delivery_date  = deliveryDateOverride

    const { error: bookingErr } = await supabaseAdmin
      .from('bookings')
      .update(bookingUpdates)
      .eq('id', bookingId)

    if (bookingErr) {
      console.warn('[generate-quote] booking update non-fatal:', bookingErr.message)
    }
    if (!canUpdateStatus) {
      console.log(`[generate-quote] Preserved booking status '${currentStatus}' — not downgraded to quote_created`)
    }
  }
  } else {
    // ── RETURN LEG: independent booking, separate from the primary
    // (onward) booking linked via lead.booking_id ─────────────────────
    // This is Phase 1 of Return Trip support: the return leg gets its
    // own booking row (trip_leg: 'return') with its own status, so it
    // can later carry its own LR / driver assignment / status workflow
    // without ever touching the onward booking. Tracking ID mirrors the
    // PRIMARY BOOKING's own real tracking_id (BDA-2026-0001 onward ->
    // BDA-2026-0001-R return) — same inquiry's return leg, not a new
    // inquiry, so it intentionally reuses that number instead of minting
    // a fresh one. Previously derived from lead.lead_number instead,
    // which matched 1:1 only because the primary booking's own number
    // used to be derived the same way; now that the primary's number
    // comes from its own atomic sequence, this reads it directly off the
    // primary booking row so the two can never drift apart.
    let returnBookingId: string | null = lead.return_booking_id ?? null
    let primaryTrackingId = lead.lead_number.replace(/^BDL-/, 'BDA-') // fallback only
    if (lead.booking_id) {
      const { data: primaryBooking } = await supabaseAdmin
        .from('bookings').select('tracking_id').eq('id', lead.booking_id).maybeSingle()
      if (primaryBooking?.tracking_id) primaryTrackingId = primaryBooking.tracking_id
    }
    const returnTrackingId = primaryTrackingId + '-R'
    const returnPickupDate = pickupDtOverride ? pickupDtOverride.slice(0, 10) : null
    const returnPickupTime = pickupDtOverride ? pickupDtOverride.slice(11, 16) : null

    if (!returnBookingId) {
      const { data: newReturnBooking, error: createErr } = await supabaseAdmin
        .from('bookings')
        .insert({
          tracking_id:    returnTrackingId,
          trip_leg:       'return',
          customer_name:  lead.name,
          customer_phone: lead.phone,
          customer_phone_country_code: lead.phone_country_code ?? null,
          customer_phone_national:     lead.phone_national ?? null,
          customer_email: lead.email ?? '',
          service_type:   lead.service_type ?? lead.service_interest ?? '',
          from_city:      fromCity || '',
          to_city:        toCity   || '',
          pickup_date:    returnPickupDate,
          delivery_date:  deliveryDateOverride ?? null,
          time_slot:      returnPickupTime,
          pickup_address: pickupAddrOverride ?? null,
          drop_address:   dropAddrOverride ?? null,
          total_bags:     bags,
          total_amount:   total,
          status:         'quote_created',
          status_history: [{
            from:       null,
            to:         'quote_created',
            timestamp:  new Date().toISOString(),
            changed_by: 'system',
            note:       `Auto-created for return journey quote ${quoteNumber} (lead ${lead.lead_number})`,
          }],
        })
        .select('id, tracking_id')
        .single()

      if (createErr) {
        console.warn('[generate-quote] return-leg booking create failed:', createErr.message)
        const { data: existing } = await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('tracking_id', returnTrackingId)
          .maybeSingle()
        if (existing?.id) returnBookingId = existing.id
      } else if (newReturnBooking) {
        returnBookingId = newReturnBooking.id
        console.log(`[generate-quote] Auto-created return-leg booking ${returnTrackingId} for lead ${lead.lead_number}`)
      }

      if (returnBookingId) {
        await supabaseAdmin.from('leads').update({ return_booking_id: returnBookingId }).eq('id', lead.id)
      }
    } else {
      // Update existing return-leg booking — same "don't downgrade a
      // progressed status" protection as the primary booking gets.
      const { data: existingReturnBooking } = await supabaseAdmin
        .from('bookings')
        .select('status')
        .eq('id', returnBookingId)
        .maybeSingle()

      const currentStatus = existingReturnBooking?.status ?? null
      const canUpdateStatus = !currentStatus || !PROTECTED_LATE_STAGE_STATUSES.has(currentStatus)

      const returnBookingUpdates: Record<string, unknown> = {
        total_amount:   total,
        customer_name:  lead.name,
        customer_email: lead.email ?? '',
        ...(canUpdateStatus ? { status: 'quote_created' } : {}),
      }
      if (fromCityOverride)     returnBookingUpdates.from_city      = fromCity
      if (toCityOverride)       returnBookingUpdates.to_city        = toCity
      if (bagsCountOverride)    returnBookingUpdates.total_bags     = bags
      if (pickupAddrOverride)   returnBookingUpdates.pickup_address = pickupAddrOverride
      if (dropAddrOverride)     returnBookingUpdates.drop_address   = dropAddrOverride
      if (pickupDtOverride) {
        returnBookingUpdates.pickup_date = returnPickupDate
        returnBookingUpdates.time_slot   = returnPickupTime
      }
      if (deliveryDateOverride) returnBookingUpdates.delivery_date = deliveryDateOverride

      const { error: bookingErr } = await supabaseAdmin
        .from('bookings')
        .update(returnBookingUpdates)
        .eq('id', returnBookingId)

      if (bookingErr) {
        console.warn('[generate-quote] return-leg booking update non-fatal:', bookingErr.message)
      }
      if (!canUpdateStatus) {
        console.log(`[generate-quote] Preserved return-leg booking status '${currentStatus}' — not downgraded to quote_created`)
      }
    }
  }

  console.log(`[generate-quote] ${isReturnQuote ? 'Return quote' : 'Quote'} ${quoteNumber} saved for lead ${lead.lead_number} | Total: ₹${total}`)

  // ── Send quote email to customer if requested ─────────────────────
  let sentToCustomer = false
  const sendEmailFlag = body.send_email === true
  const customerEmail = (lead.email as string | null) ?? null

  if (sendEmailFlag && customerEmail) {
    try {
      const emailResult = await sendQuoteEmail({
        customerName:  lead.name,
        customerEmail,
        quoteNumber,
        fromCity,
        toCity,
        bagsCount:     bags,
        pickupDate:    pickupDtOverride ?? lead.pickup_date ?? null,
        deliveryDate:  deliveryDateOverride ?? lead.delivery_date ?? null,
        lineItems:     lineItems.map(i => ({ name: i.name, quantity: i.quantity, rate: i.rate, amount: i.amount })),
        subtotal,
        discountAmt:   discountAmt > 0 ? discountAmt : null,
        discountPct:   (discountType !== 'fixed' && discountRate > 0) ? discountRate : null,
        tax:           taxAmt,
        total,
        notes:         customer_notes ?? lead.notes ?? null,
        salesperson:   salesperson_name ?? (lead.salesperson_name as string | null) ?? null,
      })
      sentToCustomer = emailResult.success
      if (!emailResult.success) {
        console.warn('[generate-quote] Email failed:', emailResult.error)
      }
    } catch (e) {
      console.warn('[generate-quote] Email exception:', e)
    }
  } else if (sendEmailFlag && !customerEmail) {
    console.warn('[generate-quote] send_email=true but lead has no email address')
  }

  // ── Advance booking to quote_sent if email was sent (primary quotes only) ──
  // For return quotes, the booking status is managed independently.
  if (sentToCustomer && bookingId && !isReturnQuote) {
    const { data: bk } = await supabaseAdmin
      .from('bookings').select('status').eq('id', bookingId).maybeSingle()
    if (bk && QUOTE_STAGE_STATUSES.has(bk.status ?? '')) {
      await supabaseAdmin
        .from('bookings')
        .update({ status: 'quote_sent' })
        .eq('id', bookingId)
      console.log(`[generate-quote] Booking ${bookingId} advanced to quote_sent (email sent)`)
    }
  }

  return NextResponse.json({
    success:           true,
    quote_number:      quoteNumber,
    estimate_number:   quoteNumber,
    estimate_id:       null,
    is_return_quote:   isReturnQuote,
    total,
    subtotal,
    discount_pct:      discountRate,
    discount_amt:      discountAmt,
    tax:               taxAmt,
    line_items:        lineItems,
    sent_to_customer:  sentToCustomer,
    zoho_url:          null,
  })
}
