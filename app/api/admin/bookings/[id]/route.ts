import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAdminRole, requireAdminAuth } from '@/lib/admin-auth'
import { notifyBookingStatus } from '@/lib/notifications'
import type { BookingStatus } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const role = getAdminRole(req)
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body   = await req.json().catch(() => ({}))

  const {
    status, notes, customer_name, customer_phone, customer_email,
    total_bags, total_amount, pickup_date, pickup_address, drop_address,
    payment_status, payment_method, payment_reference,
    approved_without_payment, delivery_date,
  } = body

  if (approved_without_payment && role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can approve without payment' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}

  if (total_amount         !== undefined) updates.total_amount         = Number(total_amount)
  if (customer_name        !== undefined) updates.customer_name        = customer_name.trim()
  if (customer_phone       !== undefined) {
    const raw = customer_phone.replace(/\D/g, '')
    updates.customer_phone = raw ? ('+91' + raw.replace(/^91/, '')) : ''
  }
  if (customer_email       !== undefined) updates.customer_email       = customer_email.trim().toLowerCase()
  if (total_bags           !== undefined) updates.total_bags           = Number(total_bags)
  if (pickup_date          !== undefined) updates.pickup_date          = pickup_date || null
  if (delivery_date        !== undefined) updates.delivery_date        = delivery_date || null
  if (pickup_address       !== undefined) updates.pickup_address       = pickup_address.trim() || null
  if (drop_address         !== undefined) updates.drop_address         = drop_address.trim() || null
  if (notes                !== undefined) updates.notes                = notes.trim() || null
  if (payment_status       !== undefined) updates.payment_status       = payment_status
  if (payment_method       !== undefined) updates.payment_method       = payment_method
  if (payment_reference    !== undefined) updates.payment_reference    = payment_reference?.trim() || null
  if (approved_without_payment !== undefined) {
    updates.approved_without_payment = approved_without_payment
    updates.approved_by = 'admin'
    if (approved_without_payment) updates.payment_status = 'approved_pending'
  }

  if (Object.keys(updates).length === 0 && !status) {
    return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 })
  }

  if (status) {
    // LOCK: completed bookings cannot have status changed
    const { data: currentBooking } = await supabaseAdmin
      .from('bookings').select('status').eq('id', id).single()
    if (currentBooking?.status === 'completed') {
      return NextResponse.json({ error: 'Booking is completed and cannot be modified' }, { status: 403 })
    }

    updates.status = status

    const { data: existing } = await supabaseAdmin
      .from('bookings')
      .select('status_history, customer_name, customer_phone, customer_email, tracking_id, from_city, to_city, total_amount, total_bags, payment_status, payment_method, payment_reference, service_type')
      .eq('id', id)
      .single()

    const history = existing?.status_history ?? []
    history.push({ status, timestamp: new Date().toISOString(), note: notes ?? null })
    updates.status_history = history

    if (status === 'delivered' && existing) {
      await autoCreateInvoice(id, existing)
    }

    // Auto-create a draft quote when booking is accepted (so it appears in Quotes tab)
    if (status === 'accepted' && existing) {
      autoCreateDraftQuote(id, existing).catch(err =>
        console.error('[booking patch] draft quote auto-create error:', err)
      )
    }

    if (existing) {
      notifyBookingStatus({
        customerName:  existing.customer_name,
        customerPhone: existing.customer_phone,
        customerEmail: existing.customer_email ?? '',
        trackingId:    existing.tracking_id,
        status:        status as BookingStatus,
        fromCity:      existing.from_city,
        toCity:        existing.to_city,
      }).catch(err => console.error('[booking patch] notification error:', err))
    }
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
}

