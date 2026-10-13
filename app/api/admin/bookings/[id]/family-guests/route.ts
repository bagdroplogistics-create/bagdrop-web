// GET — structured guest list (lead + add-on guests) for a booking, with
// per-guest bag counts and any generated bag labels. Read-only.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const [{ data: guests, error }, { data: booking }, { data: bags }, fdRes] = await Promise.all([
    supabaseAdmin.from('group_guests')
      .select('id, guest_name, mobile_number, email, room_number, is_lead, bags_count, sort_order, member_ref, travel')
      .eq('booking_id', id).is('deleted_at', null).order('sort_order'),
    supabaseAdmin.from('bookings').select('hotel_room_number, total_bags').eq('id', id).maybeSingle(),
    supabaseAdmin.from('group_bags').select('guest_id, bag_label').eq('booking_id', id).is('deleted_at', null),
    supabaseAdmin.from('bookings').select('family_details').eq('id', id).maybeSingle(),
  ])
  const fd = (fdRes.data as { family_details?: { bags?: Array<{ owner: string; type: string; colour: string; weight: string; contents: string; ref: string }>; pickups?: unknown[]; side?: string } | null } | null)?.family_details ?? null
  if (error) return NextResponse.json({ guests: [], hotel_room_number: null, total_bags: null })
  const labels: Record<string, string[]> = {}
  for (const b of bags ?? []) if (b.guest_id) (labels[b.guest_id] ??= []).push(b.bag_label)
  return NextResponse.json({
    guests: (guests ?? []).map(g => ({
      ...g,
      bag_labels: labels[g.id] ?? [],
      bag_details: (fd?.bags ?? []).filter(b => b.owner === (g as { member_ref?: string }).member_ref)
        .map(b => `${b.type[0].toUpperCase()}${b.type.slice(1)} · ${b.colour} · ${b.weight} · ${b.contents}`),
    })),
    side: fd?.side ?? null,
    pickups: fd?.pickups ?? [],
    hotel_room_number: booking?.hotel_room_number ?? null,
    total_bags: booking?.total_bags ?? null,
  })
}
