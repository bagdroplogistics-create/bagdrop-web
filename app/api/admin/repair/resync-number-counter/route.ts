import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

/**
 * POST /api/admin/repair/resync-number-counter
 *
 * MANUAL-ONLY repair tool — never called automatically, never triggered by
 * a delete. Trigger it yourself (e.g. from Settings) after cleaning up
 * trailing dummy/test inquiries.
 *
 * WHY THIS EXISTS: the BDA/BDL/BDQ tracking-number counters
 * (bagdrop_number_counters — see supabase/migrations/
 * 20260817_atomic_number_series.sql) are deliberately atomic and never
 * read live table data on every mint. That's what makes them collision-
 * safe — see lib/number-series.ts's module comment, and the real incident
 * (2026-08-21) where the old "take the highest existing number, +1"
 * approach silently renumbered a live booking (BDA-2026-0127 → 0125)
 * after some other row was deleted. Because the counter never looks at
 * live data, deleting a test/dummy inquiry does NOT free up its number —
 * the sequence just leaves a permanent gap, which is the safe default.
 *
 * This endpoint is the one deliberate exception: after you've manually
 * deleted trailing dummy/test rows (created purely to test a form, never
 * seen by a real customer), call this to move the counter back down to
 * match the real highest number still on record, so the next genuine
 * inquiry continues the sequence cleanly instead of skipping the gap.
 *
 * SAFE BY CONSTRUCTION: it only ever sets last_seq to MAX(the number
 * actually still in that table for the current year) — never lower than
 * any number genuinely still in use — so the very next mint (max + 1) can
 * never collide with a real, undeleted row. If you delete a row from the
 * MIDDLE of the sequence (not the trailing end), that gap is NOT
 * reclaimed — only trailing gaps (deleted rows at/after the current
 * highest real number) actually move the counter.
 */

const SERIES_CONFIG: Record<string, { table: string; column: string }> = {
  BDA: { table: 'bookings', column: 'tracking_id' },
  BDL: { table: 'leads', column: 'lead_number' },
  BDQ: { table: 'quotes', column: 'quote_number' },
}

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const rawSeries = body.series
  const requested: string[] = Array.isArray(rawSeries)
    ? rawSeries
    : (typeof rawSeries === 'string' && rawSeries ? [rawSeries] : ['BDA', 'BDL', 'BDQ'])
  const series = requested.filter((s): s is keyof typeof SERIES_CONFIG => s in SERIES_CONFIG)

  if (series.length === 0) {
    return NextResponse.json({ error: 'No valid series specified. Use BDA, BDL, and/or BDQ.' }, { status: 400 })
  }

  const year = new Date().getFullYear()
  const results: Record<string, { before: number | null; after: number; unchanged: boolean }> = {}

  for (const s of series) {
    const { table, column } = SERIES_CONFIG[s]

    const { data: rows, error: fetchErr } = await supabaseAdmin
      .from(table)
      .select(column)
      .like(column, `${s}-${year}-%`)

    if (fetchErr) {
      return NextResponse.json({ error: `Failed to scan ${table}: ${fetchErr.message}` }, { status: 500 })
    }

    const pattern = new RegExp(`^${s}-${year}-(\\d{4})$`)
    let maxSeq = 0
    for (const row of (rows ?? []) as unknown as Record<string, unknown>[]) {
      const val = row[column] as string | null
      const m = val ? pattern.exec(val) : null
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10))
    }

    const { data: currentRow, error: readErr } = await supabaseAdmin
      .from('bagdrop_number_counters')
      .select('last_seq')
      .eq('series', s)
      .eq('year', year)
      .maybeSingle()

    if (readErr) {
      return NextResponse.json({ error: `Failed to read counter for ${s}: ${readErr.message}` }, { status: 500 })
    }

    const before = currentRow?.last_seq ?? null

    if (currentRow) {
      const { error: updateErr } = await supabaseAdmin
        .from('bagdrop_number_counters')
        .update({ last_seq: maxSeq })
        .eq('series', s)
        .eq('year', year)
      if (updateErr) {
        return NextResponse.json({ error: `Failed to update counter for ${s}: ${updateErr.message}` }, { status: 500 })
      }
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('bagdrop_number_counters')
        .insert({ series: s, year, last_seq: maxSeq })
      if (insertErr) {
        return NextResponse.json({ error: `Failed to create counter for ${s}: ${insertErr.message}` }, { status: 500 })
      }
    }

    results[s] = { before, after: maxSeq, unchanged: before === maxSeq }
  }

  return NextResponse.json({
    message: `Resynced ${series.join(', ')} counter(s) for ${year} to match the real highest number on record.`,
    year,
    results,
  })
}
