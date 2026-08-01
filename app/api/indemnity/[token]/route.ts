import { NextRequest, NextResponse } from 'next/server'
import { resolveIndemnityToken } from '@/lib/indemnity-token'

export const runtime = 'nodejs'

// ── GET /api/indemnity/[token] ────────────────────────────────────────
// Public (token-gated, no admin auth) — powers the signing page's initial
// load: pre-fills whatever the booking/bond already has, tells the page
// whether OTP is still required, and whether an Aadhaar/flight-ticket
// upload is required for this specific booking's service type.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  const result = await resolveIndemnityToken(token)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const { bond, booking } = result
  const isAirportDelivery = /airport/i.test(booking.service_type ?? '')

  return NextResponse.json({
    booking: {
      tracking_id:   booking.tracking_id,
      title:         booking.title,
      customer_name: booking.customer_name,
      customer_email_masked: maskEmail(booking.customer_email),
      customer_phone_masked: maskPhone(booking.customer_phone),
      service_label: booking.service_label ?? booking.service_type,
      is_airport_delivery: isAirportDelivery,
    },
    bond: {
      otp_verified:     bond.otp_verified,
      aadhaar_number:    bond.aadhaar_number,
      passport_number:   bond.passport_number,
      licence_number:    bond.licence_number,
      bond_date:         bond.bond_date,
      bond_place:        bond.bond_place,
      token_expires_at:  bond.token_expires_at,
    },
  })
}

function maskEmail(email: string | null): string | null {
  if (!email) return null
  const [user, domain] = email.split('@')
  if (!domain) return email
  const visible = user.slice(0, 2)
  return `${visible}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`
}
