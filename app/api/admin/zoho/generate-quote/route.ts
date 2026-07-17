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

const GST_PCT = 5   // 5% total GST (2.5% CGST + 2.5% SGST)

// Booking statuses that are "early enough" to be safely downgraded to quote_created.
// Any status BEYOND these means the booking has progressed past the quote stage
// and must NOT be reset.
const QUOTE_STAGE_STATUSES = new Set([
  'inquiry', 'quote_created', 'quote_sent',
])

interface ExplicitItem {
  name:         string
  description?: string
  quantity:     number
  rate:         number
  tax_id?:      string
  hsn_or_sac?:  string
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
    amount:      i.quantity * i.rate,
  }))
}

function deriveQuoteNumber(leadNumber: string): string {
  // BDL-2026-0022 → QT-2026-0022
  const parts = leadNumber.split('-')
  return parts.length >= 3 ? 'QT-' + parts.slice(1).join('-') : 'QT-' + leadNumber
}

const ALIASES: Record<string, string> = {
  vadodara: 'baroda', vdr: 'baroda', brc: 'baroda',
  bengaluru: 'bangalore', blr: 'bangalore',
  bom: 'mumbai', nmia: 'mumbai',
  del: 'delhi', igi: 'delhi',
  amd: 'ahmedabad', amdairport: 'ahmedabad',
}
function normalise(city: string) {
  const s = city.toLowerCase().replace(/\s+/g, '')
  return ALIASES[s] ?? s
}

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
  // This is a return quote if the lead already has a primary quote number,
  // OR if the caller explicitly flags it as return.
  // Return quotes are stored in return_quote_* fields and do NOT touch
  // the primary quote data or downgrade the booking status.
  const isReturnQuote = forceReturnQuote === true || Boolean(lead.quote_number)

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
    // Route pricing DB lookup
    const fN = normalise(fromCity)
    const tN = normalise(toCity)

    const { data: route } = await supabaseAdmin
      .from('route_pricing')
      .select('base_price, per_bag_rate')
      .eq('is_active', true)
      .or(`and(from_city.eq.${fN},to_city.eq.${tN}),and(from_city.eq.${tN},to_city.eq.${fN})`)
      .limit(1)
      .single()

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
      ...(pickupDtOverride  ? { return_pickup_date: pickupDtOverride.slice(0, 10) } : {}),
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

  // ── Ensure linked booking exists ──────────────────────────────────
  let bookingId: string | null = lead.booking_id ?? null

  if (!bookingId) {
    // No booking yet — create one.
    // Derive tracking ID from lead number (BDL-2026-0001 → BDA-2026-0001)
    const trackingId = lead.lead_number.replace(/^BDL-/, 'BDA-')

    const { data: newBooking, error: createErr } = await supabaseAdmin
      .from('bookings')
      .insert({
        tracking_id:    trackingId,
        // lead_id intentionally omitted — column may not exist in all DB schemas.
        // The link is maintained via leads.booking_id (updated below).
        customer_name:  lead.name,
        customer_phone: lead.phone,
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
  } else if (!isReturnQuote) {
    // ── Primary quote: update existing booking ────────────────────
    // Fetch current booking status so we don't accidentally downgrade it.
    const { data: existingBooking } = await supabaseAdmin
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .maybeSingle()

    const currentStatus = existingBooking?.status ?? null
    // Can update status if:
    //   - booking is brand new (no status)
    //   - booking is still in early quote stages
    //   - booking was cancelled and is being reactivated via a new quote
    const canUpdateStatus = !currentStatus || QUOTE_STAGE_STATUSES.has(currentStatus) || currentStatus === 'cancelled'

    const bookingUpdates: Record<string, unknown> = {
      total_amount: total,
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
  // NOTE: for return quotes (isReturnQuote === true), booking status is intentionally NOT changed.

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
