// BAGDROP — lib/lr-auto-create.ts
//
// Shared "create an LR from a booking" logic — used by both:
//  (a) POST /api/admin/lrs (booking_id branch — the existing manual
//      "Generate LR" / "New LR" admin flows), and
//  (b) the automatic LR creation that now fires the moment a booking
//      reaches Payment Received (or the VIP/pay-later equivalent,
//      Payment Approved) — see app/api/admin/bookings/[id]/route.ts.
//
// Previously this logic lived only inline in the POST route. Pulling it
// out here means the automatic trigger can't drift from the manual one —
// exactly the kind of duplicated-logic split that caused the BDA/BDL
// tracking-number pairing bugs fixed earlier the same day (2026-08-21).
//
// Two rules enforced here, per founder spec (2026-08-21):
//  1. lr_date is ALWAYS the booking's pickup_date when an LR is linked to
//     a booking — never today's date, the booking's creation date, a
//     payment date, or the delivery date. If a booking genuinely has no
//     pickup_date on file yet, this refuses to fall back to today's date
//     silently — it surfaces as an error instead, since a wrong LR date
//     is worse than a delayed one.
//  2. Idempotent per booking: if an LR already exists for a booking_id,
//     this returns that existing LR (created: false) instead of ever
//     inserting a second one.

import { supabaseAdmin } from '@/lib/supabase'
import { findRouteMatch, citiesEqual } from '@/lib/city-normalize'
import { computeLrCharges } from '@/lib/lr-constants'
import { formatCustomerName } from '@/lib/constants'
import { indianFinancialYear } from '@/lib/financial-year'

