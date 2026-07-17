// BAGDROP — GET /api/my-bookings
//
// Returns the FULL booking history for the currently signed-in customer.
// Used by the mobile app's "My Bookings" / booking history / payment history screens.
//
// This did not exist before: /api/bookings only creates bookings, and
// /api/track only returns a single PII-stripped booking by tracking ID.
// Nothing else in the codebase lists "all bookings belonging to this
// logged-in customer", so this endpoint was added to support that.
//
// Auth: expects `Authorization: Bearer <supabase_access_token>` — the same
// session token issued by the existing OTP flow (send-otp → verify-otp →
// client-side supabase.auth.signInWithPassword using the returned
// authEmail/tempPassword). We verify the token with Supabase, then derive
// the customer's phone/email from it:
//   - Phone-based accounts use a synthetic email `phone_<digits>@auth.bagdrop.in`
//     (see /api/auth/send-otp) — we reverse that to get the real phone number.
//   - Email-based accounts use the real email directly.
// Bookings are matched by customer_phone / customer_email since the
// bookings table has no user_id column linking to Supabase auth.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function phoneFromSyntheticEmail(authEmail: string): string | null {
  const m = authEmail.match(/^phone_(\d+)@auth\.bagdrop\.in$/i)
  if (!m) return null
  return '+' + m[1]
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization bearer token.' }, { status: 401 })
  }

  // Verify the token and get the underlying auth user
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 })
  }

  const authEmail = (userData.user.email ?? '').toLowerCase()
  if (!authEmail) {
    return NextResponse.json({ error: 'Account has no contact info on file.' }, { status: 400 })
  }

  const phone = phoneFromSyntheticEmail(authEmail)

  // Match bookings by phone (phone-based accounts) or real email (email-based accounts).
  // Also match by email even for phone accounts, in case the customer later added
  // an email to a booking made through the same contact number.
  let query = supabaseAdmin
    .from('bookings')
    .select(
      'id, tracking_id, status, customer_name, customer_email, customer_phone, ' +
      'service_type, service_label, from_city, to_city, pickup_address, drop_address, ' +
      'pickup_date, delivery_date, time_slot, flight_number, notes, total_bags, bag_details, total_amount, ' +
      'currency, payment_status, payment_reference, status_history, created_at, updated_at'
    )
    .order('created_at', { ascending: false })

  if (phone) {
    query = query.or(`customer_phone.eq.${phone},customer_email.eq.${authEmail}`)
  } else {
    query = query.eq('customer_email', authEmail)
  }

  const { data, error } = await query

  if (error) {
    console.error('[my-bookings] query error:', error.message)
    return NextResponse.json({ error: 'Could not load bookings.' }, { status: 500 })
  }

  return NextResponse.json({ bookings: data ?? [] })
}
