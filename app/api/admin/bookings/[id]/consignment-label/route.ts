// BAGDROP — Consignor/Consignee Consignment Label
//
// "Download Consignment Label" — one A4 label per bag (see
// lib/consignment-label-pdf.tsx for the full design rationale). Standalone
// sibling to the airport-style Bag Tag PDF route (../bag-tags/pdf/route.ts)
// — same auth/fetch/response pattern, deliberately kept separate since this
// is a different document with a different purpose (sender/receiver +
// chain-of-custody, not barcode/QR operational tracking).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { buildConsignmentLabelPdfBuffer, type ConsignmentLabelInput } from '@/lib/consignment-label-pdf'
import { formatCustomerName } from '@/lib/constants'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await context.params

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, booking_type, title, customer_name, customer_phone, from_city, to_city, service_label, service_type, pickup_date, pickup_address, drop_address, total_bags')
    .eq('id', id)
    .maybeSingle()
  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 })
  if (!booking)    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const isGroup = booking.booking_type === 'group'

  // Group bookings source their pickup/delivery city + a friendlier
  // booking identifier from group_booking_details, same as the Bag Tag
  // route — Consignor/Consignee names still fall back to the single
  // customer identity on `bookings` per the founder's confirmed decision
  // (reuse existing fields: Consignor = pickup identity, Consignee = drop
  // identity, same person for the door-to-door / airport-to-door cases
  // Bagdrop stores today — no separate receiver-name field exists yet).
  let bookingIdentifier = booking.tracking_id as string
  let fromCity: string | null = booking.from_city
  let toCity: string | null = booking.to_city
  if (isGroup) {
    const { data: gd } = await supabaseAdmin
      .from('group_booking_details')
      .select('group_booking_number, pickup_city, delivery_city')
      .eq('booking_id', id)
      .maybeSingle()
    if (gd?.group_booking_number) bookingIdentifier = gd.group_booking_number
    fromCity = gd?.pickup_city ?? fromCity
    toCity   = gd?.delivery_city ?? toCity
  }

  // Per-bag labels if tags have already been generated (lib/bag-tags.ts) —
  // falls back to a single label at bookingIdentifier when they haven't,
  // so this document never depends on the separate Bag Tag flow having
  // run first.
  const { data: bags } = await supabaseAdmin
    .from('group_bags')
    .select('bag_label')
    .eq('booking_id', id)
    .is('deleted_at', null)
    .not('bag_label', 'is', null)
    .order('created_at', { ascending: true })

  const bagTotal = Math.max(1, bags?.length || Number(booking.total_bags) || 1)
  const bagLabels: (string | null)[] = bags && bags.length > 0
    ? bags.map(b => b.bag_label as string)
    : Array.from({ length: bagTotal }, () => null)

  const customerName    = formatCustomerName(booking.title, booking.customer_name) || booking.customer_name || 'Customer'
  const serviceLabel    = booking.service_label || booking.service_type || (isGroup ? 'Group / Wedding Booking' : 'Baggage Delivery')
  const consignorAddress = booking.pickup_address || (fromCity ? `${fromCity} (exact address on file)` : null)
  const consigneeAddress = booking.drop_address   || (toCity   ? `${toCity} (exact address on file)`   : null)

  const labels: ConsignmentLabelInput[] = bagLabels.map((bagLabel, i) => ({
    trackingId:       bookingIdentifier,
    bagLabel,
    bagNumber:        i + 1,
    bagTotal,
    serviceLabel,
    pickupDate:       booking.pickup_date,
    consignorName:    customerName,
    consignorPhone:   booking.customer_phone,
    consignorAddress,
    consigneeName:    customerName,
    consigneePhone:   booking.customer_phone,
    consigneeAddress,
  }))

  const buffer = await buildConsignmentLabelPdfBuffer(labels)
  const filename = `${bookingIdentifier.replace(/\//g, '-')}-consignment-label.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
