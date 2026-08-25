import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { recomputeBookingPaymentStatus } from '@/lib/payment-status'

// One-time cleanup for the duplicate-payment bug fixed 2026-08-26 in POST
// /api/admin/payments (see that route's "Convert-not-duplicate guard"
// comment for the full root cause). Before that fix existed, a booking
// could end up with TWO separate 'paid' payments rows for the same real
// payment — one from an approved payment-proof upload (payment_method
// 'upload'), one from a manually-recorded payment (Mark Payment Received
// or the Payments tab's Record Payment form) — because the upload row is
// deliberately excluded from the Total Paid ledger sum, so the booking
// never looked "already paid" to whoever recorded the second one.
// Founder-reported examples: BDP-2026-0008/0009 (A P Joshipura) and
// BDP-2026-0010/0011 (Nidhi Vasava), both same booking, same day.
//
// This scans every booking's 'paid' payments for the shape: exactly one
// 'upload' row + exactly one non-upload row, nothing more ambiguous — and
// picks ONE of two safe actions based on the upload row's amount (never
// guesses beyond this):
//
//   1. Upload amount is 0 — this is the harmless case already handled
//      correctly by app/api/admin/bookings/[id]/payment-proof/route.ts's
//      outstanding-amount clamp (the proof was uploaded AFTER the real
//      payment already fully covered the total, so it correctly recorded
//      ₹0). It adds nothing and was never counted anyway — just DELETE the
//      upload row. The real, non-upload row is left completely untouched.
//
//   2. Upload amount equals the other row's amount (both > 0) — a genuine
//      duplicate of the same real payment. UPGRADE the upload row (it
//      carries the actual proof_url/proof_type evidence) by setting its
//      payment_method to match the other row's method, then DELETE the
//      now-redundant other row.
//
// Any other shape — amounts that differ and neither is 0 (could be two
// genuinely different payments, e.g. a partial top-up), more than one
// upload row, or more than one non-upload row — is left completely alone
// and reported under `ambiguous` for manual review. This never deletes or
// merges anything it isn't certain is a true duplicate, and never changes
// a customer's actual paid total either way.
//
// GET  — preview only, makes no changes.
// POST — actually performs the fix for every currently-fixable pair.

export const runtime = 'nodejs'

interface PaymentRow {
  id: string
  booking_id: string | null
  amount: number
  payment_method: string | null
  payment_reference: string | null
  customer_name: string | null
}

interface FixablePair {
  booking_id: string
  customer_name: string
  action: 'delete_empty_upload' | 'merge_upload_into_ledger'
  amount: number
  upload_payment_id: string
  other_payment_id: string
  other_payment_method: string
}

const AMOUNT_EPSILON = 0.01 // float rounding tolerance for "same amount"

async function scan(): Promise<{ fixable: FixablePair[]; ambiguousBookingIds: string[] }> {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('id, booking_id, amount, payment_method, payment_reference, customer_name')
    .eq('payment_status', 'paid')
    .not('booking_id', 'is', null)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as PaymentRow[]
  const byBooking = new Map<string, PaymentRow[]>()
  for (const r of rows) {
    if (!r.booking_id) continue
    const list = byBooking.get(r.booking_id) ?? []
    list.push(r)
    byBooking.set(r.booking_id, list)
  }

  const fixable: FixablePair[] = []
  const ambiguousBookingIds: string[] = []

  for (const [bookingId, group] of byBooking) {
    if (group.length < 2) continue
    const uploads = group.filter(p => p.payment_method === 'upload')
    const others  = group.filter(p => p.payment_method !== 'upload')
    if (uploads.length !== 1 || others.length !== 1) {
      if (uploads.length >= 1 && others.length >= 1) ambiguousBookingIds.push(bookingId)
      continue
    }

    const upload = uploads[0]
    const other  = others[0]
    const uploadAmount = Number(upload.amount ?? 0)
    const otherAmount  = Number(other.amount ?? 0)

    if (uploadAmount === 0) {
      fixable.push({
        booking_id: bookingId,
        customer_name: other.customer_name ?? upload.customer_name ?? 'Unknown',
        action: 'delete_empty_upload',
        amount: otherAmount,
        upload_payment_id: upload.id,
        other_payment_id: other.id,
        other_payment_method: other.payment_method ?? 'upi',
      })
    } else if (Math.abs(uploadAmount - otherAmount) < AMOUNT_EPSILON) {
      fixable.push({
        booking_id: bookingId,
        customer_name: other.customer_name ?? upload.customer_name ?? 'Unknown',
        action: 'merge_upload_into_ledger',
        amount: otherAmount,
        upload_payment_id: upload.id,
        other_payment_id: other.id,
        other_payment_method: other.payment_method ?? 'upi',
      })
    } else {
      // Amounts differ and neither is 0 — could be two genuinely different
      // payments (e.g. a partial top-up). Never guess which is "the" duplicate.
      ambiguousBookingIds.push(bookingId)
    }
  }

  return { fixable, ambiguousBookingIds }
}

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { fixable, ambiguousBookingIds } = await scan()
    return NextResponse.json({ fixable, ambiguousCount: ambiguousBookingIds.length, ambiguousBookingIds })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let fixable: FixablePair[]
  let ambiguousBookingIds: string[]
  try {
    ;({ fixable, ambiguousBookingIds } = await scan())
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const merged: FixablePair[] = []
  const failed: { booking_id: string; error: string }[] = []

  for (const pair of fixable) {
    if (pair.action === 'delete_empty_upload') {
      // The ₹0 upload row contributed nothing (already excluded from the
      // ledger, already correctly clamped to 0) — just remove it. The
      // real, non-upload row is never touched.
      const { error: deleteErr } = await supabaseAdmin
        .from('payments')
        .delete()
        .eq('id', pair.upload_payment_id)

      if (deleteErr) {
        failed.push({ booking_id: pair.booking_id, error: deleteErr.message })
        continue
      }
      merged.push(pair)
      continue
    }

    // action === 'merge_upload_into_ledger' — both rows carry the same
    // real amount. Keep the upload row (it has the actual proof evidence),
    // upgrade its method so it now counts toward Total Paid, then remove
    // the redundant manually-recorded row.
    const { data: converted, error: convertErr } = await supabaseAdmin
      .from('payments')
      .update({
        payment_method: pair.other_payment_method,
        notes: 'Confirmed — merged with a duplicate manually-recorded payment for the same booking (2026-08-26 cleanup, no amount change)',
      })
      .eq('id', pair.upload_payment_id)
      .select()
      .single()

    if (convertErr || !converted) {
      failed.push({ booking_id: pair.booking_id, error: convertErr?.message ?? 'update failed' })
      continue
    }

    const { error: deleteErr } = await supabaseAdmin
      .from('payments')
      .delete()
      .eq('id', pair.other_payment_id)

    if (deleteErr) {
      failed.push({ booking_id: pair.booking_id, error: `converted upload row but failed to delete duplicate: ${deleteErr.message}` })
      continue
    }

    merged.push(pair)
  }

  // Recompute once per affected booking (not per action) — cheap either
  // way here, but keeps this correct if a future edit adds more actions.
  for (const pair of merged) {
    await recomputeBookingPaymentStatus(pair.booking_id)
  }

  return NextResponse.json({
    mergedCount: merged.length,
    merged,
    failed,
    ambiguousCount: ambiguousBookingIds.length,
    ambiguousBookingIds,
  })
}