// ── Auto-create (or fix ₹0) invoice on delivery ──────────────────
async function autoCreateInvoice(bookingId: string, booking: Record<string, unknown>) {
  const total   = Number(booking.total_amount ?? 0)
  const baseAmt = parseFloat((total / 1.05).toFixed(2))
  const cgst    = parseFloat((baseAmt * 0.025).toFixed(2))
  const sgst    = parseFloat((baseAmt * 0.025).toFixed(2))

  const invoicePayload = {
    booking_id:        bookingId,
    customer_name:     booking.customer_name as string,
    customer_phone:    booking.customer_phone as string,
    customer_email:    (booking.customer_email as string) ?? null,
    service_type:      (booking.service_type as string) ?? null,
    from_city:         booking.from_city as string,
    to_city:           booking.to_city as string,
    total_bags:        Number(booking.total_bags ?? 1),
    base_amount:       baseAmt,
    cgst,
    sgst,
    total_amount:      total,
    payment_status:    (booking.payment_status as string) ?? 'paid',
    payment_method:    (booking.payment_method as string) ?? null,
    payment_reference: (booking.payment_reference as string) ?? null,
    invoice_date:      new Date().toISOString().split('T')[0],
  }

  // Check if invoice already exists for this booking
  const { data: existingInv } = await supabaseAdmin
    .from('invoices')
    .select('id, total_amount')
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (existingInv) {
    // If existing invoice has correct amount, skip
    if (Number(existingInv.total_amount) > 0) {
      console.log(`[autoCreateInvoice] invoice already exists for booking ${bookingId}, skipping`)
      return
    }
    // Existing invoice has ₹0 (created by old buggy code) — update it with correct amounts
    const { error } = await supabaseAdmin
      .from('invoices')
      .update({ base_amount: baseAmt, cgst, sgst, total_amount: total, payment_status: invoicePayload.payment_status })
      .eq('id', existingInv.id)
    if (error) console.error('[autoCreateInvoice] update failed:', error.message)
    else console.log(`[autoCreateInvoice] updated ₹0 invoice for booking ${bookingId} → ₹${total}`)
    return
  }

  // No invoice yet — create one
  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .like('invoice_number', `BDI-${year}-%`)

  const seq    = String((count ?? 0) + 1).padStart(4, '0')
  const invNum = `BDI-${year}-${seq}`

  const { error } = await supabaseAdmin
    .from('invoices')
    .insert({ invoice_number: invNum, ...invoicePayload })

  if (error) console.error('[autoCreateInvoice] insert failed:', error.message)
  else console.log(`[autoCreateInvoice] created ${invNum} for booking ${bookingId} — ₹${total}`)
}

// ── Auto-create draft quote when booking is accepted ──────────────
async function autoCreateDraftQuote(bookingId: string, booking: Record<string, unknown>) {
  // Skip if quote already exists for this booking
  const { data: existing } = await supabaseAdmin
    .from('quotes')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (existing) return

  const year   = new Date().getFullYear()
  const prefix = `BDQ-${year}-`
  const { count } = await supabaseAdmin
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .like('quote_number', `${prefix}%`)

  const seq         = String((count ?? 0) + 1).padStart(4, '0')
  const quoteNumber = `${prefix}${seq}`

  const { error } = await supabaseAdmin.from('quotes').insert({
    quote_number:   quoteNumber,
    booking_id:     bookingId,
    customer_name:  booking.customer_name  as string,
    customer_phone: booking.customer_phone as string,
    customer_email: (booking.customer_email as string) ?? null,
    service_type:   ((booking.service_label || booking.service_type || 'Baggage Delivery') as string),
    from_city:      booking.from_city as string,
    to_city:        booking.to_city   as string,
    pickup_date:    (booking.pickup_date as string) ?? null,
    total_bags:     Number(booking.total_bags ?? 1),
    base_price:     0,
    cgst:           0,
    sgst:           0,
    total_amount:   0,
    status:         'draft',
    version:        1,
  })

  if (error) console.error('[autoCreateDraftQuote] failed:', error.message)
  else console.log(`[autoCreateDraftQuote] created ${quoteNumber} for booking ${bookingId}`)
}
