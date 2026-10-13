import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getBranchAccess } from '@/lib/branch-auth'
import { createOrGetLrForBooking } from '@/lib/lr-auto-create'
import { citiesEqual } from '@/lib/city-normalize'

export const runtime = 'nodejs'
export const maxDuration = 60

// BAGDROP — LR/GC backfill for Completed bookings.
//
// POST /api/admin/lrs/backfill-completed
//   { dry_run?: boolean (default TRUE), batch_size?: number (default 5, max 50) }
//
// • Finds every Completed booking (Test Mode excluded) that has no LR/GC yet.
// • Each is checked for the data an LR needs. Anything missing, or whose pickup
//   city has no single active branch mapping, is FLAGGED for review — no
//   incomplete or wrongly-prefixed GC is ever created.
// • dry_run (default): returns the plan only — nothing is written.
// • Otherwise it creates up to `batch_size` GCs, oldest pickup date first so
//   numbers come out chronologically, and reports how many remain; the caller
//   repeats until remaining = 0.
// • Safe to retry / run twice: existing LRs are skipped, createOrGetLrForBooking
//   is idempotent, and lrs.booking_id has a UNIQUE constraint. A second run
//   cannot create duplicates. A module-level lock stops two overlapping runs.
// • Never changes booking status, payment status, or any inquiry/booking field.
// • Super-admin keys only (a branch key cannot bulk-generate across branches).

let running = false

interface Row {
  id: string
  tracking_id: string | null
  customer_name: string | null
  customer_phone: string | null
  from_city: string | null
  to_city: string | null
  pickup_date: string | null
  total_bags: number | null
  created_at: string
  is_test?: boolean | null
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (e) {
    console.error('[lr backfill] unhandled error', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected server error' }, { status: 500 })
  }
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const access = await getBranchAccess(req)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only an admin key can run the bulk GC generation.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; batch_size?: number }
  const dryRun = body.dry_run !== false
  const batchSize = Math.min(Math.max(Math.floor(Number(body.batch_size) || 5), 1), 50)

  // Completed bookings (paged), then every booking_id that already has an LR.
  const completed: Row[] = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('id, tracking_id, customer_name, customer_phone, from_city, to_city, pickup_date, total_bags, created_at, is_test')
      .eq('status', 'completed')
      .order('id')
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    completed.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }
  const withLr = new Set<string>()
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('lrs').select('booking_id').not('booking_id', 'is', null).order('id').range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const r of data ?? []) withLr.add(r.booking_id as string)
    if (!data || data.length < 1000) break
  }

  const { data: branches } = await supabaseAdmin
    .from('branches').select('id, branch_code, branch_name, city').eq('is_active', true)

  const candidates = completed.filter(b => !b.is_test && !withLr.has(b.id))
  const ready: Array<Row & { branch_code: string }> = []
  const flagged: Array<{ booking_id: string; tracking_id: string | null; customer_name: string | null; from_city: string | null; reasons: string[] }> = []

  for (const b of candidates) {
    const reasons: string[] = []
    if (!b.pickup_date) reasons.push('Missing pickup date')
    if (!b.customer_name?.trim()) reasons.push('Missing customer name')
    if (!b.from_city?.trim()) reasons.push('Missing pickup location')
    if (!b.to_city?.trim()) reasons.push('Missing delivery location')
    if (!b.total_bags || b.total_bags < 1) reasons.push('Missing number of bags')
    let branchCode = ''
    if (b.from_city?.trim()) {
      const matches = (branches ?? []).filter(br => citiesEqual(br.city, b.from_city as string))
      if (matches.length === 1) branchCode = matches[0].branch_code
      else if (matches.length === 0) reasons.push(`No active branch configured for pickup "${b.from_city}"`)
      else reasons.push(`More than one active branch matches pickup "${b.from_city}"`)
    }
    if (reasons.length > 0) {
      flagged.push({ booking_id: b.id, tracking_id: b.tracking_id, customer_name: b.customer_name, from_city: b.from_city, reasons })
    } else {
      ready.push({ ...b, branch_code: branchCode })
    }
  }
  // Oldest pickup first → chronological GC numbers within each branch.
  ready.sort((a, b) => (a.pickup_date ?? '').localeCompare(b.pickup_date ?? '') || a.created_at.localeCompare(b.created_at))

  const summary = {
    completed_total: completed.filter(b => !b.is_test).length,
    already_have_lr: completed.filter(b => !b.is_test && withLr.has(b.id)).length,
    missing_lr: candidates.length,
    ready_count: ready.length,
    flagged_count: flagged.length,
  }

  if (dryRun) {
    return NextResponse.json({
      dry_run: true, ...summary, flagged,
      ready: ready.map(r => ({ booking_id: r.id, tracking_id: r.tracking_id, customer_name: r.customer_name, from_city: r.from_city, pickup_date: r.pickup_date, branch_code: r.branch_code })),
    })
  }

  if (running) return NextResponse.json({ error: 'A bulk GC generation is already running. Wait for it to finish.' }, { status: 409 })
  running = true
  try {
    const created: Array<{ booking_id: string; tracking_id: string | null; lr_number: string }> = []
    const failed: Array<{ booking_id: string; tracking_id: string | null; error: string }> = []
    for (const b of ready.slice(0, batchSize)) {
      let r: Awaited<ReturnType<typeof createOrGetLrForBooking>>
      try {
        r = await createOrGetLrForBooking(
          b.id,
          { created_by: 'system-backfill', status_note: `LR/GC generated for Completed booking ${b.tracking_id ?? b.id} (bulk backfill)` },
          { requireBranch: true },
        )
      } catch (e) {
        // A thrown error (e.g. the number-sequence function failing) used to
        // crash the whole request with an empty HTTP 500. Report it per booking.
        console.error('[lr backfill] failed for booking', b.id, e)
        r = { lr: null, created: false, error: e instanceof Error ? e.message : String(e) }
      }
      if (r.error) failed.push({ booking_id: b.id, tracking_id: b.tracking_id, error: r.error })
      else if (r.created) created.push({ booking_id: b.id, tracking_id: b.tracking_id, lr_number: String((r.lr as { lr_number?: string })?.lr_number) })
    }
    return NextResponse.json({
      dry_run: false, ...summary,
      created, failed,
      remaining: Math.max(0, ready.length - batchSize),
      flagged,
    })
  } finally {
    running = false
  }
}
