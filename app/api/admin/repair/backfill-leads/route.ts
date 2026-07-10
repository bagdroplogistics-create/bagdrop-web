/**
 * POST /api/admin/repair/backfill-leads
 *
 * One-time repair: creates a lead row for every website booking (BD- prefix)
 * that currently has no corresponding lead (lead_id IS NULL on the booking).
 *
 * Safe to run multiple times — it skips bookings that already have a lead linked
 * via booking_id or via the booking's lead_id column.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find all BD- bookings that have no lead_id yet
  const { data: orphanBookings, error: fetchErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tracking_id, customer_name, customer_phone, customer_email, service_type, service_label, from_city, to_city, pickup_date, delivery_date, time_slot, pickup_address, drop_address, total_bags, flight_number, notes, created_at')
    .like('tracking_id', 'BD-%')
    .is('lead_id', null)
    .order('created_at', { ascending: true })

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!orphanBookings || orphanBookings.length === 0) {
    return NextResponse.json({ message: 'No orphan bookings found — nothing to repair.', created: 0 })
  }

  const year = new Date().getFullYear()
  let created = 0
  const skipped: string[] = []
  const failed:  string[] = []

  for (const booking of orphanBookings) {
    try {
      // Double-check: no lead already exists for this booking_id
      const { data: existingLead } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('booking_id', booking.id)
        .maybeSingle()

      if (existingLead) {
        // Lead exists but booking wasn't back-linked — fix the link
        await supabaseAdmin
          .from('bookings')
          .update({ lead_id: existingLead.id })
          .eq('id', booking.id)
        skipped.push(booking.tracking_id + ' (lead existed, back-link fixed)')
        continue
      }

      // Generate next lead number
      const { data: lastLead } = await supabaseAdmin
        .from('leads')
        .select('lead_number')
        .like('lead_number', `BDL-${year}-%`)
        .order('lead_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      let nextSeq = 1
      if (lastLead?.lead_number) {
        const parts = lastLead.lead_number.split('-')
        const last = parseInt(parts[parts.length - 1], 10)
        if (!isNaN(last)) nextSeq = last + 1
      }
      const leadNumber = `BDL-${year}-${String(nextSeq).padStart(4, '0')}`

      const { data: newLead, error: insertErr } = await supabaseAdmin
        .from('leads')
        .insert({
          lead_number:      leadNumber,
          name:             booking.customer_name   ?? 'Unknown',
          phone:            booking.customer_phone  ?? '',
          email:            booking.customer_email  || null,
          source:           'website',
          status:           'new',
          service_type:     booking.service_type    ?? '',
          service_interest: booking.service_type    ?? '',
          from_city:        booking.from_city       ?? null,
          to_city:          booking.to_city         ?? null,
          pickup_date:      booking.pickup_date     ?? null,
          delivery_date:    booking.delivery_date   ?? null,
          pickup_address:   booking.pickup_address  ?? null,
          drop_address:     booking.drop_address    ?? null,
          bags_count:       booking.total_bags      ?? 1,
          flight_number:    booking.flight_number   ?? null,
          notes:            `Backfilled from booking ${booking.tracking_id}`,
          booking_id:       booking.id,
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error(`[backfill-leads] Failed to insert lead for ${booking.tracking_id}:`, insertErr.message)
        failed.push(booking.tracking_id)
        continue
      }

      // Back-link booking → lead
      if (newLead?.id) {
        await supabaseAdmin
          .from('bookings')
          .update({ lead_id: newLead.id })
          .eq('id', booking.id)
      }

      console.log(`[backfill-leads] Created ${leadNumber} for booking ${booking.tracking_id}`)
      created++
    } catch (err) {
      console.error(`[backfill-leads] Unexpected error for ${booking.tracking_id}:`, err)
      failed.push(booking.tracking_id)
    }
  }

  return NextResponse.json({
    message: `Repair complete. Created ${created} leads, skipped ${skipped.length}, failed ${failed.length}.`,
    created,
    skipped,
    failed,
  })
}
