import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'

export const runtime = 'nodejs'

const BUCKET = 'indemnity-documents'
const SIGNED_URL_TTL_SECONDS = 10 * 60 // 10 minutes — private bucket, short-lived links only

// ── GET /api/admin/bookings/[id]/indemnity ────────────────────────────
// Admin-only. Returns the indemnity_bonds row for this booking (if any),
// plus short-lived signed URLs for every uploaded document — the bucket is
// private (Aadhaar/passport-grade PII), so nothing here is a public URL.
//
// Deliberately keyed off booking_id directly rather than the booking's
// current workflow `status` — the customer's public signing link locks
// itself the moment they submit (resolveIndemnityToken refuses re-access
// to an already-submitted bond, by design, since it's a signed legal
// document). This endpoint is how the admin team views what was submitted
// once that customer-facing link is no longer usable.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params

  const { data: bond, error: bondErr } = await supabaseAdmin
    .from('indemnity_bonds')
    .select('*')
    .eq('booking_id', id)
    .maybeSingle()

  if (bondErr) return NextResponse.json({ error: bondErr.message }, { status: 500 })
  if (!bond) return NextResponse.json({ bond: null })

  const docFields: Array<{ key: string; path: string | null }> = [
    { key: 'signed_bond_url',   path: bond.signed_pdf_path },
    { key: 'aadhaar_url',       path: bond.aadhaar_doc_path },
    { key: 'passport_url',      path: bond.passport_doc_path },
    { key: 'flight_ticket_url', path: bond.flight_ticket_doc_path },
    { key: 'extra_doc_url',     path: bond.extra_doc_path },
  ]

  const urls: Record<string, string | null> = {}
  await Promise.all(
    docFields.map(async ({ key, path }) => {
      if (!path) { urls[key] = null; return }
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      urls[key] = error ? null : (data?.signedUrl ?? null)
    })
  )

  return NextResponse.json({
    bond: {
      id:                 bond.id,
      otp_verified:       bond.otp_verified,
      otp_verified_at:    bond.otp_verified_at,
      aadhaar_number:     bond.aadhaar_number,
      passport_number:    bond.passport_number,
      licence_number:     bond.licence_number,
      bond_date:          bond.bond_date,
      bond_place:         bond.bond_place,
      signed_at:          bond.signed_at,
      document_status:    bond.document_status,
      reviewed_by:        bond.reviewed_by,
      reviewed_at:        bond.reviewed_at,
      review_note:        bond.review_note,
      submitted_at:       bond.submitted_at,
      sent_at:            bond.sent_at,
      token_expires_at:   bond.token_expires_at,
      has_aadhaar_doc:       !!bond.aadhaar_doc_path,
      has_passport_doc:      !!bond.passport_doc_path,
      has_flight_ticket_doc: !!bond.flight_ticket_doc_path,
      has_extra_doc:         !!bond.extra_doc_path,
      has_signed_pdf:        !!bond.signed_pdf_path,
    },
    urls,
  })
}
