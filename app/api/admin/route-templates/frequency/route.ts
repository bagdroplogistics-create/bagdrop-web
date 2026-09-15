// BAGDROP — app/api/admin/route-templates/frequency/route.ts
// Founder request, 2026-09-15: "show my all basic frequent routes first"
// on the Route Templates page. Counts real inquiries per route from
// `leads` (from_city/to_city), grouped direction-agnostically on the same
// normalized city keys route_pricing's missing-routes detector already
// uses (lib/city-normalize.ts) — so "Vadodara→Mumbai" and "Mumbai
// Airport (T2)→Baroda" count as the same route, and direction doesn't
// split one real corridor into two separate counts.
//
// Deliberately reads `leads`, not `bookings` — the founder's own wording
// was "inquiries are more coming frequently," and leads is where every
// inquiry lands regardless of whether it ever converted to a booking.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { normalizeCity } from '@/lib/city-normalize'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('from_city, to_city')
    .not('from_city', 'is', null)
    .not('to_city', 'is', null)
    .limit(20000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const l of leads ?? []) {
    const nFrom = normalizeCity(l.from_city)
    const nTo   = normalizeCity(l.to_city)
    if (!nFrom || !nTo || nFrom === nTo) continue
    const key = [nFrom, nTo].sort().join('|')
    counts[key] = (counts[key] ?? 0) + 1
  }

  return NextResponse.json({ counts })
}
