// Thin client for bagdrop.co's existing admin API routes. No separate
// backend for the admin app — every call here hits the exact same
// /api/admin/* endpoints the website admin dashboard already uses, with
// the same x-admin-key header the website sends as a query param.
//
// IMPORTANT: this deliberately does NOT introduce any new backend routes.
// If a screen needs data, prefer deriving it client-side from an existing
// endpoint's response (the website dashboard already does this for its
// 12-stage booking funnel) before adding a new API.

import { API_BASE_URL } from './config'

export class AdminApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function adminRequest<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': key,
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new AdminApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status)
  }
  return data as T
}

// ── Auth ─────────────────────────────────────────────────────────────────
export function getAdminRole(key: string) {
  return adminRequest<{ role: 'admin' | 'staff' }>(key, '/api/admin/auth-role')
}

// ── Dashboard ────────────────────────────────────────────────────────────
export interface AdminStats {
  total: number
  new_inquiries: number
  in_progress: number
  in_transit: number
  delivered: number
  revenue: number
}

export interface CrmStats {
  total_leads: number
  pending_quotes: number
  today_dispatch: number
  revenue_this_month: number
}

export interface AdminBooking {
  id: string
  tracking_id: string
  status: string
  title?: string | null
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  service_type: string
  service_label: string
  from_city: string
  to_city: string
  pickup_date: string | null
  delivery_date: string | null
  pickup_address: string | null
  drop_address: string | null
  total_bags: number | null
  total_amount: number
  currency: string
  payment_status: string | null
  payment_method: string | null
  payment_reference: string | null
  notes: string | null
  rejection_reason: string | null
  rejection_comment: string | null
  lead_id: string | null
  status_history: { from: string | null; to: string; timestamp: string; changed_by: string; note: string | null }[] | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export function fetchAdminStats(key: string) {
  return adminRequest<AdminStats>(key, '/api/admin/stats')
}

export function fetchCrmStats(key: string) {
  return adminRequest<CrmStats>(key, '/api/admin/crm-stats')
}

export interface FetchBookingsParams {
  status?: string
  statuses?: string[]
  excludeStatus?: string
  search?: string
  page?: number
  limit?: number
}

export function fetchAdminBookings(key: string, params: FetchBookingsParams = {}) {
  const qs = new URLSearchParams()
  if (params.statuses?.length) qs.set('statuses', params.statuses.join(','))
  else if (params.status) qs.set('status', params.status)
  else if (params.excludeStatus) qs.set('exclude_status', params.excludeStatus)
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  return adminRequest<{ bookings: AdminBooking[]; total: number }>(key, `/api/admin/bookings?${qs.toString()}`)
}

// Mirrors app/api/admin/bookings/[id]/route.ts exactly.
export function fetchAdminBooking(key: string, id: string) {
  return adminRequest<{ booking: AdminBooking }>(key, `/api/admin/bookings/${id}`)
}

// Mirrors the `lead_id` lookup branch in app/api/admin/bookings/route.ts —
// returns the single booking auto-created for a lead, if one exists.
export function fetchBookingByLead(key: string, leadId: string) {
  return adminRequest<{ booking: AdminBooking | null }>(key, `/api/admin/bookings?lead_id=${leadId}`)
}

export interface BookingPatch {
  status?: string
  reason?: string
  notes?: string
  title?: string
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  total_bags?: number
  total_amount?: number
  pickup_date?: string | null
  delivery_date?: string | null
  pickup_address?: string | null
  drop_address?: string | null
  payment_status?: string
  payment_method?: string
  payment_reference?: string | null
}

export function updateBooking(key: string, id: string, patch: BookingPatch) {
  return adminRequest<{ booking: AdminBooking }>(key, `/api/admin/bookings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// ── Leads / Inquiries ────────────────────────────────────────────────────
// Mirrors app/api/admin/leads/route.ts and .../leads/[id]/route.ts exactly —
// same fields, same status values, same soft-delete behaviour.
export interface AdminLead {
  id: string
  lead_number: string
  title?: string | null
  name: string
  phone: string
  phone_country_code?: string | null
  phone_national?: string | null
  email: string | null
  source: string | null
  service_interest: string | null
  service_type: string | null
  from_city: string | null
  to_city: string | null
  travel_date: string | null
  pickup_date: string | null
  delivery_date: string | null
  pickup_time: string | null
  pickup_address: string | null
  drop_address: string | null
  bags_count: number | null
  pnr: string | null
  flight_number: string | null
  flight_time: string | null
  notes: string | null
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | string
  booking_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export interface FetchLeadsParams {
  status?: string
  search?: string
  page?: number
  limit?: number
}

export function fetchLeads(key: string, params: FetchLeadsParams = {}) {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  return adminRequest<{ leads: AdminLead[]; total: number; page: number; limit: number }>(
    key, `/api/admin/leads?${qs.toString()}`
  )
}

export function fetchLead(key: string, id: string) {
  return adminRequest<{ lead: AdminLead }>(key, `/api/admin/leads/${id}`)
}

export interface CreateLeadPayload {
  title?: string
  name: string
  phone: string
  phone_country_code?: string
  phone_national?: string
  email?: string
  service_interest?: string
  from_city?: string
  to_city?: string
  travel_date?: string
  pickup_date?: string
  delivery_date?: string
  pickup_time?: string
  pickup_address?: string
  drop_address?: string
  bags_count?: number
  flight_number?: string
  pnr?: string
  notes?: string
  source?: string
  force_duplicate?: boolean
}

export function createLead(key: string, payload: CreateLeadPayload) {
  return adminRequest<{ lead: AdminLead; lead_number: string; tracking_id: string | null }>(
    key, '/api/admin/leads', { method: 'POST', body: JSON.stringify(payload) }
  )
}

export function updateLead(key: string, id: string, patch: Partial<CreateLeadPayload> & { status?: string; deleted_at?: string | null }) {
  return adminRequest<{ lead: AdminLead }>(key, `/api/admin/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteLead(key: string, id: string) {
  return adminRequest<{ success: boolean; soft_deleted: boolean }>(key, `/api/admin/leads/${id}`, { method: 'DELETE' })
}

// ── Route pricing ──────────────────────────────────────────────────────
// Mirrors app/api/admin/route-pricing/calculate/route.ts exactly.
export interface RoutePriceResult {
  found: boolean
  message?: string
  route_id?: string
  from_city?: string
  to_city?: string
  bags?: number
  base_price?: number
  per_bag_rate?: number
  subtotal?: number
  cgst?: number
  sgst?: number
  total?: number
}

export function calculateRoutePricing(key: string, from: string, to: string, bags: number) {
  const qs = new URLSearchParams({ from, to, bags: String(bags || 1) })
  return adminRequest<RoutePriceResult>(key, `/api/admin/route-pricing/calculate?${qs.toString()}`)
}

// ── Quotes ───────────────────────────────────────────────────────────────
// Mirrors app/api/admin/zoho/generate-quote/route.ts exactly. Despite the
// "zoho" path segment (a legacy name), this endpoint does NOT call Zoho
// Books — it computes and saves the quote entirely in Supabase against the
// lead's quote_* fields, same as the website's "New Quote" form.
export interface QuoteLineItemInput {
  name: string
  description?: string
  quantity: number
  rate: number
  hsn_or_sac?: string
}

export interface SavedQuoteLineItem {
  name: string
  description: string
  quantity: number
  rate: number
  tax_pct: number
  hsn_or_sac: string
  amount: number
}

export interface GenerateQuotePayload {
  lead_id: string
  // Return Trip quote creation lives only in the web admin panel
  // (Leads → New Quote) — intentionally no is_return_quote here so the
  // mobile app can't trigger it, even though the shared backend route
  // still accepts the field.
  agent_name?: string
  salesperson_name?: string
  expiry_date?: string
  subject?: string
  customer_notes?: string
  terms_conditions?: string
  explicit_line_items: QuoteLineItemInput[]
  pickup_datetime?: string
  delivery_date?: string
  flight_datetime?: string
  pickup_address?: string
  from_city?: string
  to_city?: string
  bags_count?: number
  discount_pct?: number
  discount_type?: 'pct' | 'fixed'
  discount_fixed_amt?: number
  payment_status?: 'pending' | 'received'
  send_email?: boolean
}

export interface GenerateQuoteResult {
  success: boolean
  quote_number: string
  estimate_number: string
  total: number
  subtotal: number
  discount_pct: number
  discount_amt: number
  tax: number
  line_items: SavedQuoteLineItem[]
  sent_to_customer: boolean
  zoho_url: string | null
}

export function generateQuote(key: string, payload: GenerateQuotePayload) {
  return adminRequest<GenerateQuoteResult>(key, '/api/admin/zoho/generate-quote', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Directly update saved quote fields on a lead (Edit Quote save — no
// regeneration/email). Mirrors the `allowed` quote_* fields in
// app/api/admin/leads/[id]/route.ts.
export interface QuotePatch {
  quote_line_items?: SavedQuoteLineItem[]
  quote_subtotal?: number
  quote_discount_pct?: number | null
  quote_discount_amt?: number | null
  quote_tax?: number
  quote_total?: number
  quote_subject?: string | null
  quote_notes?: string | null
  quote_terms?: string | null
  quote_expiry_date?: string | null
  salesperson_name?: string | null
  agent_name?: string | null
  payment_status?: 'pending' | 'received'
}

export function updateLeadQuote(key: string, id: string, patch: QuotePatch) {
  return adminRequest<{ lead: AdminLead }>(key, `/api/admin/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}
