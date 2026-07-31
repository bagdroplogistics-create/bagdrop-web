import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

// GET /api/admin/lr-routes — list all Route Master entries
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('lr_routes')
    .select('*')
    .order('from_city')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ routes: data })
}

// POST /api/admin/lr-routes — create a new Route Master entry
export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { from_city, to_city } = body
  if (!from_city || !to_city)
    return NextResponse.json({ error: 'from_city and to_city are required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('lr_routes')
    .insert({
      from_city:             String(from_city).trim(),
      to_city:                String(to_city).trim(),
      from_branch_code:       body.from_branch_code?.trim() || null,
      to_branch_code:         body.to_branch_code?.trim()   || null,
      gst_type:               body.gst_type === 'interstate' ? 'interstate' : 'intrastate',
      default_vehicle_type:   body.default_vehicle_type?.trim() || null,
      standard_transit_days:  body.standard_transit_days != null ? Number(body.standard_transit_days) : null,
      distance_km:            body.distance_km != null ? Number(body.distance_km) : null,
      notes:                  body.notes?.trim() || null,
      is_active:              body.is_active !== false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ route: data }, { status: 201 })
}
