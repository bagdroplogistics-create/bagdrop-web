import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { DEFAULT_TITLE, formatCustomerName } from '@/lib/constants'
import { resolveGstTreatment, SAC_TRANSPORT } from '@/lib/zoho-books'
import { assignNextInvoiceNumber } from '@/lib/invoice-numbering'
import { generateInvoicePdfBuffer } from '@/lib/invoice-pdf'
// NOTE: lives under the (admin) route group, not this route's own folder —
// '@/app/...' resolves fine at import time (route-group parens only affect
// URL routing, not module resolution).
import { type InvoicePDFLineItem } from '@/app/(admin)/admin/invoices/[id]/InvoicePDF'

// Bookings whose workflow has reached (or passed) Completed — the set that
// should ever be eligible to appear on the Invoices tab. 'invoice_generated'
// and 'invoice_sent' are included alongside 'completed' because older
// bookings from before invoicing was decoupled from booking.status can
// still literally carry one of those two values as their real status (see
// the STATUS_ORDER comment in quotes/view/[lead_id]/page.tsx).
const DONE_STATUSES = ['completed', 'invoice_generated', 'invoice_sent']

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status    = searchParams.get('status')
  const search    = searchParams.get('search')
  const bookingId = searchParams.get('booking_id')
  const page   = parseInt(searchParams.get('page') ?? '1', 10)
  const limit  = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = (page - 1) * limit

  // Single-booking lookup — used by the booking workflow page purely to
  // check "does a real invoice already exist for this booking?". Left
  // exactly as before: real invoice rows only, no merging with bookings.
  if (bookingId) {
    const { data, error, count } = await supabaseAdmin
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invoices: data, total: count, page: 1, limit: data?.length ?? 0 })
  }

  // Main Invoices tab — every COMPLETED inquiry shows up here, not just
  // ones someone already clicked "Generate Invoice" for. Previously the
  // tab was a raw dump of the `invoices` table, so a completed booking
  // nobody had generated an invoice for simply never appeared — making it
  // impossible to work through the backlog and assign the local BLS26
  // series in the right order. Now: real invoices (any status/booking,
  // never hidden) PLUS one placeholder row per completed booking that
  // doesn't have a real invoice yet — those get a "Generate Invoice"
  // action instead of Download/Email/WhatsApp. Sorted newest → oldest so
  // the most recent activity shows first (standard admin-list convention).
  // Number assignment itself (assignNextInvoiceNumber(), see the POST
  // handler below) is driven by a database sequence keyed off the highest
  // existing invoice number, not by this display order, so reversing it
  // here doesn't risk numbers being assigned out of chronological order.
  const [{ data: allInvoicesRaw, error: invErr }, { data: testBookingRows }] = await Promise.all([
    supabaseAdmin.from('invoices').select('*'),
    supabaseAdmin.from('bookings').select('id').eq('is_test', true),
  ])
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  // `invoices` has no is_test column of its own — a real invoice tied to a
  // Test Mode booking is only excludable by cross-referencing booking_id.
  // Founder-reported 2026-09-05: a dummy test booking (Monali Patel,
  // GBL-2026-0001) must never show up here.
  const testBookingIds = new Set((testBookingRows ?? []).map(b => b.id as string))
  const allInvoices = (allInvoicesRaw ?? []).filter(i => !i.booking_id || !testBookingIds.has(i.booking_id))

  const invoicedBookingIds = new Set((allInvoices ?? []).map(i => i.booking_id).filter(Boolean))

  const { data: doneBookings, error: bErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .in('status', DONE_STATUSES)
    .eq('is_test', false)
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  const placeholders = (doneBookings ?? [])
    .filter(b => !invoicedBookingIds.has(b.id))
    .map(b => {
      const total    = Number(b.total_amount ?? 0)
      const subtotal = total > 0 ? parseFloat((total / 1.05).toFixed(2)) : 0
      const gstHalf  = total > 0 ? parseFloat(((total - subtotal) / 2).toFixed(2)) : 0
      return {
        id:                `pending-${b.id}`,
        invoice_number:    null,
        booking_id:        b.id,
        title:             b.title ?? null,
        customer_name:     b.customer_name,
        customer_phone:    b.customer_phone,
        customer_email:    b.customer_email ?? null,
        from_city:         b.from_city,
        to_city:           b.to_city,
        total_bags:        b.total_bags,
        base_amount:       subtotal,
        cgst:              gstHalf,
        sgst:              gstHalf,
        total_amount:      total,
        payment_status:    b.payment_status ?? 'pending',
        payment_method:    b.payment_method ?? null,
        payment_reference: b.payment_reference ?? null,
        sent_email:        false,
        sent_whatsapp:     false,
        invoice_date:      b.updated_at,
        created_at:        b.updated_at,
        generated:         false,
      }
    })

  let merged = [
    ...(allInvoices ?? []).map(i => ({ ...i, generated: true })),
    ...placeholders,
  ]

  merged.sort((a, b) => new Date(b.invoice_date ?? b.created_at).getTime() - new Date(a.invoice_date ?? a.created_at).getTime())

  if (status === 'not_generated') merged = merged.filter(r => !r.generated)
  else if (status && status !== 'all') merged = merged.filter(r => r.payment_status === status)
  if (search) {
    const q = search.toLowerCase()
    merged = merged.filter(r =>
      (r.customer_name ?? '').toLowerCase().includes(q) ||
      (r.customer_phone ?? '').includes(q) ||
      (r.invoice_number ?? '').toLowerCase().includes(q)
    )
  }

  const total = merged.length
  const paged = merged.slice(offset, offset + limit)

  return NextResponse.json({ invoices: paged, total, page, limit })
}

