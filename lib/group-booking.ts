import { supabaseAdmin } from '@/lib/supabase'

// Keeps the EXISTING pricing engine's input (leads.bags_count, which the
// New Quote builder — app/(admin)/admin/quotes/new/page.tsx — reads to
// pre-fill "No. of Bags" and which app/api/admin/zoho/generate-quote/
// route.ts actually prices off) in sync with the REAL, current count of
// bag records in the Group Booking manifest.
//
// Bug this fixes: the linked lead's bags_count was only ever set once, at
// Group Booking creation time, from the admin's initial estimate. Adding
// guests/bags afterward (the normal flow — the estimate is rarely exact)
// silently left bags_count stale, so a quote generated after growing the
// manifest still priced the OLD, smaller bag count. Call this after every
// mutation that changes how many active bags a group booking has (guest
// add/remove, bag add/remove, manifest import) so "No. of Bags" on the
// quote builder always reflects reality.
//
// Deliberately does NOT touch group_booking_details.estimated_total_bags/
// final_total_bags — those are the admin's own manual estimate/confirmed-
// count fields (spec section 2), intentionally separate from this actual
// live tally.
export async function syncBagCountToBooking(bookingId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('group_bags')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
    .is('deleted_at', null)

  const bagCount = count ?? 0

  // Never sync down to 0 — a group booking with its manifest mid-edit (all
  // bags momentarily removed) shouldn't zero out an already-generated
  // quote's bag count out from under it. Only sync while there's at least
  // one real bag counted.
  if (bagCount > 0) {
    await Promise.all([
      supabaseAdmin.from('bookings').update({ total_bags: bagCount }).eq('id', bookingId),
      supabaseAdmin.from('leads').update({ bags_count: bagCount }).eq('booking_id', bookingId),
    ])
  }

  return bagCount
}
