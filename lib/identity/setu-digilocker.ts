// BAGDROP — Setu DigiLocker adapter (server-side only).
//
// Wraps Setu's documented DigiLocker flow:
//   POST {base}/api/digilocker                 → create request, returns { id, url, status, validUpto }
//   GET  {base}/api/digilocker/{id}/status     → { id, status, ... }
//   GET  {base}/api/digilocker/{id}/aadhaar    → { aadhaar: { name, maskedNumber, ... } }
// Auth headers: x-client-id, x-client-secret, x-product-instance-id.
//
// Security rules enforced here:
//   * credentials come from env vars only (never sent to the browser);
//   * the redirect query string is NEVER trusted — the caller must use
//     fetchVerifiedIdentity(), which asks Setu for status + data server-side;
//   * only minimal attributes are returned: name and masked last-4. Raw Aadhaar
//     number, DOB, address and photo are discarded and never leave this module.
//
// Endpoint paths/fields checked against https://docs.setu.co/data/digilocker/quickstart
// on 2026-10-15. Sandbox base URL: https://dg-sandbox.setu.co ; production: https://dg.setu.co.
// Still to be verified with a real sandbox run (not yet done).
// `fetch` is injectable so the adapter is testable without network access.

export type SetuConfig = {
  baseUrl: string
  clientId: string
  clientSecret: string
  productInstanceId: string
}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<any> }>

export function setuConfigFromEnv(env: Record<string, string | undefined> = process.env): SetuConfig | null {
  const baseUrl = env.SETU_DG_BASE_URL
  const clientId = env.SETU_CLIENT_ID
  const clientSecret = env.SETU_CLIENT_SECRET
  const productInstanceId = env.SETU_PRODUCT_INSTANCE_ID
  if (!baseUrl || !clientId || !clientSecret || !productInstanceId) return null
  return { baseUrl: baseUrl.replace(/\/+$/, ''), clientId, clientSecret, productInstanceId }
}

function headers(c: SetuConfig): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-client-id': c.clientId,
    'x-client-secret': c.clientSecret,
    'x-product-instance-id': c.productInstanceId,
  }
}

export type CreatedRequest = { requestId: string; url: string; validUpto: string | null }

export async function createDigilockerRequest(
  cfg: SetuConfig,
  redirectUrl: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<CreatedRequest> {
  const r = await fetchImpl(`${cfg.baseUrl}/api/digilocker`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ redirectUrl }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j?.id || !j?.url) throw new Error(`setu_create_failed:${r.status}`)
  return { requestId: String(j.id), url: String(j.url), validUpto: j.validUpto ?? null }
}

export type ProviderStatus = 'pending' | 'authenticated' | 'failed' | 'expired'

export function normalizeStatus(raw: unknown): ProviderStatus {
  const s = String(raw || '').toLowerCase()
  if (s === 'authenticated' || s === 'success' || s === 'completed') return 'authenticated'
  if (s === 'expired') return 'expired'
  // Setu docs: status ∈ unauthenticated | authenticated | revoked.
  // 'unauthenticated' = user has not completed consent yet → still pending.
  if (s === 'failed' || s === 'revoked' || s === 'denied') return 'failed'
  return 'pending'
}

export type VerifiedIdentity = { name: string; maskedNumber: string }

/** Last 4 digits only, formatted XXXX-XXXX-1234. Never returns more than 4 digits. */
export function maskNumber(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `XXXX-XXXX-${digits.slice(-4)}` : ''
}

/**
 * Server-side verification of a DigiLocker request. Returns the minimal
 * identity ONLY if Setu itself reports the request as authenticated and returns
 * Aadhaar data. Query-string flags from the redirect are irrelevant.
 */
export async function fetchVerifiedIdentity(
  cfg: SetuConfig,
  requestId: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<{ status: ProviderStatus; identity: VerifiedIdentity | null }> {
  const id = encodeURIComponent(requestId)
  const sr = await fetchImpl(`${cfg.baseUrl}/api/digilocker/${id}/status`, { headers: headers(cfg) })
  const sj = await sr.json().catch(() => ({}))
  if (!sr.ok) throw new Error(`setu_status_failed:${sr.status}`)
  const status = normalizeStatus(sj?.status)
  if (status !== 'authenticated') return { status, identity: null }

  const ar = await fetchImpl(`${cfg.baseUrl}/api/digilocker/${id}/aadhaar`, { headers: headers(cfg) })
  const aj = await ar.json().catch(() => ({}))
  if (!ar.ok) throw new Error(`setu_aadhaar_failed:${ar.status}`)
  const a = aj?.aadhaar ?? {}
  const name = String(a.name ?? '').trim()
  if (!name) return { status: 'failed', identity: null }
  // Close the user's DigiLocker access now that we have what we need
  // (Setu: GET /api/digilocker/:id/revoke). Best-effort; never blocks the result.
  try { await fetchImpl(`${cfg.baseUrl}/api/digilocker/${id}/revoke`, { headers: headers(cfg) }) } catch { /* ignore */ }
  // Only name + masked last-4 are kept; everything else in `a` is dropped here.
  return { status: 'authenticated', identity: { name, maskedNumber: maskNumber(a.maskedNumber ?? a.uid ?? a.number) } }
}