export const runtime = 'nodejs'

interface InvoiceLineItemRow {
  name: string; description: string; hsn: string
  quantity: number; rate: number; amount: number
}

// Thin wrapper around lib/invoice-pdf.ts's shared generateInvoicePdfBuffer()
// (same component the Download PDF button uses client-side, and the same
// buffer GET /api/admin/invoices/[id]/pdf/route.ts serves to the mobile
// app) — converts to base64 for the email-attachment call sites below.
// Never throws — a PDF failure must not block the invoice email itself
// from sending.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildInvoicePdfBase64(inv: any): Promise<string | null> {
  const buf = await generateInvoicePdfBuffer(inv)
  return buf ? buf.toString('base64') : null
}

// ── Manual "New Invoice" creation (Zoho Books parity) ───────────────────
// See app/(admin)/admin/invoices/new/page.tsx and
// supabase/migrations/20260818e_manual_invoice_fields.sql. Unlike the
// booking-derived flow below, every field here comes straight from the
// admin's typed input — a freely-picked customer (no booking required)
// and a hand-built item table, one row per line item, each with its own
// tax mode (this app still only ever applies one uniform GST rate per
// LINE, not a full multi-rate-per-invoice system — matches the existing
// "this app never mixes multiple GST rates on one invoice" constraint,
// just applied per-row instead of per-invoice so a manual invoice can mix
// a couple of differently-taxed lines if genuinely needed).
//
// Tax/discount/TDS ordering (documented since it's a judgment call, not a
// literal spec): Subtotal = sum of item amounts (each item's own tax is
// computed on ITS OWN amount, unaffected by discount) → Discount is a
// flat deduction off the subtotal, shown as its own line, not redistributed
// per-item → TDS/TCS is computed as a percentage of (subtotal - discount +
// total tax) → Adjustment is added/subtracted last. This matches how most
// simple invoicing tools (and Zoho's own default behavior) order these,
// but flagging it since Zoho's TDS/TCS base can be configured differently
// per account.
interface ManualLineItemInput {
  name?: string; description?: string; hsn?: string
  quantity?: number; rate?: number
  taxMode?: 'gst5' | 'igst5' | 'none'
}

