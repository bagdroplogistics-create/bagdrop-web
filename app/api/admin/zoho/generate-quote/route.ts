/**
 * POST /api/admin/zoho/generate-quote
 *
 * Generates a quote INTERNALLY in Supabase — no Zoho Books required.
 * Computes line items from route pricing (or explicit items passed by the frontend),
 * saves them to the leads table, and updates the linked booking total + status.
 *
 * Body:
 *   lead_id              string   (required)
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
  } = body as {
    lead_id:               string
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
  const taxAmt   = Math.round(subtotal * GST_PCT) / 100
  const total    = Math.round((subtotal + taxAmt) * 100) / 100

  // ── Internal quote number ─────────────────────────────────────────
  const quoteNumber = deriveQuoteNumber(lead.lead_number)
  const today       = new Date().toISOString().slice(0, 10)

  // ── Save to leads table ───────────────────────────────────────────
  const leadUpdates: Record<string, unknown> = {
    quote_number:         quoteNumber,
    quote_line_items:     lineItems,
    quote_total:          total,
    quote_subtotal:       subtotal,
    quote_tax:            taxAmt,
    quote_date:           today,
    // Clear any old Zoho fields — we no longer push to Zoho
    zoho_estimate_id:     null,
    zoho_estimate_number: quoteNumber,   // keep number field for display compatibility
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

  const { error: updateErr } = await supabaseAdmin
    .from('leads')
    .update(leadUpdates)
    .eq('id', lead_id)

  if (updateErr) {
    console.error('[generate-quote] lead update failed:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── Update linked booking ─────────────────────────────────────────
  if (lead.booking_id) {
    const bookingUpdates: Record<string, unknown> = {
      total_amount: total,
      status:       'quote_created',
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
      .eq('id', lead.booking_id)

    if (bookingErr) {
      console.warn('[generate-quote] booking update non-fatal:', bookingErr.message)
    }
  }

  console.log(`[generate-quote] Internal quote ${quoteNumber} created for lead ${lead.lead_number} | Total: ₹${total}`)

  // ── Send quote email to customer if requested ─────────────────────────
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

  // ── If email was successfully sent, advance booking to quote_sent ───
  // This ensures the workflow panel shows Step 4 (accept/reject) immediately,
  // instead of requiring a redundant second click of "Send Quote" in the workflow.
  if (sentToCustomer && lead.booking_id) {
    await supabaseAdmin
      .from('bookings')
      .update({ status: 'quote_sent' })
      .eq('id', lead.booking_id)
    console.log(`[generate-quote] Booking ${lead.booking_id} advanced to quote_sent (email sent)`)
  }

  return NextResponse.json({
    success:          true,
    quote_number:     quoteNumber,
    estimate_number:  quoteNumber,   // frontend compatibility
    estimate_id:      null,
    total,
    subtotal,
    tax:              taxAmt,
    line_items:       lineItems,
    sent_to_customer: sentToCustomer,
    zoho_url:         null,
  })
}
