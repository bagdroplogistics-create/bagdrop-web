// BAGDROP — app/api/admin/route-templates/add-standard-operations/route.ts
// Founder request, 2026-09-15: "add all 6 operation with specific location
// according to all operation just like vadodara-to-mumbai route template
// with 6 operations" — applied in bulk to every route template that was
// imported from Route Pricing with zero operations (23 of them), rather
// than the founder retyping the same 6 rows by hand on each one.
//
// Deliberately does NOT copy the Vadodara→Mumbai template's real vendors
// (Navneedhi, Metro Express, Swami Taxi) or rates onto every other route —
// those are facts about THAT specific corridor, not generic defaults that
// would be true for Ahmedabad→Bangalore or Delhi→Udaipur too. Copying them
// blindly would silently invent vendor relationships and pricing that
// don't exist. What IS safe to copy is the STRUCTURE — the same 6
// operation categories in the same order, each with its own route's real
// From/To City already filled in (so at least the location half of "add 6
// operations with specific location" is genuinely correct for every
// route) — leaving Vendor and Rate at sensible, honest blanks (In-house /
// ₹0) for the founder to fill in per route with the real numbers.
//
// Only touches route templates with ZERO existing operations — never
// touches Vadodara→Mumbai (already has its real 6) or any other route
// someone has already started configuring by hand.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

// Must match lib/vendor-notifications.ts's OperationCategory / CATEGORY_LABEL
// and the exact same order the Route Templates admin UI uses when a fresh
// operation row's category is left to default (emptyOperation() in
// app/(admin)/admin/route-templates/page.tsx).
const STANDARD_OPERATIONS: {
  category: string
  label: string
  date_rule: 'pickup_date' | 'delivery_date' | 'none'
}[] = [
  { category: 'pickup',           label: 'Pickup',           date_rule: 'pickup_date'   },
  { category: 'middle_mile',      label: 'Middle Mile',      date_rule: 'none'          },
  { category: 'delivery',         label: 'Delivery',         date_rule: 'delivery_date' },
  { category: 'handling',         label: 'Handling',         date_rule: 'none'          },
  { category: 'airport_delivery', label: 'Airport Delivery', date_rule: 'delivery_date' },
  { category: 'other',            label: 'Other',            date_rule: 'none'          },
]

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const routeIds = Array.isArray(body?.route_ids) ? (body.route_ids as string[]) : null

  let query = supabaseAdmin
    .from('route_templates')
    .select('id, route_name, from_city, to_city, route_template_operations(id)')
  if (routeIds) query = query.in('id', routeIds)

  const { data: routes, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const targets = (routes ?? []).filter(r => (r.route_template_operations ?? []).length === 0)
  const skipped = (routes ?? []).filter(r => (r.route_template_operations ?? []).length > 0)

  if (targets.length === 0) {
    return NextResponse.json({
      success: true, routes_updated: 0, operations_created: 0,
      skipped: skipped.map(r => r.route_name),
    })
  }

  const rows = targets.flatMap(r =>
    STANDARD_OPERATIONS.map((op, i) => ({
      route_template_id:    r.id,
      sequence:              i,
      expense_type:          op.label,
      mode:                  null,
      operation_category:    op.category,
      vendor_id:             null,
      from_location:         r.from_city,
      to_location:           r.to_city,
      rate_type:             'fixed' as const,
      rate:                  0,
      date_rule:             op.date_rule,
      notification_required: true,
      description:           null,
    }))
  )

  const { error: insertErr } = await supabaseAdmin.from('route_template_operations').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    routes_updated:     targets.length,
    operations_created: rows.length,
    skipped:             skipped.map(r => r.route_name),
  })
}
