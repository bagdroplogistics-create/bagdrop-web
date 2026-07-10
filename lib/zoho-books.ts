/**
 * Zoho Books REST API client — India edition
 *
 * Required environment variables (.env.local):
 *   ZOHO_CLIENT_ID       — from Zoho API Console > Self Client
 *   ZOHO_CLIENT_SECRET   — from Zoho API Console > Self Client
 *   ZOHO_REFRESH_TOKEN   — one-time OAuth exchange (see setup guide below)
 *   ZOHO_ORG_ID          — 60041657788 (Bagdrop Logistics Solutions Pvt Ltd)
 *
 * Setup guide:
 *   1. Go to https://api-console.zoho.in
 *   2. Create a Self Client, set scopes: ZohoBooks.fullaccess.all
 *   3. Copy Client ID + Client Secret to .env.local
 *   4. Generate a one-time auth code (valid 3 min), then exchange:
 *
 *   curl -X POST "https://accounts.zoho.in/oauth/v2/token" \
 *     -d "grant_type=authorization_code&client_id=YOUR_ID&client_secret=YOUR_SECRET&redirect_uri=https://zoom.us/oauth/auth&code=ONE_TIME_CODE"
 *
 *   5. Copy the refresh_token from the response to ZOHO_REFRESH_TOKEN
 */

const ZOHO_BASE     = 'https://www.zohoapis.in/books/v3'
const ZOHO_AUTH_URL = 'https://accounts.zoho.in/oauth/v2/token'

export const ZOHO_ORG_ID      = process.env.ZOHO_ORG_ID      ?? '60041657788'
export const ZOHO_TEMPLATE_ID = '2568730000000031181'  // Excel template used by all Bagdrop estimates

// Tax IDs — from live Zoho Books account
export const TAX_IGST5 = '2568730000000033110'  // 5% IGST  (inter-state)
export const TAX_GST5  = '2568730000000033236'  // 5% GST   (intra-state, CGST+SGST)
// Default to GST5 (intrastate CGST+SGST). Contacts created via API default to Gujarat
// (same state as Bagdrop org), so Zoho rejects IGST for them.
export const DEFAULT_TAX_ID = TAX_GST5

// HSN/SAC code for baggage transport
export const SAC_TRANSPORT = '996511'

// ── Token cache (module-level, lives for the process lifetime) ────
let _token: string | null = null
let _tokenExpiry          = 0

export async function getZohoAccessToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token

  const clientId     = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Zoho Books credentials not configured. ' +
      'Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in .env.local'
    )
  }

  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })

  const res  = await fetch(ZOHO_AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  })
  const data = await res.json() as Record<string, unknown>

  if (!res.ok || !data.access_token) {
    throw new Error(`Zoho token refresh failed: ${JSON.stringify(data)}`)
  }

  _token       = data.access_token as string
  _tokenExpiry = Date.now() + ((data.expires_in as number ?? 3600) * 1000) - 60_000
  return _token
}

// ── HTTP helpers ──────────────────────────────────────────────────

