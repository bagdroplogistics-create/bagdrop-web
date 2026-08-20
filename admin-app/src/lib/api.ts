// Thin client for www.bagdrop.co's existing admin API routes. No separate
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

// Single source of truth for the headline inquiry/booking KPIs — mirrors
// app/api/admin/dashboard-analytics/route.ts exactly (see that file's
// module comment). This superseded the old bookings-only counting in
// /api/admin/stats (still used below for the secondary funnel numbers),
// which produced non-reconciling counts against the Leads tab. Every
// number here is lead-based (one lead = one real inquiry), excludes
// soft-deleted leads, and buckets rejected/closed separately so they
// don't inflate Total Inquiries.
export interface DashboardAnalytics {
  total_inquiries: number
  total_completed: number
  total_active: number
  total_pending: number
  total_cancelled: number
  total_rejected: number
  current_month_total_inquiries: number
  last_month_total_inquiries: number
  current_month_completed: number
  last_month_completed: number
}

export interface CrmStats {
  total_leads: number
  unbooked_leads: number
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
  // Payment proof upload + Account Department verification — deliberately
  // separate from payment_status/'payment_approved' (admin bypass / Pay
  // Later already means something else). See lib/api.ts's Payments
  // section and app/bookings/[id].tsx's Payment Proof & Verification card.
  payment_verification_status?:     string | null
  payment_verification_payment_id?: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export function fetchAdminStats(key: string) {
  return adminRequest<AdminStats>(key, '/api/admin/stats')
}

export function fetchDashboardAnalytics(key: string) {
  return adminRequest<DashboardAnalytics>(key, '/api/admin/dashboard-analytics')
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
  // Resends the quote email and advances the booking to 'quote_sent' —
  // mirrors doSendQuote() in app/(admin)/admin/quotes/view/[lead_id]/
  // page.tsx exactly (same PATCH /api/admin/bookings/[id] call).
  send_quote_email?: boolean
  // "Admin Approve — Pay Later" (VIP bypass). Must be sent this way, NOT
  // as a raw payment_status: 'approved_pending' — the backend
  // (app/api/admin/bookings/[id]/route.ts) only enforces its admin-only
  // role gate and writes approved_by/status='payment_approved' when this
  // exact field is present. Sending payment_status directly skips both.
  approved_without_payment?: boolean
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

// ── Payments ─────────────────────────────────────────────────────────────
// Mirrors app/api/admin/payments/route.ts, .../payments/[id]/route.ts, and
// .../payments/[id]/attachments/route.ts exactly — same fields, same
// synthetic "booking with no payment logged yet" rows, same
// verify/reject/refund semantics. No separate mobile payments system.
export interface PaymentAttachment {
  url: string; filename: string; size: number; type: string; uploaded_at: string
}

export interface AdminPayment {
  id: string
  payment_id: string
  booking_id: string | null
  title?: string | null
  customer_name: string
  customer_phone: string
  amount: number
  payment_method: string
  // 'pending' | 'paid' | 'failed' | 'refunded' | 'pending_verification' | 'rejected'
  payment_status: string
  payment_reference: string | null
  payment_date: string | null
  notes: string | null
  verified_by: string | null
  verified_at: string | null
  refund_amount: number | null
  refund_reason: string | null
  bank_charges: number | null
  tds_deducted: boolean | null
  tds_amount: number | null
  proof_url: string | null
  proof_type: 'image' | 'pdf' | null
  attachments?: PaymentAttachment[]
  created_at: string
  // Synthetic (booking-derived, no real payments row yet) rows are
  // display-only — their "id" is `booking:<bookingId>`, not a real UUID,
  // so there is nothing to PATCH/attach to until a real payment is logged.
  is_synthetic?: boolean
  invoice_number?: string | null
  unused_amount?: number
}

export interface FetchPaymentsParams {
  status?: string
  search?: string
  bookingId?: string
  page?: number
  limit?: number
}

export function fetchPayments(key: string, params: FetchPaymentsParams = {}) {
  const qs = new URLSearchParams()
  if (params.bookingId) qs.set('booking_id', params.bookingId)
  if (params.status && params.status !== 'all') qs.set('status', params.status)
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  return adminRequest<{ payments: AdminPayment[]; total: number; page: number; limit: number }>(
    key, `/api/admin/payments?${qs.toString()}`
  )
}

export interface PaymentDetailResult {
  payment: AdminPayment
  invoice: { invoice_number: string; invoice_date: string | null; total_amount: number; customer_address: string | null } | null
  customer_address: string | null
  unused_amount: number
}

export function fetchPayment(key: string, id: string) {
  return adminRequest<PaymentDetailResult>(key, `/api/admin/payments/${id}`)
}

export interface CreatePaymentPayload {
  booking_id?: string | null
  customer_name: string
  customer_phone?: string
  amount: number
  payment_method?: string
  payment_status?: string
  payment_reference?: string
  payment_date?: string
  notes?: string
  bank_charges?: number
  tds_deducted?: boolean
  tds_amount?: number
}

export function createPayment(key: string, payload: CreatePaymentPayload) {
  return adminRequest<{ payment: AdminPayment }>(key, '/api/admin/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface PaymentPatch {
  payment_status?: string
  payment_method?: string
  payment_reference?: string
  notes?: string
  refund_amount?: number
  refund_reason?: string
}

export function updatePayment(key: string, id: string, patch: PaymentPatch) {
  return adminRequest<{ payment: AdminPayment }>(key, `/api/admin/payments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// File uploads use fetch directly (not adminRequest, which always sends
// Content-Type: application/json) — same multipart pattern as the
// website's Record Payment attachments dropzone.
async function uploadFile<T>(key: string, path: string, file: { uri: string; name: string; type: string }): Promise<T> {
  const form = new FormData()
  // React Native's FormData accepts this { uri, name, type } shape directly
  // (not a real Blob/File) — RN's networking layer streams from the local
  // file uri. This is the standard Expo/RN multipart-upload pattern.
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob)

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'x-admin-key': key }, // deliberately no Content-Type — fetch sets the multipart boundary itself
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AdminApiError((data as { error?: string }).error ?? `Upload failed (${res.status})`, res.status)
  return data as T
}

export function uploadPaymentAttachment(key: string, paymentId: string, file: { uri: string; name: string; type: string }) {
  return uploadFile<{ attachment: PaymentAttachment; attachments: PaymentAttachment[] }>(
    key, `/api/admin/payments/${paymentId}/attachments`, file
  )
}

// Payment Proof upload — Booking Workflow spec: uploads the customer's
// payment screenshot/PDF against a specific booking, creates a `payments`
// row tagged 'pending_verification' (never auto-approved), and notifies
// the Account Department. Mirrors app/api/admin/bookings/[id]/
// payment-proof/route.ts exactly, including that uploading proof never
// marks the payment approved by itself.
export function uploadPaymentProof(key: string, bookingId: string, file: { uri: string; name: string; type: string }) {
  return uploadFile<{ success: boolean; payment: AdminPayment; proofUrl: string }>(
    key, `/api/admin/bookings/${bookingId}/payment-proof`, file
  )
}

// ── Invoices ─────────────────────────────────────────────────────────────
// Mirrors app/api/admin/invoices/route.ts and .../invoices/[id]/route.ts
// exactly, including the "one placeholder row per completed booking with
// no real invoice yet" merge (generated: false) so a completed booking
// nobody's generated an invoice for still shows up here with a "Generate
// Invoice" action, same as the website's Invoices tab.
export interface InvoiceLineItem {
  name: string; description: string; hsn: string
  quantity: number; rate: number; amount: number
}

export interface AdminInvoice {
  id: string
  invoice_number: string | null
  booking_id: string | null
  po_number?: string | null
  title?: string | null
  customer_name: string
  customer_phone: string
  customer_email: string | null
  customer_address?: string | null
  customer_type?: string | null
  business_name?: string | null
  gst_number?: string | null
  service_type: string | null
  from_city: string
  to_city: string
  total_bags: number | null
  base_amount: number
  cgst: number
  sgst: number
  igst?: number
  total_amount: number
  payment_status: string
  payment_method: string | null
  payment_reference: string | null
  notes: string | null
  invoice_date: string
  due_date?: string | null
  place_of_supply?: string | null
  consignment_no?: string | null
  pickup_date?: string | null
  delivery_date?: string | null
  line_items?: InvoiceLineItem[] | null
  sent_email?: boolean
  sent_whatsapp?: boolean
  created_at: string
  // false for the synthetic "completed booking, no invoice generated yet"
  // placeholder rows — id is `pending-<bookingId>`, not a real invoice id.
  generated: boolean
}

export interface FetchInvoicesParams {
  status?: string // 'all' | 'not_generated' | payment_status value
  search?: string
  bookingId?: string
  page?: number
  limit?: number
}

export function fetchInvoices(key: string, params: FetchInvoicesParams = {}) {
  const qs = new URLSearchParams()
  if (params.bookingId) qs.set('booking_id', params.bookingId)
  if (params.status && params.status !== 'all') qs.set('status', params.status)
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  return adminRequest<{ invoices: AdminInvoice[]; total: number; page: number; limit: number }>(
    key, `/api/admin/invoices?${qs.toString()}`
  )
}

export function fetchInvoice(key: string, id: string) {
  return adminRequest<{ invoice: AdminInvoice }>(key, `/api/admin/invoices/${id}`)
}

// Generates the real invoice for a completed booking — same
// POST /api/admin/invoices endpoint the website's "Generate Invoice"
// action (and the placeholder rows' click target) uses, just the
// booking-derived branch (no `manual: true`). Never touches
// createManualInvoice's freeform-item path — that's a website-only "New
// Invoice" form for now, out of scope for this pass.
export function generateInvoiceForBooking(key: string, bookingId: string, sendEmail = false) {
  return adminRequest<{ invoice: AdminInvoice }>(key, '/api/admin/invoices', {
    method: 'POST',
    body: JSON.stringify({ booking_id: bookingId, send_email: sendEmail }),
  })
}

// Real PDF bytes — see app/api/admin/invoices/[id]/pdf/route.ts. Not
// fetched through adminRequest (that always expects JSON) — screens using
// this build the URL directly for FileSystem.downloadAsync/openBrowserAsync.
export function invoicePdfUrl(id: string) {
  return `${API_BASE_URL}/api/admin/invoices/${id}/pdf`
}

// ── Customers ────────────────────────────────────────────────────────────
// Mirrors app/api/admin/customers/route.ts exactly. There is no
// standalone `customers` table in this schema — a "customer" here is
// derived by aggregating `bookings` rows keyed by phone number, same as
// the website's own Customers page. bookings already covers every stage
// of a customer's lifecycle (inquiry → quote → booking → completed), so
// this one list doubles as booking/inquiry/quote history, matching what
// the website itself shows — there's no separate quotes/inquiries list
// on the website's Customers page either.
export interface CustomerBooking {
  id: string; tracking_id: string; from_city: string; to_city: string
  created_at: string; status: string; total_amount: number
}

export interface AdminCustomer {
  phone: string
  name: string
  email: string
  total_bookings: number
  total_spent: number
  last_booking: string
  first_booking: string
  bookings: CustomerBooking[]
}

export function fetchCustomers(key: string, params: { search?: string } = {}) {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  return adminRequest<{ customers: AdminCustomer[]; total: number }>(
    key, `/api/admin/customers?${qs.toString()}`
  )
}
