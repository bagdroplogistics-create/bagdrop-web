import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

// Aliases to normalize user-typed city names to DB keys
const CITY_ALIASES: Record<string, string> = {
  'vadodara':          'baroda',
  'bengaluru':         'bangalore',
  'bombay':            'mumbai',
  'new delhi':         'delhi',
  'new-delhi':         'delhi',
  'ahmedabad airport': 'ahmedabad',
  'mumbai airport':    'mumbai',
  'delhi airport':     'delhi',
}

function normalizeCity(raw: string): string {
  const s = raw.toLowerCase().trim().replace(/-/g, ' ')
  return CITY_ALIASES[s] ?? s
}

// GET /api/admin/route-pricing/calculate?from=X&to=Y&bags=N
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp   = req.nextUrl.searchParams
  const from = sp.get('from') ?? ''
  const to   = sp.get('to')   ?? ''
  const bags = parseInt(sp.get('bags') ?? '1', 10)

  if (!from || !to)
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })

  const normFrom = normalizeCity(from)
  const normTo   = normalizeCity(to)

  // Look for route in either direction
  const { data, error } = await supabaseAdmin
    .from('route_pricing')
    .select('*')
    .eq('is_active', true)
    .or(
      `and(from_city.eq.${normFrom},to_city.eq.${normTo}),and(from_city.eq.${normTo},to_city.eq.${normFrom})`
    )
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!data) {
    return NextResponse.json({
      found:   false,
      message: `No pricing found for ${from} → ${to}`,
    })
  }

  const bagCount   = Math.max(1, bags)
  const basePrice  = Number(data.base_price)
  const perBagRate = Number(data.per_bag_rate)

  // Pricing formula: base for ≤2 bags; base + (bags-2)×per_bag_rate for >2
  const subtotal = bagCount <= 2
    ? basePrice
    : basePrice + (bagCount - 2) * perBagRate

  const cgst  = parseFloat((subtotal * 0.025).toFixed(2))
  const sgst  = parseFloat((subtotal * 0.025).toFixed(2))
  const total = parseFloat((subtotal + cgst + sgst).toFixed(2))

  return NextResponse.json({
    found:        true,
    route_id:     data.id,
    from_city:    data.from_city,
    to_city:      data.to_city,
    bags:         bagCount,
    base_price:   basePrice,
    per_bag_rate: perBagRate,
    subtotal,
    cgst,
    sgst,
    total,
  })
}
