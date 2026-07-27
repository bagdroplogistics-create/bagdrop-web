import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { findRouteMatch } from '@/lib/city-normalize'

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

  // Compare against ALL active routes with normalized (aliased) city keys —
  // not a raw `.eq()` — so rows saved with a non-canonical spelling
  // ("Vadodara" instead of "Baroda", "Bengaluru" instead of "Bangalore")
  // still match. See findRouteMatch() in lib/city-normalize.ts for why.
  const { data: routes, error } = await supabaseAdmin
    .from('route_pricing')
    .select('*')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const data = findRouteMatch(routes ?? [], from, to)

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
