import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [total, newInquiries, inProgress, inTransit, completedRes, revenueRes] = await Promise.all([
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }),
    // New inquiries: all stages before payment is collected
    // Includes quote_created + quote_sent so lead-generated inquiries are always counted
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'inquiry', 'quote_created', 'quote_sent', 'document_collection', 'review']),
    // In progress: accepted through pickup stages
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true })
      .in('status', ['accepted', 'payment_pending', 'payment_approved', 'confirmed', 'pickup_scheduled', 'picked_up']),
    // In transit / out for delivery
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true })
      .in('status', ['in_transit', 'out_for_delivery']),
    // Delivered + Completed
    supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true })
      .in('status', ['delivered', 'completed']),
    // Revenue from delivered + completed bookings
    supabaseAdmin.from('bookings').select('total_amount')
      .in('status', ['delivered', 'completed']),
  ])

  const totalRevenue = (revenueRes.data ?? []).reduce(
    (sum, b) => sum + (Number(b.total_amount) || 0), 0
  )

  return NextResponse.json({
    total:         total.count         ?? 0,
    new_inquiries: newInquiries.count  ?? 0,
    in_progress:   inProgress.count    ?? 0,
    in_transit:    inTransit.count     ?? 0,
    delivered:     completedRes.count  ?? 0,
    revenue:       totalRevenue,
    // Keep old keys for backward compat
    pending:       newInquiries.count  ?? 0,
    confirmed:     inProgress.count    ?? 0,
  })
}
