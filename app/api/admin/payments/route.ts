import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { STATUS_ORDER } from '@/lib/lifecycle-notifications'
import { recomputeBookingPaymentStatus } from '@/lib/payment-status'
import { resolveCustomerTitle, DEFAULT_TITLE } from '@/lib/constants'

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
  // Added to match Zoho Books' Payments Received columns (Invoice#, Unused
  // Amount) — both computed below in GET, never stored on the payments
  // table itself. invoice_number is resolved via the shared booking_id
  // (invoices.payment_id exists on the table but nothing that creates an
  // invoice ever sets it, so booking_id is the only reliable link).
  invoice_number?: string | null
  unused_amount?: number
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
    // Test Mode bookings must never surface as a synthetic "no payment
    // logged yet" row — founder-reported 2026-09-05: a dummy test group
    // booking (Monali Patel, GBL-2026-0001) was showing up here with its
    // full amount as an "Approved (Unpaid)" line item.
    .eq('is_test', false)
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

  // `payments` has no is_test column of its own — a payment tied to a Test
  // Mode booking is only excludable by cross-referencing booking_id, so
  // fetch the set of test booking ids up front and filter against it below.
  const [{ data, error }, { data: testBookingRows }] = await Promise.all([
    query,
    supabaseAdmin.from('bookings').select('id').eq('is_test', true),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const testBookingIds = new Set((testBookingRows ?? []).map(b => b.id as string))

  // ── Hide a redundant payment-proof upload once a real payment also
  // exists for the same booking (2026-08-26, founder-reported: an approved
  // proof and a manually-recorded payment for the same money both showing
  // as separate rows here). First cut only hid the upload row when IT was
  // 'paid' — but a founder screenshot showed the same visual duplicate
  // with the upload row sitting at 'refunded' instead (BDP-2026-0007
  // upload/refunded + BDP-2026-0006 UPI/paid, both ₹5,250): someone had
  // already refunded the redundant upload row as a manual cleanup attempt,
  // and it STILL looked like two payments for the same money. The upload
  // row's own status was never really the point — once a real (non-upload)
  // PAID payment exists for a booking, that upload row is proof-only
  // documentation, not an independent financial event, no matter what
  // status it's since been moved to (paid, refunded, rejected, still
  // pending). So: hide EVERY upload-method row for a booking the moment a
  // real paid payment exists for it, regardless of the upload row's own
  // status. Nothing is deleted — the proof (proof_url/proof_type) and its
  // full history stay intact in the database and reachable from the
  // Booking Workflow page; it just never appears as a second line item
  // here once a real payment covers it.
  const rawPayments = ((data ?? []) as unknown as PaymentRecord[])
    .filter(p => !p.booking_id || !testBookingIds.has(p.booking_id))
  const byBookingId = new Map<string, PaymentRecord[]>()
  for (const p of rawPayments) {
    if (!p.booking_id) continue
    const list = byBookingId.get(p.booking_id) ?? []
    list.push(p)
    byBookingId.set(p.booking_id, list)
  }
  const redundantUploadIds = new Set<string>()
  for (const group of byBookingId.values()) {
    if (group.length < 2) continue
    const hasRealPaid = group.some(p => p.payment_method !== 'upload' && p.payment_status === 'paid')
    if (hasRealPaid) {
      for (const p of group) {
        if (p.payment_method === 'upload') redundantUploadIds.add(p.id)
      }
    }
  }
  const realPayments = rawPayments.filter(p => !redundantUploadIds.has(p.id))
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

  // Invoice# + Unused Amount — matches Zoho Books' Payments Received
  // columns. Resolved via booking_id (the reliable link — see the
  // PaymentRecord comment above) only for the page actually being
  // returned, not the full merged list, since this is purely a display
  // enrichment.
  const pageBookingIds = [...new Set(page_.map(p => p.booking_id).filter((id): id is string => !!id))]
  let invoiceByBooking: Record<string, { invoice_number: string; total_amount: number }> = {}
  if (pageBookingIds.length > 0) {
    const { data: invRows } = await supabaseAdmin
      .from('invoices')
      .select('booking_id, invoice_number, total_amount')
      .in('booking_id', pageBookingIds)
    invoiceByBooking = Object.fromEntries(
      (invRows ?? []).map(i => [i.booking_id as string, { invoice_number: i.invoice_number as string, total_amount: Number(i.total_amount ?? 0) }])
    )
  }

  const enriched = page_.map(p => {
    const inv = p.booking_id ? invoiceByBooking[p.booking_id] : undefined
    // No invoice yet for this booking: the whole payment is "unused" (not
    // applied against anything), matching Zoho's own definition. An
    // invoice exists and covers the payment: fully applied (0 unused). An
    // invoice exists but is smaller than the payment (overpayment): the
    // difference is unused.
    const unused_amount = !inv
      ? Number(p.amount)
      : Math.max(0, Number(p.amount) - inv.total_amount)
    return { ...p, invoice_number: inv?.invoice_number ?? null, unused_amount }
  })

  return NextResponse.json({ payments: enriched, total: merged.length, page, limit })
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.customer_name || !body?.amount) {
    return NextResponse.json({ error: 'customer_name and amount required' }, { status: 400 })
  }

  // Convert empty strings to null for UUID columns — PostgreSQL rejects ""
  const bookingId = (body.booking_id ?? '').toString().trim() || null

  // Payment Date — from the new Zoho-style Record Payment form (see
  // supabase/migrations/20260818b_payments_zoho_fields.sql). Written to
  // BOTH the dedicated payment_date column AND created_at, so every
  // existing read path that already displays/sorts by created_at (the
  // Payments table's Date column, the Payment Receipt panel's "Payment
  // Date" field) shows the admin-entered date with no further changes —
  // created_at otherwise defaults to "now" as before when omitted.
  const paymentDate = (body.payment_date ?? '').toString().trim() || null

  // ── Convert-not-duplicate guard (2026-08-26 fix) ────────────────────────
  // A customer's payment-proof screenshot can be uploaded and approved
  // (payment_method 'upload', payment_status 'paid' via app/api/admin/
  // bookings/[id]/payment-proof/route.ts and the Accounts verification
  // link) independently of — and before — anyone using THIS route
  // (Booking Workflow's "Mark Payment Received", or the Payments tab's own
  // Record Payment form) to log the same real-world payment. Because
  // countsTowardTotalPaid deliberately excludes 'upload' rows from the
  // ledger sum (lib/payment-ledger.ts, by design — a proof upload alone
  // was never meant to BE the ledger entry), the booking's outstanding
  // balance still shows the full amount as owed even after that proof is
  // approved. That used to mean a second, genuinely redundant 'paid' row
  // got inserted here for the exact same money — two separate line items
  // in the Payments tab for one real payment (founder-reported:
  // BDP-2026-0008/0009 and BDP-2026-0006/0007, both pairs same customer,
  // same amount, same day). Fix: when this request is recording a 'paid'
  // payment for a booking that has exactly one still-unconverted approved
  // upload payment, UPGRADE that existing row into the real ledger entry
  // instead of inserting a new one — same payment, same row id, now
  // correctly counted. Only triggers for payment_status 'paid' (a merely
  // 'pending' record here is a distinct in-progress payment, not a
  // confirmation of the proof already on file, so it inserts normally).
  // More than one matching upload row is deliberately left alone (falls
  // through to a normal insert) rather than guessing which one to convert.
  if (bookingId && (body.payment_status ?? 'pending') === 'paid') {
    // Every 'paid' row for this booking — not just upload ones. Only
    // convert when the upload row is the ONLY 'paid' payment on file
    // (nothing else already recorded this money). If a real, non-upload
    // 'paid' row already exists too, converting the upload row here would
    // just shift the duplicate instead of removing it — that combination
    // needs the dedicated cleanup route (app/api/admin/payments/
    // fix-duplicate-uploads/route.ts) or manual review, not a silent
    // overwrite here, so it falls through to a normal insert instead.
    const { data: existingPaid } = await supabaseAdmin
      .from('payments')
      .select('id, payment_method')
      .eq('booking_id', bookingId)
      .eq('payment_status', 'paid')
    const existingUploads = (existingPaid ?? []).filter(p => p.payment_method === 'upload')
    const existingNonUploads = (existingPaid ?? []).filter(p => p.payment_method !== 'upload')
    if (existingUploads.length === 1 && existingNonUploads.length === 0) {
      // Opportunistically correct the title too, if this request carries a
      // better one than whatever the original upload row defaulted to.
      const convertTitleRaw = resolveCustomerTitle(body.title, body.customer_name)
      const convertTitle = convertTitleRaw === 'M/S' ? DEFAULT_TITLE : convertTitleRaw
      const { data: converted, error: convertErr } = await supabaseAdmin
        .from('payments')
        .update({
          amount:             Number(body.amount),
          title:              convertTitle,
          payment_method:     body.payment_method ?? 'upi',
          payment_reference:  body.payment_reference?.trim() || null,
          notes:              body.notes?.trim() || 'Confirmed — converted from an approved payment-proof upload (no duplicate entry created)',
          ...(paymentDate ? { payment_date: paymentDate, created_at: new Date(paymentDate + 'T12:00:00').toISOString() } : {}),
          ...(body.bank_charges != null && body.bank_charges !== '' ? { bank_charges: Number(body.bank_charges) } : {}),
          ...(body.tds_deducted ? { tds_deducted: true, tds_amount: body.tds_amount != null && body.tds_amount !== '' ? Number(body.tds_amount) : null } : {}),
        })
        .eq('id', existingUploads[0].id)
        .select()
        .single()

      if (!convertErr && converted) {
        await supabaseAdmin.from('bookings').update({
          payment_method:    body.payment_method ?? 'upi',
          payment_reference: body.payment_reference?.trim() || null,
        }).eq('id', bookingId)
        await recomputeBookingPaymentStatus(bookingId)
        return NextResponse.json({ payment: converted, converted: true }, { status: 200 })
      }
      // Update failed for some reason (e.g. race) — fall through and
      // insert normally rather than silently dropping the payment.
      if (convertErr) console.error('[payments POST] convert-existing-upload failed, inserting new row instead:', convertErr.message)
    }
  }

  const paymentId = await nextPaymentId()

  // Resolve a real title instead of letting the payments.title column
  // silently fall back to its DB default ('Mr.' — see supabase/migrations/
  // 20260801_customer_title_COMPLETE_run_this.sql) for every new row. Uses
  // whatever title the caller supplied (e.g. an explicit selection, or a
  // customer-search result's title) if valid, otherwise guesses from the
  // name — see lib/constants.ts's resolveCustomerTitle for the precedence.
  // payments_title_check only allows 'Mr.'/'Mrs.'/'Ms.' (unlike TITLE_OPTIONS,
  // which also has 'M/S' for business bookings) — clamp so a business
  // customer's payment never fails the insert on a constraint violation.
  const resolvedTitleRaw = resolveCustomerTitle(body.title, body.customer_name)
  const resolvedTitle = resolvedTitleRaw === 'M/S' ? DEFAULT_TITLE : resolvedTitleRaw

  const { data, error } = await supabaseAdmin.from('payments').insert({
    payment_id:        paymentId,
    booking_id:        bookingId,
    title:             resolvedTitle,
    customer_name:     body.customer_name.trim(),
    customer_phone:    body.customer_phone?.trim() ?? '',
    amount:            Number(body.amount),
    payment_method:    body.payment_method ?? 'upi',
    payment_status:    body.payment_status ?? 'pending',
    payment_reference: body.payment_reference?.trim() || null,
    notes:             body.notes?.trim() || null,
    payment_date:       paymentDate,
    ...(paymentDate ? { created_at: new Date(paymentDate + 'T12:00:00').toISOString() } : {}),
    bank_charges:       body.bank_charges != null && body.bank_charges !== '' ? Number(body.bank_charges) : 0,
    tds_deducted:       !!body.tds_deducted,
    tds_amount:         body.tds_deducted && body.tds_amount != null && body.tds_amount !== '' ? Number(body.tds_amount) : null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Link payment method/reference back to the booking, and recompute its
  // derived payment_status from the full ledger (Total Paid vs Total Amount
  // — see lib/payment-status.ts). This used to blindly overwrite
  // bookings.payment_status with whatever status this one new payment was
  // created with, which broke multi-payment/partial-payment accounting: a
  // 2nd installment created as 'paid' would stomp a correctly-computed
  // 'partially_paid' from the total, and a 3rd payment logged as merely
  // 'pending' would wipe out an already-'paid' booking back to pending.
  if (bookingId && data) {
    await supabaseAdmin.from('bookings').update({
      payment_method:    body.payment_method ?? 'upi',
      payment_reference: body.payment_reference?.trim() || null,
    }).eq('id', bookingId)
    await recomputeBookingPaymentStatus(bookingId)
  }

  return NextResponse.json({ payment: data }, { status: 201 })
}
