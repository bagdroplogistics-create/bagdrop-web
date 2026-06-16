import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim().toUpperCase()

  if (!id) {
    return NextResponse.json({ error: 'Tracking ID is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('tracking_id, status, customer_name, service_label, from_city, to_city, pickup_date, time_slot, total_bags, status_history, created_at, updated_at')
    .eq('tracking_id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Tracking ID not found. Please check and try again.' }, { status: 404 })
  }

  // Strip PII — only return what the customer needs to see
  return NextResponse.json({
    trackingId:    data.tracking_id,
    status:        data.status,
    customerName:  data.customer_name.split(' ')[0], // first name only
    serviceLabel:  data.service_label,
    fromCity:      data.from_city,
    toCity:        data.to_city,
    pickupDate:    data.pickup_date,
    timeSlot:      data.time_slot,
    totalBags:     data.total_bags,
    statusHistory: data.status_history,
    createdAt:     data.created_at,
    updatedAt:     data.updated_at,
  })
}