// Legacy global numbering — kept unchanged (not the atomic
// next_series_number/next_branch_lr_seq mechanism, still the original
// MAX+1 query) as the fallback path for when no branch can be resolved
// (see resolveBranchForLr() below) — e.g. before any branches are
// configured, or a pickup city that doesn't map to one yet. Every LR
// created through resolveBranchForLr() finding a real match instead gets
// a proper branch-wise, race-safe number via nextBranchLrNumber().
export async function nextLrNumber(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `BDLR-${year}-`

  const { data } = await supabaseAdmin
    .from('lrs')
    .select('lr_number')
    .like('lr_number', `${prefix}%`)
    .order('lr_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSeq = 1
  if (data?.lr_number) {
    const last = parseInt(data.lr_number.split('-').pop() ?? '0', 10)
    if (!isNaN(last)) nextSeq = last + 1
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

// ── Branch-Wise LR numbering (2026-09-02) ───────────────────────────────
// See supabase/migrations/20260902_branch_wise_lr.sql for the schema/RPC
// this drives. Every field an LR needs to snapshot from its issuing
// branch (per that migration's "immutable snapshot" design — a branch
// rename/edit later must never retroactively change an already-issued
// LR's letterhead) lives on ResolvedBranch.
export interface ResolvedBranch {
  id:                string
  branch_code:       string
  branch_name:       string
  city:              string
  address:           string | null
  gst_number:        string | null
  contact_number:    string | null
  email:             string | null
  lr_series_prefix:  string
  lr_include_fy:     boolean
  lr_padding:        number
}

const BRANCH_COLUMNS = 'id, branch_code, branch_name, city, address, gst_number, contact_number, email, lr_series_prefix, lr_include_fy, lr_padding'

/**
 * Resolves the LR Issuing Branch per spec section 3 ("Automatic Branch
 * Selection"): an explicit branch_id (from the admin's own selection in
 * the New LR form, or an override) always wins; otherwise the pickup city
 * is matched against active branches' `city` via the same normalization
 * used for route_pricing/lr_routes matching. Returns null — meaning "no
 * confident match, fall back to the legacy global series" — if there are
 * no active branches yet, no city to match on, or MORE THAN ONE active
 * branch shares that city (spec: "If automatic branch mapping is
 * unavailable or multiple branches are possible, allow the admin to
 * manually select" — for the unattended automatic-on-Payment-Received
 * trigger there's no admin present to ask, so it degrades to the legacy
 * series rather than guessing; the LR module's manual "New LR" form
 * always has an admin who can resolve the ambiguity by picking explicitly).
 */
export async function resolveBranchForLr(pickupCity: string | null, explicitBranchId?: string | null): Promise<ResolvedBranch | null> {
  if (explicitBranchId) {
    const { data } = await supabaseAdmin
      .from('branches')
      .select(BRANCH_COLUMNS)
      .eq('id', explicitBranchId)
      .eq('is_active', true)
      .maybeSingle()
    return data ?? null
  }

  if (!pickupCity) return null

  const { data: branches } = await supabaseAdmin
    .from('branches')
    .select(BRANCH_COLUMNS)
    .eq('is_active', true)
  if (!branches || branches.length === 0) return null

  const matches = branches.filter(b => citiesEqual(b.city, pickupCity))
  return matches.length === 1 ? matches[0] : null
}

export interface BranchLrNumberResult {
  lrNumber:      string
  financialYear: string
}

/**
 * Mints the next number in `branch`'s own independent sequence via the
 * atomic next_branch_lr_seq() RPC (race-safe — see that function's
 * comment in the migration for why the plain next_series_number() RPC
 * used by BDA/BDL/BDQ isn't reused here: it hardcodes calendar-year
 * rollover, which would fragment a single Indian Financial Year's
 * sequence at the Jan 1 boundary). Format follows the branch's own
 * lr_include_fy setting — spec section 5's two example formats
 * (MUM-LR-000001 vs MUM/2026-27/LR/000001) are literally this same
 * function with lr_include_fy false vs true.
 */
export async function nextBranchLrNumber(branch: ResolvedBranch): Promise<BranchLrNumberResult> {
  const fy = indianFinancialYear()
  const { data: seq, error } = await supabaseAdmin.rpc('next_branch_lr_seq', {
    p_branch_code: branch.lr_series_prefix,
    p_year:        fy.startYear,
    p_width:       branch.lr_padding,
  })
  if (error || !seq) {
    throw new Error(`Could not generate LR number for branch ${branch.branch_code}: ${error?.message ?? 'no value returned'}`)
  }
  const lrNumber = branch.lr_include_fy
    ? `${branch.lr_series_prefix}/${fy.label}/LR/${seq}`
    : `${branch.lr_series_prefix}-LR-${seq}`
  return { lrNumber, financialYear: fy.label }
}

/** The 7 lrs columns snapshotting the issuing branch — null-filled when no branch resolved (legacy fallback). */
export function branchSnapshotFields(branch: ResolvedBranch | null) {
  return {
    branch_id:             branch?.id ?? null,
    branch_code:           branch?.branch_code ?? null,
    branch_name:           branch?.branch_name ?? null,
    branch_address:        branch?.address ?? null,
    branch_gst_number:     branch?.gst_number ?? null,
    branch_contact_number: branch?.contact_number ?? null,
    branch_email:          branch?.email ?? null,
    financial_year:        null as string | null, // filled in by the caller once the FY-aware number is minted
  }
}

export interface CreateLrForBookingResult {
  lr: Record<string, unknown> | null
  created: boolean
  error?: string
}

/**
 * Creates an LR for the given booking, or returns the one that already
 * exists. `overrides` (optional) lets an admin's explicit form input win
 * over the raw booking record for every field EXCEPT lr_date, which is
 * always the booking's pickup_date — see the module comment above for why
 * that one field is not overridable via this path.
 */
export async function createOrGetLrForBooking(
  bookingId: string,
  overrides: Record<string, unknown> = {}
): Promise<CreateLrForBookingResult> {
  // ── Idempotency guard ──────────────────────────────────────────────
  const { data: existingLr } = await supabaseAdmin
    .from('lrs')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (existingLr) return { lr: existingLr, created: false }

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single()
  if (bookingErr || !booking) {
    return { lr: null, created: false, error: 'Booking not found' }
  }

  // Mandatory rule: LR Date = Pickup Date. Never today's date, never a
  // body/override value — a booking with no pickup_date is a data problem
  // to fix on the booking itself, not something to paper over here.
  if (!booking.pickup_date) {
    return { lr: null, created: false, error: 'Booking has no pickup_date set — cannot create an LR without one.' }
  }
  const lrDate = booking.pickup_date as string

  const fromCity = booking.from_city as string | null
  const toCity   = booking.to_city   as string | null

  let route: { id: string; from_branch_code: string | null; to_branch_code: string | null; gst_type: string } | null = null
  if (fromCity && toCity) {
    const { data: routes } = await supabaseAdmin
      .from('lr_routes')
      .select('id, from_city, to_city, from_branch_code, to_branch_code, gst_type')
      .eq('is_active', true)
    route = findRouteMatch(routes ?? [], fromCity, toCity)
  }
  const gstType = (route?.gst_type as 'intrastate' | 'interstate') ?? 'intrastate'

  const charges = {
    freight:       Number(overrides.freight)        || 0,
    surcharge:     Number(overrides.surcharge)      || 0,
    local_cartage: Number(overrides.local_cartage)  || 0,
    last_mile_frt: Number(overrides.last_mile_frt)  || 0,
    fov:           Number(overrides.fov)            || 0,
    loading_chg:   Number(overrides.loading_chg)    || 0,
    unloading_chg: Number(overrides.unloading_chg)  || 0,
    handling_chg:  Number(overrides.handling_chg)   || 0,
    gc_charge:     Number(overrides.gc_charge)      || 0,
    other_charge:  Number(overrides.other_charge)   || 0,
    eway_bill_chg: Number(overrides.eway_bill_chg)  || 0,
    aoc:           Number(overrides.aoc)            || 0,
  }
  const totals = computeLrCharges(charges, gstType)

  // ── Branch-Wise LR numbering ────────────────────────────────────────
  // ov.branch_id (an explicit admin selection from the New LR form) wins;
  // otherwise auto-suggest from the booking's pickup city. Falls back to
  // the legacy global BDLR- series if no confident branch match exists —
  // see resolveBranchForLr()'s doc comment for exactly when that happens
  // and why (never blocks automatic LR creation on Payment Received).
  const ovBranchId = (overrides as Record<string, unknown>).branch_id as string | undefined
  const resolvedBranch = await resolveBranchForLr(fromCity, ovBranchId ?? null)
  const lrNumber = resolvedBranch
    ? (await nextBranchLrNumber(resolvedBranch)).lrNumber
    : await nextLrNumber()
  const branchFields = {
    ...branchSnapshotFields(resolvedBranch),
    financial_year: resolvedBranch ? indianFinancialYear().label : null,
  }

  const bookingDisplayName =
    formatCustomerName(booking.title as string | null, booking.customer_name as string)
    || (booking.customer_name as string)

  const ov = overrides as Record<string, string | number | boolean | undefined>

  const consignorName    = (ov.consignor_name as string)?.trim()    || bookingDisplayName || ''
  const consignorMobile  = (ov.consignor_mobile as string)?.trim()  || (booking.customer_phone as string) || null
  const consignorEmail   = (ov.consignor_email as string)?.trim()   || (booking.customer_email as string) || null
  const consignorAddress = (ov.consignor_address as string)?.trim() || (booking.pickup_address as string) || null

  const consigneeName    = (ov.consignee_name as string)?.trim()    || bookingDisplayName || ''
  const consigneeMobile  = (ov.consignee_mobile as string)?.trim()  || (booking.customer_phone as string) || null
  const consigneeAddress = (ov.consignee_address as string)?.trim() || (booking.drop_address as string) || null

  const insertPayload = {
    lr_number:      lrNumber,
    booking_id:     bookingId,
    route_id:       route?.id ?? null,
    ...branchFields,

    lr_date:        lrDate,
    booking_office: (ov.booking_office as string) || route?.from_branch_code || null,
    vehicle_number: (ov.vehicle_number as string) || null,
    from_city:      fromCity,
    to_city:        toCity,
    mode:           (ov.mode as string) || 'Air',

    consignor_name:    consignorName,
    consignor_address: consignorAddress,
    consignor_mobile:  consignorMobile,
    consignor_email:   consignorEmail,
    consignor_gstin:   (ov.consignor_gstin as string)?.trim() || null,

    consignee_name:    consigneeName,
    consignee_address: consigneeAddress,
    consignee_mobile:  consigneeMobile,
    consignee_gstin:   (ov.consignee_gstin as string)?.trim() || null,

    billed_to_name:    (ov.billed_to_name as string)?.trim()  || consignorName,
    billed_to_gstin:   (ov.billed_to_gstin as string)?.trim() || null,
    delivery_address:  (ov.delivery_address as string)?.trim() || consigneeAddress,

    invoice_number:   (ov.invoice_number as string)?.trim() || null,
    invoice_value:    ov.invoice_value != null ? Number(ov.invoice_value) : null,
    eway_bill_number: (ov.eway_bill_number as string)?.trim() || null,

    total_bags:          Number(booking.total_bags ?? 1),
    content_description: (ov.content_description as string)?.trim() || 'HOUSEHOLD BAGGAGE',
    actual_weight:       ov.actual_weight     != null ? Number(ov.actual_weight)     : null,
    chargeable_weight:   ov.chargeable_weight != null ? Number(ov.chargeable_weight) : null,
    size_l:              ov.size_l != null ? Number(ov.size_l) : null,
    size_w:              ov.size_w != null ? Number(ov.size_w) : null,
    size_h:              ov.size_h != null ? Number(ov.size_h) : null,
    private_mark:        (ov.private_mark as string)?.trim() || null,
    ti_tag:              (ov.ti_tag as string)?.trim() || null,

    ...charges,
    ...totals,

    insurance_by_customer: !!ov.insurance_by_customer,
    gst_payable_by: (ov.gst_payable_by as string) || 'Consignor',
    payment_terms:  (ov.payment_terms as string)  || 'To Pay',
    lr_type:        (ov.lr_type as string)        || 'At Branch',
    delivery_at:    (ov.delivery_at as string)    || 'Door Dly',
    remarks:        (ov.remarks as string)?.trim() || null,
    prepared_by:    (ov.prepared_by as string)    || 'admin',

    flight_number: (ov.flight_number as string)?.trim() || null,
    airline:       (ov.airline as string)?.trim()       || null,
    arrival_date:  (ov.arrival_date as string)          || null,
    arrival_time:  (ov.arrival_time as string)          || null,

    driver_name:   (ov.driver_name as string)?.trim()   || (booking.driver_name as string) || null,
    driver_mobile: (ov.driver_mobile as string)?.trim() || (booking.driver_phone as string) || null,
    vehicle_type:  (ov.vehicle_type as string)?.trim()  || (booking.vehicle_type as string) || null,

    status: 'generated',
    status_history: [{
      from: null, to: 'generated',
      timestamp: new Date().toISOString(),
      changed_by: (ov.created_by as string) || 'admin',
      note: (ov.status_note as string) || `LR generated for booking ${booking.tracking_id ?? bookingId}`,
    }],
    created_by: (ov.created_by as string) || 'admin',
  }

  const { data: lr, error } = await supabaseAdmin
    .from('lrs')
    .insert(insertPayload)
    .select()
    .single()

  if (error) return { lr: null, created: false, error: error.message }
  return { lr, created: true }
}
