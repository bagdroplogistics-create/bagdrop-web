// BAGDROP — lib/duplicate-inquiry-check.ts
//
// Founder spec 2026-08-25: prevent an admin from accidentally creating a
// brand-new manual quote/lead for a customer who already submitted an
// inquiry through the website, contact form, or mobile app and hasn't been
// quoted yet — instead of silently duplicating the record, warn and offer
// to open the existing one.
//
// IMPORTANT — this is deliberately narrower than the duplicate-phone guard
// that used to exist on POST /api/admin/leads (removed 2026-08-17, see that
// route's comment). That old guard fired on ANY matching phone number,
// including two genuinely separate inquiries from the same repeat
// customer, and its "reuse" behavior silently overwrote the FIRST inquiry's
// data with the second one's (Sachin Patel's 10 Aug inquiry disappearing
// when his 15 Aug inquiry reused the same row). This version only matches:
//   - a lead whose `source` is one of the genuine self-service channels
//     (website / contact-form / mobile-app) — never another admin-created
//     lead, so two separate manually-entered bookings never collide;
//   - that STILL HAS NO QUOTE (quote_number IS NULL) — once a lead is
//     quoted, "the same phone number again" legitimately means a repeat
//     customer's new trip, exactly the case the 2026-08-17 fix protects;
//   - that isn't already 'lost' or soft-deleted — a self-expired or
//     removed inquiry shouldn't block a fresh one;
//   - that has the SAME trip/pickup date, and (when both sides have a
//     route on file) the SAME route (2026-08-25 follow-up spec: "Different
//     Trip / Inquiry Date = New Inquiry"). One customer can have several
//     genuinely separate inquiries — Mumbai→Delhi on 25 Aug, Mumbai→
//     Ahmedabad on 15 Sep, Delhi→Mumbai on 20 Oct — and every one of them
//     must get its own tracking number, never merged just because the name/
//     phone/email match. A pickup date is REQUIRED on the inquiry being
//     checked for this to fire at all — if the admin hasn't entered one yet,
//     there's no way to confirm "same trip", so this returns no match
//     rather than falling back to matching on identity alone (matches the
//     "avoid false duplicate warnings" requirement).
// And it never auto-reuses/overwrites anything by itself — every caller
// only ever WARNS and lets the admin explicitly choose to open the existing
// record or proceed anyway (force_duplicate).
import { supabaseAdmin } from '@/lib/supabase'
import { parseStoredPhone } from '@/lib/phone-format'
import { citiesEqual } from '@/lib/city-normalize'

export const SELF_SERVICE_INQUIRY_SOURCES = ['website', 'contact-form', 'mobile-app']

export interface DuplicateInquiryMatch {
  id:          string
  lead_number: string | null
  tracking_id: string | null
  name:        string
  phone:       string
  email:       string | null
  source:      string
  created_at:  string
  status:      string
  pickup_date: string | null
  from_city:   string | null
  to_city:     string | null
}

// Looks up the most recent still-open self-service inquiry matching this
// phone (primary) or email (secondary) — either alone is enough on the
// identity side, per spec ("Phone number — primary match, Email address —
// secondary match") — AND the same trip date, AND (when both sides have
// one on file) the same route. Empty/missing phone+email, or a missing
// pickup date on the inquiry being checked, always returns no match —
// never matched against blanks, never falls back to identity-only matching.
export async function findOpenWebsiteInquiry(params: {
  phone?:      string | null
  email?:      string | null
  pickupDate?: string | null   // 'YYYY-MM-DD' — the trip date of the inquiry being checked
  fromCity?:   string | null
  toCity?:     string | null
}): Promise<DuplicateInquiryMatch | null> {
  const phoneE164  = params.phone ? parseStoredPhone(params.phone).e164 : ''
  const email      = (params.email ?? '').trim().toLowerCase()
  const pickupDate = (params.pickupDate ?? '').trim()

  if (!phoneE164 && !email) return null
  // No trip date to compare yet — can't confirm this is the SAME trip, so
  // never warn prematurely. The live inline check just waits for the admin
  // to fill in a date; the hard server-side guard on POST /api/admin/leads
  // already requires pickup_date on every create, so this isn't a gap there.
  if (!pickupDate) return null

  const orClauses: string[] = []
  if (phoneE164) orClauses.push(`phone.eq.${phoneE164}`)
  if (email)     orClauses.push(`email.ilike.${email}`)

  // Fetch every open candidate for this identity + exact trip date (small
  // result set — same customer, same day), then apply the route check in
  // JS via the shared city-normalization comparator (handles aliases/
  // spelling variants the same way route-pricing lookups already do), since
  // that can't be expressed as a plain column filter.
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, lead_number, name, phone, email, source, created_at, status, booking_id, pickup_date, from_city, to_city')
    .in('source', SELF_SERVICE_INQUIRY_SOURCES)
    .is('quote_number', null)
    .is('deleted_at', null)
    .neq('status', 'lost')
    .eq('pickup_date', pickupDate)
    .or(orClauses.join(','))
    .order('created_at', { ascending: false })
    .limit(20)

  if (error || !data || data.length === 0) return null

  const fromCity = params.fromCity ?? null
  const toCity   = params.toCity   ?? null
  const routeKnown = !!(fromCity && toCity)

  // Prefer a candidate whose route also matches when we can actually
  // compare routes; otherwise (route missing on either side) a same-
  // customer, same-date match is still treated as the same inquiry — route
  // is only ever used to RULE OUT a match, never to require one that can't
  // be checked.
  const match = data.find(l => {
    if (!routeKnown || !l.from_city || !l.to_city) return true
    return citiesEqual(fromCity, l.from_city) && citiesEqual(toCity, l.to_city)
  })
  if (!match) return null

  // Best-effort — the linked booking's tracking_id is purely for display
  // ("Tracking ID: BDA-XXXX-XXXX" in the warning), never used for matching
  // itself. A lookup failure here must never turn a real duplicate match
  // into a false negative.
  let trackingId: string | null = null
  if (match.booking_id) {
    const { data: bk } = await supabaseAdmin
      .from('bookings')
      .select('tracking_id')
      .eq('id', match.booking_id)
      .maybeSingle()
    trackingId = bk?.tracking_id ?? null
  }

  return {
    id:          match.id,
    lead_number: match.lead_number ?? null,
    tracking_id: trackingId,
    name:        match.name,
    phone:       match.phone,
    email:       match.email ?? null,
    source:      match.source,
    created_at:  match.created_at,
    status:      match.status,
    pickup_date: match.pickup_date ?? null,
    from_city:   match.from_city ?? null,
    to_city:     match.to_city ?? null,
  }
}