async function zohoFetch(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  query: Record<string, string> = {},
  body?: unknown,
): Promise<Record<string, unknown>> {
  const token = await getZohoAccessToken()
  const qs    = new URLSearchParams({ organization_id: ZOHO_ORG_ID, ...query })
  const url   = `${ZOHO_BASE}${path}?${qs}`

  const res = await fetch(url, {
    method,
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const json = await res.json() as Record<string, unknown>

  if ((json.code as number) !== 0) {
    throw new Error(`Zoho ${method} ${path}: [${json.code}] ${json.message}`)
  }
  return json
}

const zohoGet  = (path: string, query?: Record<string, string>) => zohoFetch('GET',  path, query)
const zohoPost = (path: string, body: unknown)                  => zohoFetch('POST', path, {}, body)

// ── Contact helpers ───────────────────────────────────────────────

/** Search for an existing Zoho contact by phone. Returns contact_id or null. */
export async function findZohoContactByPhone(phone: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, '').slice(-10)
  try {
    const d1 = await zohoGet('/contacts', { mobile: digits, filter_by: 'Status.Active' })
    const c1  = (d1.contacts as Record<string, unknown>[] | undefined) ?? []
    if (c1.length > 0) return c1[0].contact_id as string

    const d2 = await zohoGet('/contacts', { phone: digits, filter_by: 'Status.Active' })
    const c2  = (d2.contacts as Record<string, unknown>[] | undefined) ?? []
    if (c2.length > 0) return c2[0].contact_id as string
  } catch {
    // silently return null — not finding is not an error
  }
  return null
}

/** Create a new Zoho customer contact. Returns contact_id. */
export async function createZohoContact(
  name:   string,
  phone:  string,
  email?: string,
): Promise<string> {
  const digits = phone.replace(/\D/g, '').slice(-10)
  const body: Record<string, unknown> = {
    contact_name:  name.trim(),
    contact_type:  'customer',
    gst_treatment: 'consumer',
    mobile:        digits,
  }
  if (email?.trim()) body.email = email.trim()

  const data = await zohoPost('/contacts', body)
  return (data.contact as Record<string, unknown>).contact_id as string
}

/** Find existing or create new Zoho contact. Returns contact_id. */
export async function findOrCreateZohoContact(
  name:   string,
  phone:  string,
  email?: string,
): Promise<string> {
  const existing = await findZohoContactByPhone(phone)
  if (existing) return existing
  return createZohoContact(name, phone, email)
}

// ── Estimate helpers ──────────────────────────────────────────────

export interface ZohoLineItem {
  name:         string
  description?: string
  quantity:     number
  rate:         number
  tax_id:       string
  hsn_or_sac:   string
  unit?:        string
}

// Zoho Books estimate custom field indices (from list_custom_fields API)
export const CF_IDX = {
  PICKUP_DATE:    2,   // cf_pick_up_date               (date_time)
  DELIVERY_DATE:  3,   // cf_delivery_date               (date)
  FROM:           4,   // cf_from                        (string)
  TO:             5,   // cf_to                          (string)
  FLIGHT_TIME:    6,   // cf_intl_flight_time_arr_dep    (date_time)
  NO_OF_BAGS:     7,   // cf_no_of_bags                  (string)
  PICKUP_ADDRESS: 8,   // cf_pick_up_address             (string) [mandatory]
  PAYMENT_STATUS: 9,   // cf_payment_status              (string) [mandatory]
  UNDERTAKING:    10,  // cf_undertaking_status          (string) [mandatory]
  CLIENT_PHONE:   12,  // cf_cient_contact_number        (string) [mandatory, typo is in Zoho]
  SCAN_PAY:       13,  // cf_scan_pay                    (image)  default: QR doc ID
  CUSTOMER_ID_NO: 14,  // cf_customer_id_no              (string) post-booking
  BAGS_PICKUP_TAG:15,  // cf_customer_bags_pickup_tag_no (string) post-booking
  BAGDROP_CODE:   16,  // cf_mgas_code_no / BagDrop Code No (string) post-booking
} as const

export interface ZohoCustomField {
  index: number
  value: string
}

export interface CreateEstimateInput {
  customer_id:       string
  date:              string          // YYYY-MM-DD
  expiry_date?:      string          // YYYY-MM-DD
  reference_number?: string          // agent / partner name
  salesperson_name?: string          // e.g. "Lata Parmar"
  subject?:          string          // subject line shown at top of estimate
  line_items:        ZohoLineItem[]
  custom_fields:     ZohoCustomField[]
  notes?:            string          // Customer Notes section
  terms?:            string          // Terms & Conditions section
  send_email?:       boolean         // immediately email customer from Zoho
}

export interface ZohoEstimateResult {
  estimate_id:     string
  estimate_number: string           // e.g. "QT-0000385"
  status:          string
  total:           number
  zoho_url:        string           // link to Zoho Books web app
}

export async function createZohoEstimate(input: CreateEstimateInput): Promise<ZohoEstimateResult> {
  const body: Record<string, unknown> = {
    customer_id:   input.customer_id,
    date:          input.date,
    template_id:   ZOHO_TEMPLATE_ID,
    line_items:    input.line_items,
    custom_fields: input.custom_fields,
  }
  if (input.reference_number) body.reference_number = input.reference_number
  if (input.salesperson_name) body.salesperson_name = input.salesperson_name
  if (input.expiry_date)      body.expiry_date      = input.expiry_date
  if (input.subject)          body.subject          = input.subject
  if (input.notes)            body.notes            = input.notes
  if (input.terms)            body.terms            = input.terms

  const query: Record<string, string> = { organization_id: ZOHO_ORG_ID }
  if (input.send_email)       query.send = 'true'

  const token = await getZohoAccessToken()
  const qs    = new URLSearchParams(query)
  const res   = await fetch(`${ZOHO_BASE}/estimates?${qs}`, {
    method:  'POST',
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json() as Record<string, unknown>
  if ((data.code as number) !== 0) {
    throw new Error(`Create estimate failed: ${data.message}`)
  }

  const est = data.estimate as Record<string, unknown>
  return {
    estimate_id:     est.estimate_id     as string,
    estimate_number: est.estimate_number as string,
    status:          est.status          as string,
    total:           est.total           as number,
    zoho_url:        `https://books.zoho.in/app/${ZOHO_ORG_ID}#/estimates/${est.estimate_id}`,
  }
}

// ── Pricing helpers ───────────────────────────────────────────────

/**
 * Build Zoho line items from Bagdrop's route pricing model.
 *
 * Pricing rule:
 *   - 1–2 bags: flat base_price
 *   - 3+ bags:  base_price + (bags - 2) × per_bag_rate
 *
 * Zoho line items:
 *   - Always: 1× base item (upto 2 bags), rate = base_price
 *   - If bags > 2: additional item qty=(bags-2), rate = per_bag_rate
 */
export function buildLineItems(opts: {
  fromCity:    string
  toCity:      string
  bags:        number
  basePrice:   number
  perBagRate:  number
  taxId?:      string
}): ZohoLineItem[] {
  const { fromCity, toCity, bags, basePrice, perBagRate, taxId = DEFAULT_TAX_ID } = opts
  const routeLabel = `${fromCity} → ${toCity}`

  const items: ZohoLineItem[] = [
    {
      name:        `Transportation of Goods (Upto 2 Bags) — ${routeLabel}`,
      description: 'Airport-to-Doorstep / Doorstep-to-Airport baggage delivery',
      quantity:    1,
      rate:        basePrice,
      tax_id:      taxId,
      hsn_or_sac:  SAC_TRANSPORT,
      unit:        '2 Bags',
    },
  ]

  if (bags > 2) {
    items.push({
      name:        `Additional Bag(s) — ${routeLabel}`,
      description: `Per additional bag beyond 2 (${bags - 2} extra bag${bags - 2 !== 1 ? 's' : ''})`,
      quantity:    bags - 2,
      rate:        perBagRate,
      tax_id:      taxId,
      hsn_or_sac:  SAC_TRANSPORT,
      unit:        'Bag(s)',
    })
  }

  return items
}

/**
 * Build Zoho line items for custom (per-bag) pricing.
 * Used when the route is not in our DB — agent sets a custom rate per bag.
 */
export function buildCustomLineItems(opts: {
  fromCity:    string
  toCity:      string
  bags:        number
  pricePerBag: number
  taxId?:      string
}): ZohoLineItem[] {
  const { fromCity, toCity, bags, pricePerBag, taxId = DEFAULT_TAX_ID } = opts
  return [
    {
      name:        `Transportation of Goods (${bags} Bag${bags !== 1 ? 's' : ''}) — ${fromCity} → ${toCity}`,
      description: 'Airport-to-Doorstep / Doorstep-to-Airport baggage delivery',
      quantity:    bags,
      rate:        pricePerBag,
      tax_id:      taxId,
      hsn_or_sac:  SAC_TRANSPORT,
      unit:        'Bag(s)',
    },
  ]
}

// ── Date / time formatting ────────────────────────────────────────

/** Extract the start time from a slot string like "08:00 – 10:00" → "08:00" */
export function slotStartTime(slot: string): string {
  return slot.split(/[–\-]/)[0].trim()
}

/** Convert "YYYY-MM-DD" + "HH:mm" to Zoho datetime: "YYYY-MM-DD HH:mm" */
export function toZohoDateTime(date: string, time: string): string {
  return `${date} ${time}`
}

/** Convert ISO timestamp to Zoho datetime: "2026-07-24T19:00:00" → "2026-07-24 19:00" */
export function isoToZohoDateTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16)
}