async function createManualInvoice(body: Record<string, unknown>) {
  const customerName = (body.customer_name as string ?? '').trim()
  if (!customerName) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
  if (!body.pickup_date) return NextResponse.json({ error: 'Pickup date is required' }, { status: 400 })

  const rawItems = Array.isArray(body.line_items) ? (body.line_items as ManualLineItemInput[]) : []
  const validItems = rawItems.filter(i => (i.name ?? '').toString().trim() && Number(i.rate) > 0)
  if (validItems.length === 0) {
    return NextResponse.json({ error: 'At least one item with a name and rate is required' }, { status: 400 })
  }

  const gstin = (body.gst_number as string) || null

  const lineItemsSnapshot: InvoicePDFLineItem[] = validItems.map(i => {
    const quantity = Number(i.quantity ?? 1) || 1
    const rate     = Number(i.rate ?? 0) || 0
    const amount   = parseFloat((quantity * rate).toFixed(2))
    const mode     = i.taxMode ?? 'gst5'
    const base = {
      name: (i.name ?? '').toString().trim(),
      description: (i.description ?? '').toString().trim() || null,
      hsn: (i.hsn ?? '').toString().trim() || SAC_TRANSPORT,
      quantity, rate, amount,
    }
    if (mode === 'igst5') {
      return { ...base, igstPct: 5, igstAmt: parseFloat((amount * 0.05).toFixed(2)) }
    }
    if (mode === 'none') {
      return { ...base }
    }
    return { ...base, cgstPct: 2.5, cgstAmt: parseFloat((amount * 0.025).toFixed(2)), sgstPct: 2.5, sgstAmt: parseFloat((amount * 0.025).toFixed(2)) }
  })

  const subtotal = parseFloat(lineItemsSnapshot.reduce((s, i) => s + i.amount, 0).toFixed(2))
  const cgst = parseFloat(lineItemsSnapshot.reduce((s, i) => s + (i.cgstAmt ?? 0), 0).toFixed(2))
  const sgst = parseFloat(lineItemsSnapshot.reduce((s, i) => s + (i.sgstAmt ?? 0), 0).toFixed(2))
  const igst = parseFloat(lineItemsSnapshot.reduce((s, i) => s + (i.igstAmt ?? 0), 0).toFixed(2))

  const discountPercent = Number(body.discount_percent) || 0
  const discountAmount  = parseFloat((subtotal * discountPercent / 100).toFixed(2))

  const beforeAdjustment = parseFloat((subtotal - discountAmount + cgst + sgst + igst).toFixed(2))

  const tdsTcsType    = body.tds_tcs_type === 'tds' || body.tds_tcs_type === 'tcs' ? body.tds_tcs_type : null
  const tdsTcsPercent = Number(body.tds_tcs_percent) || 0
  const tdsTcsAmount  = tdsTcsType ? parseFloat((beforeAdjustment * tdsTcsPercent / 100).toFixed(2)) : 0

  const adjustmentLabel  = (body.adjustment_label as string) || null
  const adjustmentAmount = Number(body.adjustment_amount) || 0

  const total = parseFloat((
    beforeAdjustment
    + (tdsTcsType === 'tcs' ? tdsTcsAmount : 0)
    - (tdsTcsType === 'tds' ? tdsTcsAmount : 0)
    + adjustmentAmount
  ).toFixed(2))

  const { placeOfSupply } = resolveGstTreatment(gstin)
  const invoiceDate = (body.invoice_date as string) || new Date().toISOString().split('T')[0]
  const dueDate      = (body.due_date as string) || invoiceDate

  let invoiceNumber: string
  try {
    invoiceNumber = await assignNextInvoiceNumber()
  } catch (err) {
    console.error('[invoices POST manual] Local invoice number assignment failed — no invoice was created:', err)
    return NextResponse.json({
      error: `Could not assign an invoice number, so no invoice was generated. Details: ${(err as Error)?.message ?? 'unknown error'}`,
    }, { status: 500 })
  }

  const payload = {
    invoice_number:     invoiceNumber,
    booking_id:          null,
    customer_name:       customerName,
    customer_phone:      (body.customer_phone as string) || '',
    customer_email:      (body.customer_email as string) || null,
    customer_address:    (body.customer_address as string) || null,
    customer_type:       (body.customer_type as string) || 'individual',
    business_name:       (body.business_name as string) || null,
    business_address:    (body.business_address as string) || null,
    gst_number:          gstin,
    service_type:        null,
    from_city:           (body.from_city as string) || '',
    to_city:             (body.to_city as string) || '',
    total_bags:          Number(body.total_bags) || 0,
    base_amount:         parseFloat((subtotal - discountAmount).toFixed(2)),
    cgst, sgst, igst,
    total_amount:        total,
    payment_status:      'pending',
    payment_method:      null,
    payment_reference:   null,
    notes:               (body.notes as string) || null,
    invoice_date:        invoiceDate,
    due_date:            dueDate,
    place_of_supply:     placeOfSupply,
    pickup_date:         body.pickup_date as string,
    delivery_date:       (body.delivery_date as string) || null,
    consignment_no:      (body.consignment_no as string) || null,
    line_items:          lineItemsSnapshot,
    po_number:           (body.salesperson as string) || null,
    order_number:        (body.order_number as string) || null,
    pickup_time:         (body.pickup_time as string) || null,
    delivery_time:       (body.delivery_time as string) || null,
    pickup_address:      (body.pickup_address as string) || null,
    delivery_address:    (body.delivery_address as string) || null,
    subject:             (body.subject as string) || null,
    terms_conditions:    (body.terms_conditions as string) || null,
    discount_percent:    discountPercent,
    discount_amount:     discountAmount,
    tds_tcs_type:        tdsTcsType,
    tds_tcs_percent:     tdsTcsPercent,
    tds_tcs_amount:      tdsTcsAmount,
    adjustment_label:    adjustmentLabel,
    adjustment_amount:   adjustmentAmount,
    is_manual:           true,
  }

  const { data: created, error: cErr } = await supabaseAdmin.from('invoices').insert(payload).select().single()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  let email_sent = false
  if (body.send_email && payload.customer_email) {
    const pdfBase64 = await buildInvoicePdfBase64(created)
    email_sent = await sendInvoiceEmail({
      to:               payload.customer_email,
      customerName:     formatCustomerName(null, payload.customer_name) || payload.customer_name,
      invoiceNumber,
      serviceType:      'Baggage Delivery',
      fromCity:         payload.from_city,
      toCity:           payload.to_city,
      totalBags:        payload.total_bags,
      baseAmount:       payload.base_amount,
      cgst:             payload.cgst,
      sgst:             payload.sgst,
      totalAmount:      payload.total_amount,
      paymentMethod:    'UPI',
      paymentReference: '',
      trackingId:       payload.consignment_no ?? '',
      pdfBase64,
    })
    if (email_sent) await supabaseAdmin.from('invoices').update({ sent_email: true }).eq('id', created.id)
  }

  return NextResponse.json({ invoice: created, action: 'created', email_sent }, { status: 201 })
}

