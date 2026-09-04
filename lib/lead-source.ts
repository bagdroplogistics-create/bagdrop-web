// BAGDROP — single source of truth for lead/booking acquisition-channel
// (source) labels.
//
// Root cause fixed here (2026-08-24): the `bookings` table has never had a
// `source` column (see supabase/migrations — only `leads.source` exists,
// added in 20260618_crm_tables.sql). Every inquiry-creation path
// (app/api/bookings/route.ts, app/api/contact/route.ts,
// app/api/y2k/inquiry/route.ts, app/api/admin/leads/route.ts,
// app/api/skybird/bookings/route.ts) correctly writes the real source onto
// the `leads` row it creates alongside the booking — but the Dashboard
// (app/(admin)/admin/page.tsx) reads from `bookings`, which never had that
// value, so it fell back to *guessing* a booking's source purely from its
// tracking_id prefix (BDA- => "Lead", else "Website"). Once website
// inquiries, contact-form inquiries, and admin-created leads all started
// sharing the same BDA- numbering series (see lib/number-series.ts), that
// guess collapsed every non-BDQ/BDM/BDS inquiry into "Lead" regardless of
// its real source — including genuine website inquiries whose Lead Table
// row (reading the real `leads.source` value) correctly said "Website".
//
// Fix: app/api/admin/bookings/route.ts now joins each booking to its
// linked lead (via leads.booking_id, the one reliably-populated FK
// direction — see the "lead_id on bookings is omitted" comments in
// app/api/bookings/route.ts and app/api/admin/leads/route.ts) and attaches
// that lead's real `source` value to the booking response. The Dashboard
// and the Leads table both resolve that value through THIS map, so they
// can never drift apart again. No backfill/migration needed — every
// historical lead already has the correct source; the Dashboard just
// wasn't reading it.
export const SOURCE_LABELS: Record<string, string> = {
  manual:         'Manual',
  // app/api/admin/leads/route.ts defaults body.source to the literal
  // string 'admin' when the New Quote / manual-entry form doesn't send an
  // explicit source — same acquisition channel as 'manual', kept as a
  // separate key (rather than changing that route's default) so existing
  // 'admin'-sourced leads don't need a data change to display correctly.
  admin:          'Manual',
  website:        'Website',
  'mobile-app':   'Mobile App',
  'contact-form': 'Contact Form',
  referral:       'Referral',
  b2b:            'B2B',
  'walk-in':      'Walk-in',
  skybird:        'Skybird',
  // Group / Wedding Booking module (supabase/migrations/20260904_group_
  // bookings.sql) — the linked lead behind every Group Booking is tagged
  // with this source so it's identifiable in the Leads table / reports
  // without needing a join to group_booking_details.
  'group-wedding': 'Group/Wedding',
}

// Display color for the Dashboard's Source pill, keyed by the *label*
// (not the raw source value) so 'manual' and 'admin' — which share the
// 'Manual' label above — automatically share a color too.
export const SOURCE_LABEL_COLORS: Record<string, { color: string; bg: string }> = {
  Website:       { color: '#16a34a', bg: '#dcfce7' },
  Manual:        { color: '#2563eb', bg: '#dbeafe' },
  'Mobile App':  { color: '#ea580c', bg: '#ffedd5' },
  'Contact Form':{ color: '#0891b2', bg: '#cffafe' },
  Referral:      { color: '#7c3aed', bg: '#ede9fe' },
  B2B:           { color: '#7c3aed', bg: '#ede9fe' },
  'Walk-in':     { color: '#6b7280', bg: '#f3f4f6' },
  Skybird:       { color: '#0369a1', bg: '#e0f2fe' },
  'Group/Wedding': { color: '#be185d', bg: '#fce7f3' },
}

const UNRESOLVED = { label: 'Website', color: '#16a34a', bg: '#dcfce7' }

// Resolve a raw `source` value (from leads.source, joined onto a booking —
// see app/api/admin/bookings/route.ts) to its display label + pill colors.
// `source` is null/undefined only for the rare booking with no linked lead
// at all (a lead-insert failure that was never repaired — see the
// "orphaned but visible" comments in the booking-creation routes); those
// default to "Website" since that's overwhelmingly what they are in
// practice, matching the previous fallback behavior for un-prefixed
// tracking IDs.
export function resolveSource(source: string | null | undefined): { label: string; color: string; bg: string } {
  if (!source) return UNRESOLVED
  const label = SOURCE_LABELS[source] ?? source
  const colors = SOURCE_LABEL_COLORS[label]
  return colors ? { label, ...colors } : { label, color: '#6b7280', bg: '#f3f4f6' }
}
