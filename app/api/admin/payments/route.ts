import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { STATUS_ORDER } from '@/lib/lifecycle-notifications'

// Confirmed-or-later bookings that have no matching row in `payments` at all
// show up here as "no payment logged" — same slice used by
// app/api/admin/reports/operations/route.ts and the Payment report.
const CONFIRMED_ONWARD_STATUSES = STATUS_ORDER.slice(STATUS_ORDER.indexOf('confirmed'))

interface PaymentRecord {
  id: string; payment_id: string; booking_id: string | null
  title?: string | null
  customer_name: string; customer_phone: string; amount: number
  payment_method: string; payment_status: string; payment_reference: string | null
  notes: string | null; verified_by: string | null; verified_at: string | null
  refund_amount: number | null; created_at: string
  is_synthetic?: boolean
}

async function nextPaymentId(): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await supabaseAdmin
    .from('payments')
    .select('*', { count: 'exact', head: true })
    .like('payment_id', `BDP-${year}-%`)
  return `BDP-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`
}

// Bookings can reach a confirmed/paid state (e.g. "Mark Payment Received" in
// the quote view page, or the Skybird "approved without payment" path)
// entirely by patching bookings.payment_status directly — neither flow
// creates a row in `payments`. That left this page unable to show a large
// chunk of real payment activity, since it only ever queried `payments`.
// This synthesizes a payment-shaped row (id prefixed "booking:") for every
// confirmed-or-later booking that has no matching payments.booking_id, so
// the page (and its Total/Collected/Pending/Refunded cards) reflects every
// confirmed booking, not just the ones formally logged via Record Payment.
// Synthetic rows are display-only -- see the frontend for why Verify/Refund
// are disabled for them (there's no real payments.id to act on yet).
async function fetchUnloggedBookingPayments(existingBookingIds: Set<string>): Promise<PaymentRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, status, title, customer_name, customer_phone, total_amount, payment_status, payment_method, created_at')
    .in('status', CONFIRMED_ONWARD_STATUSES)
    .limit(5000)
  if (error) {
    console.warn('[admin/payments] unlogged-booking-payments query failed (non-fatal):', error.message)
    return []
  }
  type Row = { id: string; tracking_id: string; status: string; title: string | null; customer_name: string | null; customer_phone: string | null; total_amount: number | null; payment_status: string | null; payment_method: string | null; created_at: string }
  return ((data ?? []) as unknown as Row[])
    .filter(b => !existingBookingIds.has(b.id))
    .map(b => ({
      id:                `booking:${b.id}`,
      payment_id:        b.tracking_id,
      booking_id:        b.id,
      title:             b.title,
      customer_name:     b.customer_name ?? 'Unknown',
      customer_phone:    b.customer_phone ?? '',
      amount:            Number(b.total_amount) || 0,
      payment_method:    b.payment_method ?? 'upi',
      payment_status:    b.payment_status ?? 'pending',
      payment_reference: null,
      notes:             'Confirmed booking — no payment logged yet',
      verified_by:       null,
      verified_at:       null,
      refund_amount:     null,
      created_at:        b.created_at,
      is_synthetic:      true,
    }))
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status     = searchParams.get('status')
  const search     = searchParams.get('search')
  // Booking Workflow's Outstanding Amount calculation (spec item 14) —
  // when set, returns only this booking's real payments rows (skips the
  // synthetic-row merge below entirely, since that's only meant for the
  // all-bookings Payments tab view, not a single booking's ledger).
  const bookingId  = searchParams.get('booking_id')
  const page   = parseInt(searchParams.get('page') ?? '1', 10)
  const limit  = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = (page - 1) * limit

  if (bookingId) {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ payments: data ?? [], total: data?.length ?? 0, page: 1, limit: data?.length ?? 0 })
  }

  // Fetch every real payment row (uncapped by page/limit here — the merge
  // with synthetic booking-derived rows happens in-memory below, then the
  // combined list is paginated). Admin-tool volumes only, same .limit(5000)
  // ceiling used by the detailed-reports route.
  let query = supabaseAdmin.from('payments').select('*').order('created_at', { ascending: false }).limit(5000)
  if (status && status !== 'all') query = query.eq('payment_status', status)
  if (search) query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,payment_id.ilike.%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const realPayments = (data ?? []) as unknown as PaymentRecord[]
  const existingBookingIds = new Set(realPayments.map(p => p.booking_id).filter((id): id is string => !!id))

  let synthetic = await fetchUnloggedBookingPayments(existingBookingIds)
  if (status && status !== 'all') synthetic = synthetic.filter(p => p.payment_status === status)
  if (search) {
    const s = search.toLowerCase()
    synthetic = synthetic.filter(p =>
      p.customer_name.toLowerCase().includes(s) ||
      p.customer_phone.toLowerCase().includes(s) ||
      p.payment_id.toLowerCase().includes(s))
  }

  const merged = [...realPayments, ...synthetic].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const page_ = merged.slice(offset, offset + limit)

  return NextResponse.json({ payments: page_, total: merged.length, page, limit })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.customer_name || !body?.amount) {
    return NextResponse.json({ error: 'customer_name and amount required' }, { status: 400 })
  }

  const paymentId = await nextPaymentId()

  // Convert empty strings to null for UUID columns — PostgreSQL rejects ""
  const bookingId = (body.booking_id ?? '').toString().trim() || null

  const { data, error } = await supabaseAdmin.from('payments').insert({
    payment_id:        paymentId,
    booking_id:        bookingId,
    customer_name:     body.customer_name.trim(),
    customer_phone:    body.customer_phone?.trim() ?? '',
    amount:            Number(body.amount),
    payment_method:    body.payment_method ?? 'upi',
    payment_status:    body.payment_status ?? 'pending',
    payment_reference: body.payment_reference?.trim() || null,
    notes:             body.notes?.trim() || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Link payment status back to booking if provided
  if (bookingId && data) {
    await supabaseAdmin.from('bookings').update({
      payment_status:    body.payment_status ?? 'pending',
      payment_method:    body.payment_method ?? 'upi',
      payment_reference: body.payment_reference?.trim() || null,
    }).eq('id', bookingId)
  }

  return NextResponse.json({ payment: data }, { status: 201 })
}