// POST /api/admin/invoices — manually generate invoice from a booking_id.
//
// Invoice numbering: Bagdrop stopped creating invoices directly in Zoho
// Books after BLS2600042 — the last real Zoho-assigned number — and now
// uses its own software's local numbering going forward. A NEW invoice
// number is assigned atomically via a native Postgres sequence (see
// supabase/migrations/20260814_local_invoice_numbering.sql and
// lib/invoice-numbering.ts's assignNextInvoiceNumber()), continuing the
// exact same "BLS26" + 5-digit format starting at BLS2600043. This call
// cannot practically fail the way a live third-party API call could, but
// if the database itself is unreachable, no local invoice row is created
// — the admin sees the error and can retry, never silently getting a
// duplicate or fabricated number. Editing or re-generating an EXISTING
// invoice (the `existingInv` branch below) never re-assigns a number —
// same as before, it just updates the local row in place.
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)

  // ── Manual invoice (Zoho-style New Invoice form, no booking behind it) ──
  // Every OTHER invoice in this app is derived from a completed booking
  // (below) — this is the one path that creates a standalone invoice from
  // a freely-picked customer and a hand-typed item table, matching
  // app/(admin)/admin/invoices/new/page.tsx. Kept as an early, fully
  // separate branch rather than threading `manual` conditionals through
  // the booking-derived logic below, so the existing (heavily-relied-on)
  // booking → invoice flow is untouched.
  if (body?.manual) return createManualInvoice(body)

  if (!body?.booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const bookingId = body.booking_id

  const { data: booking, error: bErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single()

  if (bErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const { data: existingInv } = await supabaseAdmin
    .from('invoices')
    .select('id, total_amount, invoice_number, notes')
    .eq('booking_id', bookingId)
    .maybeSingle()

  // Linked lead — reused for the SAME line-item breakdown/GSTIN/terms
  // already generated for the quote (item 6/7's "use existing BagDrop
  // pricing/tax logic, do not recalculate differently"), instead of
  // reverse-engineering a single lump-sum line from total_amount whenever
  // a real quote breakdown is available. Best-effort: a booking with no
  // linked lead (e.g. very old data) still gets a valid single-line
  // invoice via the fallback below.
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('quote_line_items, gst_number, quote_terms, quote_notes, agent_name, salesperson_name')
    .eq('booking_id', bookingId)
    .maybeSingle()

  // "P.O.#" on the PDF, Zoho-style — always "Aditya Shah" (founder
  // request, 2026-08-19, revised same day after "Saurabh Muley" — a
  // pre-existing lead.salesperson_name value from before that name was
  // removed from the salesperson dropdown — was still showing on newly
  // generated invoices). No longer reads lead.agent_name/salesperson_name
  // at all for this field. Only applies to invoices generated from here on;
  // an already-saved invoice's stored po_number is untouched until that
  // invoice is regenerated.
  const poNumber = 'Aditya Shah'

  // Mandatory rule (founder spec, 2026-08-21): Invoice Date = booking's
  // Delivery Date — never the booking creation date, payment date, pickup
  // date, or today's system date. Falls back to pickup_date, then today,
  // ONLY if delivery_date is genuinely missing on this booking (some
  // older/manually-created bookings never had one populated) — hard-
  // blocking invoice generation entirely for those would be a bigger
  // regression than a clearly-logged fallback. due_date always equals
  // whatever invoice_date resolves to, matching this app's existing
  // "Due on Receipt" terms (see InvoicePDF.tsx).
  const invoiceDate = booking.delivery_date || booking.pickup_date || new Date().toISOString().split('T')[0]
  if (!booking.delivery_date) {
    console.warn(
      `[invoices POST] booking ${bookingId} has no delivery_date — invoice_date fell back to ${
        booking.pickup_date ? 'pickup_date' : "today's date"
      }. Per spec, Invoice Date should equal Delivery Date.`
    )
  }

  const total = Number(booking.total_amount ?? 0)
  const gstin = booking.gst_number ?? lead?.gst_number ?? null
  const { placeOfSupply, isInterstate } = resolveGstTreatment(gstin)

  const leadItems = (lead?.quote_line_items ?? []) as Array<{
    name?: string; description?: string; quantity?: number; rate?: number; amount?: number; hsn_or_sac?: string
  }>
  const items: InvoiceLineItemRow[] = leadItems.length > 0
    ? leadItems.map(li => ({
        name:        li.name ?? 'Baggage Delivery Service',
        // Description sub-line is intentionally dropped here at invoice-
        // generation time — per founder request (2026-08-19), boilerplate
        // text like "Airport-to-Doorstep / Doorstep-to-Airport baggage
        // delivery · SAC 996511" or "Per extra bag beyond 2 · SAC 996511"
        // (stored on the lead's own quote_line_items by the quote-creation
        // flow, which is untouched by this change — only how the invoice
        // RENDERS it, not how the quote computes/stores it) should never
        // appear on the invoice. `hsn`/`quantity`/`rate`/`amount` below are
        // all still read straight from the quote's own line items,
        // unchanged — this only blanks the descriptive sub-text.
        description: '',
        hsn:         li.hsn_or_sac ?? SAC_TRANSPORT,
        quantity:    Number(li.quantity ?? 1),
        rate:        Number(li.rate ?? 0),
        amount:      Number(li.amount ?? (Number(li.quantity ?? 1) * Number(li.rate ?? 0))),
      }))
    : [{
        name: `Transportation of Goods (Upto ${Number(booking.total_bags ?? 1)} Bag${Number(booking.total_bags ?? 1) !== 1 ? 's' : ''}) — ${booking.from_city ?? ''} to ${booking.to_city ?? ''}`,
        // Description sub-line intentionally left blank per founder
        // request (2026-08-19) — the "Airport-to-Doorstep / Doorstep-to-
        // Airport baggage delivery" text no longer shows on the invoice.
        // `hsn` (SAC 996511) below is untouched — a separate column,
        // still required for GST reporting.
        description: '',
        hsn:      SAC_TRANSPORT,
        quantity: 1,
        rate:     parseFloat((total / 1.05).toFixed(2)),
        amount:   parseFloat((total / 1.05).toFixed(2)),
      }]

  const subtotal = parseFloat(items.reduce((sum, i) => sum + i.amount, 0).toFixed(2))
  const cgst = isInterstate ? 0 : parseFloat((subtotal * 0.025).toFixed(2))
  const sgst = isInterstate ? 0 : parseFloat((subtotal * 0.025).toFixed(2))
  const igst = isInterstate ? parseFloat((subtotal * 0.05).toFixed(2)) : 0
  const grandTotal = parseFloat((subtotal + cgst + sgst + igst).toFixed(2))

  // Per-item tax breakdown, snapshotted onto the invoice row (line_items
  // jsonb) so the PDF never has to re-derive it later — see the migration
  // comment for why. Uniform rate across all items (this app never mixes
  // multiple GST rates on one invoice), so this always sums exactly to the
  // aggregate cgst/sgst/igst above.
  const lineItemsSnapshot: InvoicePDFLineItem[] = items.map(i => ({
    name: i.name, description: i.description || null, hsn: i.hsn,
    quantity: i.quantity, rate: i.rate, amount: i.amount,
    ...(isInterstate
      ? { igstPct: 5,   igstAmt: parseFloat((i.amount * 0.05).toFixed(2)) }
      : { cgstPct: 2.5, cgstAmt: parseFloat((i.amount * 0.025).toFixed(2)),
          sgstPct: 2.5, sgstAmt: parseFloat((i.amount * 0.025).toFixed(2)) }),
  }))

  const consignmentNo = booking.tracking_id ?? null

  const payload = {
    title:             booking.title ?? DEFAULT_TITLE,
    customer_name:     booking.customer_name,
    customer_phone:    booking.customer_phone,
    customer_email:    booking.customer_email ?? null,
    // Business Customer support — carried from the booking so the Invoice
    // shows the company name on Bill To. See supabase/migrations/
    // 20260807_business_customer_fields.sql.
    customer_type:     booking.customer_type ?? 'individual',
    business_name:     booking.business_name ?? null,
    business_address:  booking.business_address ?? null,
    // Falls back to the pickup address for individuals — bookings have no
    // dedicated "billing address" field of their own. Flagged as a known
    // simplification; a real Billing Address field would be a cleaner fix.
    customer_address:  booking.customer_type === 'business' ? (booking.business_address ?? null) : (booking.pickup_address ?? null),
    gst_number:        gstin,
    service_type:      booking.service_type ?? null,
    from_city:         booking.from_city,
    to_city:           booking.to_city,
    total_bags:        Number(booking.total_bags ?? 1),
    base_amount:       subtotal,
    cgst, sgst, igst,
    total_amount:      grandTotal,
    // Reflects the booking's REAL current payment_status rather than
    // assuming 'paid' — the PDF's PAID ribbon and Balance Due both key off
    // this, and item 13 explicitly requires PAID to only ever mean
    // "actually approved/received", never "invoice was generated".
    payment_status:    booking.payment_status ?? 'pending',
    payment_method:    booking.payment_method ?? null,
    payment_reference: booking.payment_reference ?? null,
    invoice_date:      invoiceDate,
    // Terms are always "Due on Receipt" (see InvoicePDF.tsx / buildPdfProps)
    // — due date is the invoice date itself, whatever that resolved to
    // above (was previously always today's date, independently of
    // invoice_date).
    due_date:          invoiceDate,
    place_of_supply:   placeOfSupply,
    pickup_date:       booking.pickup_date ?? null,
    delivery_date:     booking.delivery_date ?? null,
    consignment_no:    consignmentNo,
    line_items:        lineItemsSnapshot,
    po_number:         poNumber,
    // Optional admin remark — Booking Workflow's "Generate Invoice" step
    // now has a Remark field (founder spec, 2026-08-21). Falls back to
    // whatever was already saved on this invoice (existingInv.notes) when
    // not explicitly re-provided, so re-generating/resending an invoice
    // never silently wipes out a previously-entered remark.
    notes:             body.notes?.trim() || body.remark?.trim() || existingInv?.notes || null,
  }

  if (existingInv) {
    const { data: updated, error: uErr } = await supabaseAdmin
      .from('invoices')
      .update(payload)
      .eq('id', existingInv.id)
      .select()
      .single()
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

    let email_sent = false
    if (body.send_email && payload.customer_email) {
      const pdfBase64 = await buildInvoicePdfBase64(updated)
      email_sent = await sendInvoiceEmail({
        to:               payload.customer_email,
        customerName:     formatCustomerName(payload.title, payload.customer_name) || payload.customer_name,
        invoiceNumber:    existingInv.invoice_number,
        serviceType:      payload.service_type ?? 'Baggage Delivery',
        fromCity:         payload.from_city,
        toCity:           payload.to_city,
        totalBags:        payload.total_bags,
        baseAmount:       payload.base_amount,
        cgst:             payload.cgst,
        sgst:             payload.sgst,
        totalAmount:      payload.total_amount,
        paymentMethod:    payload.payment_method ?? 'UPI',
        paymentReference: payload.payment_reference ?? '',
        trackingId:       booking.tracking_id ?? '',
        pdfBase64,
      })
      if (email_sent) {
        await supabaseAdmin.from('invoices').update({ sent_email: true }).eq('id', existingInv.id)
      }
    }

    return NextResponse.json({ invoice: updated, action: 'updated', email_sent })
  }

  // ── NEW invoice — locally assigned number, continuing the Zoho series ──
  let invoiceNumber: string
  try {
    invoiceNumber = await assignNextInvoiceNumber()
  } catch (err) {
    console.error('[invoices POST] Local invoice number assignment failed — no invoice was created:', err)
    return NextResponse.json({
      error: `Could not assign an invoice number, so no invoice was generated. Details: ${(err as Error)?.message ?? 'unknown error'}`,
    }, { status: 500 })
  }

  const { data: created, error: cErr } = await supabaseAdmin
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      booking_id:     bookingId,
      ...payload,
    })
    .select()
    .single()

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  let email_sent = false
  if (body.send_email && payload.customer_email) {
    const pdfBase64 = await buildInvoicePdfBase64(created)
    email_sent = await sendInvoiceEmail({
      to:               payload.customer_email,
      customerName:     payload.customer_name,
      invoiceNumber:    invoiceNumber,
      serviceType:      payload.service_type ?? 'Baggage Delivery',
      fromCity:         payload.from_city,
      toCity:           payload.to_city,
      totalBags:        payload.total_bags,
      baseAmount:       payload.base_amount,
      cgst:             payload.cgst,
      sgst:             payload.sgst,
      totalAmount:      payload.total_amount,
      paymentMethod:    payload.payment_method ?? 'UPI',
      paymentReference: payload.payment_reference ?? '',
      trackingId:       booking.tracking_id ?? '',
      pdfBase64,
    })
    if (email_sent) {
      await supabaseAdmin.from('invoices').update({ sent_email: true }).eq('id', (created as { id: string }).id)
    }
  }

  return NextResponse.json({ invoice: created, action: 'created', email_sent })
}

