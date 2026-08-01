import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

// POST /api/admin/lr-routes/import-completed
//
// One-click "catch up" action for the LR Route Master: scans every
// booking that has reached the final `completed` status (Phase 6 —
// see WORKFLOW_PHASES in admin/page.tsx) and adds any From→To city
// pair that doesn't already have a Route Master entry. Existing
// routes are never touched or duplicated — matching is case/space
// -insensitive against from_city+to_city already in `lr_routes`.
//
// New rows are inserted with gst_type defaulted to 'intrastate' and
// everything else left blank, same as a manually-added route via the
// "Add Route" button — the admin can edit GST type (interstate for
// cross-state pairs), branch codes, default vehicle, and transit
// days afterward using the existing inline edit row.
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Existing routes — build a normalized lookup so we never insert a
  // duplicate of a pair that's already configured.
  const { data: existingRoutes, error: existingErr } = await supabaseAdmin
    .from('lr_routes')
    .select('from_city, to_city')

  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })

  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const existingKeys = new Set(
    (existingRoutes ?? []).map(r => `${normalize(r.from_city)}::${normalize(r.to_city)}`)
  )

  // Completed bookings only — the final, successfully-fulfilled
  // status (`completed`), not cancelled/rejected/closed-as-lost.
  const { data: bookings, error: bookingsErr } = await supabaseAdmin
    .from('bookings')
    .select('from_city, to_city')
    .eq('status', 'completed')
    .not('from_city', 'is', null)
    .not('to_city', 'is', null)
    .limit(5000)

  if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 })

  // Distinct From→To pairs among completed bookings, keeping the
  // first-seen original casing/spacing for display.
  const seen = new Map<string, { from_city: string; to_city: string }>()
  for (const b of bookings ?? []) {
    const from = (b.from_city ?? '').trim()
    const to   = (b.to_city ?? '').trim()
    if (!from || !to) continue
    const key = `${normalize(from)}::${normalize(to)}`
    if (!seen.has(key)) seen.set(key, { from_city: from, to_city: to })
  }

  const toInsert = [...seen.entries()]
    .filter(([key]) => !existingKeys.has(key))
    .map(([, pair]) => ({
      from_city:  pair.from_city,
      to_city:    pair.to_city,
      gst_type:   'intrastate' as const, // best-guess default — review per-row (interstate for cross-state routes)
      is_active:  true,
    }))

  let inserted: unknown[] = []
  if (toInsert.length > 0) {
    const { data, error: insertErr } = await supabaseAdmin
      .from('lr_routes')
      .insert(toInsert)
      .select()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    inserted = data ?? []
  }

  return NextResponse.json({
    scanned_completed_bookings: (bookings ?? []).length,
    distinct_routes_found:      seen.size,
    added_count:                inserted.length,
    skipped_existing_count:     seen.size - inserted.length,
    added: inserted,
  })
}
