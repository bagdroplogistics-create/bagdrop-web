import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { DEFAULT_TITLE, formatCustomerName } from '@/lib/constants'
import { resolveGstTreatment, SAC_TRANSPORT } from '@/lib/zoho-books'
import { assignNextInvoiceNumber } from '@/lib/invoice-numbering'
import { pdf } from '@react-pdf/renderer'
// NOTE: lives under the (admin) route group, not this route's own folder —
// '@/app/...' resolves fine at import time (route-group parens only affect
// URL routing, not module resolution).
import InvoicePDF, { type InvoicePDFLineItem } from '@/app/(admin)/admin/invoices/[id]/InvoicePDF'

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
  // action instead of Download/Email/WhatsApp. Sorted oldest → newest so
  // working top-down assigns numbers in the correct chronological order.
  const { data: allInvoices, error: invErr } = await supabaseAdmin
    .from('invoices')
    .select('*')
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  const invoicedBookingIds = new Set((allInvoices ?? []).map(i => i.booking_id).filter(Boolean))

  const { data: doneBookings, error: bErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .in('status', DONE_STATUSES)
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

  merged.sort((a, b) => new Date(a.invoice_date ?? a.created_at).getTime() - new Date(b.invoice_date ?? b.created_at).getTime())

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

// Renders InvoicePDF server-side (same component the Download PDF button
// uses client-side — see app/(admin)/admin/invoices/[id]/InvoicePDF.tsx)
// straight from an already-saved invoice row, so the emailed PDF and the
// downloaded PDF are always pixel-identical. Never throws — a PDF failure
// must not block the invoice email itself from sending.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildInvoicePdfBase64(inv: any): Promise<string | null> {
  try {
    const lineItems: InvoicePDFLineItem[] = Array.isArray(inv.line_items) ? inv.line_items : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = InvoicePDF({
      invoiceNumber: inv.invoice_number,
      invoiceDate:   inv.invoice_date,
      dueDate:       inv.due_date ?? null,
      terms:         'Due on Receipt',
      poNumber:      inv.po_number ?? null,
      placeOfSupply: inv.place_of_supply ?? null,
      consignmentNo: inv.consignment_no ?? null,
      totalBags:     inv.total_bags ?? null,
      pickupDate:    inv.pickup_date ?? null,
      deliveryDate:  inv.delivery_date ?? null,
      billToName:    inv.customer_type === 'business' && inv.business_name
        ? inv.business_name
        : (formatCustomerName(inv.title, inv.customer_name) || inv.customer_name),
      billToAddress: inv.customer_address ?? null,
      billToPhone:   inv.customer_phone ?? null,
      billToEmail:   inv.customer_email ?? null,
      billToGstin:   inv.gst_number ?? null,
      shipToLabel:   'Ship To',
      shipToLines:   [inv.to_city, 'India'].filter(Boolean),
      lineItems,
      subtotal:      Number(inv.base_amount ?? 0),
      cgst:          Number(inv.cgst ?? 0),
      sgst:          Number(inv.sgst ?? 0),
      igst:          Number(inv.igst ?? 0),
      total:         Number(inv.total_amount ?? 0),
      paymentMade:   inv.payment_status === 'paid' ? Number(inv.total_amount ?? 0) : 0,
      balanceDue:    inv.payment_status === 'paid' ? 0 : Number(inv.total_amount ?? 0),
      notes:         inv.notes ?? null,
      termsText:     null,
      paid:          inv.payment_status === 'paid',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const blob = await pdf(el).toBlob()
    const arr  = await blob.arrayBuffer()
    return Buffer.from(arr).toString('base64')
  } catch (err) {
    console.error('[invoices POST] PDF generation for email attachment failed (non-fatal):', err)
    return null
  }
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
    .select('id, total_amount, invoice_number')
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

  // "P.O.#" on the PDF, Zoho-style — the referring agent if one was
  // recorded on the lead (e.g. "Aditya Sir"), else the in-house
  // salesperson who quoted it. Never hardcoded/fabricated: null renders no
  // P.O.# row at all (see InvoicePDF.tsx).
  const poNumber = lead?.agent_name?.trim() || lead?.salesperson_name?.trim() || null

  const total = Number(booking.total_amount ?? 0)
  const gstin = booking.gst_number ?? lead?.gst_number ?? null
  const { placeOfSupply, isInterstate } = resolveGstTreatment(gstin)

  const leadItems = (lead?.quote_line_items ?? []) as Array<{
    name?: string; description?: string; quantity?: number; rate?: number; amount?: number; hsn_or_sac?: string
  }>
  const items: InvoiceLineItemRow[] = leadItems.length > 0
    ? leadItems.map(li => ({
        name:        li.name ?? 'Baggage Delivery Service',
        description: li.description ?? '',
        hsn:         li.hsn_or_sac ?? SAC_TRANSPORT,
        quantity:    Number(li.quantity ?? 1),
        rate:        Number(li.rate ?? 0),
        amount:      Number(li.amount ?? (Number(li.quantity ?? 1) * Number(li.rate ?? 0))),
      }))
    : [{
        name: `Transportation of Goods (Upto ${Number(booking.total_bags ?? 1)} Bag${Number(booking.total_bags ?? 1) !== 1 ? 's' : ''}) — ${booking.from_city ?? ''} to ${booking.to_city ?? ''}`,
        description: 'Airport-to-Doorstep / Doorstep-to-Airport baggage delivery',
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
    invoice_date:      new Date().toISOString().split('T')[0],
    place_of_supply:   placeOfSupply,
    pickup_date:       booking.pickup_date ?? null,
    delivery_date:     booking.delivery_date ?? null,
    consignment_no:    consignmentNo,
    line_items:        lineItemsSnapshot,
    po_number:         poNumber,
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