// ── Invoice email via Resend ──────────────────────────────────────
async function sendInvoiceEmail(p: {
  to: string; customerName: string; invoiceNumber: string; serviceType: string
  fromCity: string; toCity: string; totalBags: number
  baseAmount: number; cgst: number; sgst: number; totalAmount: number
  paymentMethod: string; paymentReference: string; trackingId: string
  pdfBase64?: string | null
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false
  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 })

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:600px">

<!-- Header -->
<tr><td style="background:#FF6300;padding:28px 32px">
  <p style="margin:0;font-size:26px;font-weight:700;color:#fff">Bagdrop</p>
  <p style="margin:4px 0 0;font-size:13px;color:#ffe0cc">Baggage Delivered. Journey Simplified.</p>
</td></tr>

<!-- Green confirmation banner -->
<tr><td style="background:#16a34a;padding:12px 32px;text-align:center">
  <p style="margin:0;font-size:14px;font-weight:700;color:#fff">✅ Booking Confirmed — Payment Received</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px">
  <p style="margin:0 0 8px;font-size:15px;color:#374151">Hi <strong>${p.customerName}</strong>,</p>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
    Your payment has been received and your Bagdrop booking is <strong>confirmed</strong>.
    Please find your invoice below.
  </p>

  <!-- Invoice & Tracking -->
  <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
    <div style="background:#fff7f0;border:1px solid #ffedd5;border-radius:8px;padding:12px 20px;flex:1;min-width:140px">
      <p style="margin:0;font-size:10px;color:#9a3412;font-weight:700;text-transform:uppercase;letter-spacing:1px">Invoice</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#FF6300;font-family:monospace">${p.invoiceNumber}</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 20px;flex:1;min-width:140px">
      <p style="margin:0;font-size:10px;color:#14532d;font-weight:700;text-transform:uppercase;letter-spacing:1px">Booking ID</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#16a34a;font-family:monospace">${p.trackingId}</p>
    </div>
  </div>

  <!-- Service details -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px">
    <tr style="background:#f9fafb"><td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Service Details</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;width:42%">Service</td><td style="padding:9px 16px;font-size:13px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6">${p.serviceType}</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Route</td><td style="padding:9px 16px;font-size:13px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6">${p.fromCity} → ${p.toCity}</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Total Bags</td><td style="padding:9px 16px;font-size:13px;font-weight:600;color:#111827;border-top:1px solid #f3f4f6">${p.totalBags}</td></tr>
  </table>

  <!-- Pricing -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px">
    <tr style="background:#f9fafb"><td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Invoice Summary</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">Base Amount</td><td style="padding:9px 16px;font-size:13px;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${fmt(p.baseAmount)}</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">CGST 2.5%</td><td style="padding:9px 16px;font-size:13px;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${fmt(p.cgst)}</td></tr>
    <tr><td style="padding:9px 16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6">SGST 2.5%</td><td style="padding:9px 16px;font-size:13px;color:#111827;text-align:right;border-top:1px solid #f3f4f6">${fmt(p.sgst)}</td></tr>
    <tr style="background:#f0fdf4"><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#111827;border-top:2px solid #bbf7d0">Total Paid</td><td style="padding:12px 16px;font-size:18px;font-weight:700;color:#16a34a;text-align:right;border-top:2px solid #bbf7d0">${fmt(p.totalAmount)}</td></tr>
  </table>

  <!-- Payment info -->
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:24px">
    <p style="margin:0;font-size:12px;font-weight:700;color:#14532d;text-transform:uppercase;letter-spacing:1px">Payment Details</p>
    <p style="margin:6px 0 0;font-size:13px;color:#15803d">Method: ${p.paymentMethod.toUpperCase()}${p.paymentReference ? ` · Ref: ${p.paymentReference}` : ''}</p>
  </div>

  <p style="margin:0 0 4px;font-size:14px;color:#374151">Track your shipment or reach us anytime:</p>
  <p style="margin:0;font-size:14px;color:#374151">📞 <a href="tel:+916357115711" style="color:#FF6300;text-decoration:none">+91 63571 15711</a> &nbsp; 📧 <a href="mailto:info@bagdrop.co" style="color:#FF6300;text-decoration:none">info@bagdrop.co</a></p>
</td></tr>

<!-- Footer -->
<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© ${new Date().getFullYear()} Bagdrop Logistics Solutions Pvt. Ltd.</p>
</td></tr>

</table></td></tr></table>
</body></html>`

  try {
    const res  = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'Bagdrop <info@bagdrop.co>',
        to:      p.to,
        subject: `Booking Confirmed — Invoice ${p.invoiceNumber} | Bagdrop`,
        html,
        // Real generated PDF (InvoicePDF.tsx, same component the Download
        // PDF button uses) attached alongside the HTML body — satisfies
        // "suitable for email... suitable for accounting records" (spec
        // item 16). Omitted (not blocking) if PDF generation failed.
        ...(p.pdfBase64 ? { attachments: [{ filename: `${p.invoiceNumber}.pdf`, content: p.pdfBase64 }] } : {}),
      }),
    })
    const body = await res.json().catch(() => ({}))
    console.log('[sendInvoiceEmail] status:', res.status, 'body:', JSON.stringify(body))
    return res.ok
  } catch (e) { console.error('[sendInvoiceEmail] error:', e); return false }
}
