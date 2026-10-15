// BAGDROP — server helpers for the identity gate / booking sessions.
// Server-only (uses the service-role client).

import { supabaseAdmin } from '@/lib/supabase'

export const CONSENT_TEXT_VERSION = '2026-10-15-v1'

/** Resolve the Supabase auth user from `Authorization: Bearer <token>` (the OTP-verified session). */
export async function getAuthUser(req: Request): Promise<{ id: string; contact: string } | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  const email = (data.user.email ?? '').toLowerCase()
  const m = email.match(/^phone_(\d+)@auth\.bagdrop\.in$/i)
  return { id: data.user.id, contact: m ? '+' + m[1] : email }
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  const { data } = await supabaseAdmin.from('settings').select('value').eq('key', key).maybeSingle()
  return (data?.value as string | undefined) ?? fallback
}

export async function identityGateEnabled(): Promise<boolean> {
  return (await getSetting('identity_gate_enabled', 'false')).toLowerCase() === 'true'
}

/** Origin used for the provider redirect. Only our own hosts (or localhost / Vercel previews) are allowed. */
export function safeOrigin(req: Request): string {
  const canonical = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.bagdrop.co'
  try {
    const o = new URL(req.headers.get('origin') ?? '')
    const host = o.hostname
    if (host === 'localhost' || host.endsWith('.vercel.app') || host === 'bagdrop.co' || host === 'www.bagdrop.co') {
      return o.origin
    }
  } catch { /* fall through */ }
  return canonical
}

/** Get (or create) the booking session for this OTP-verified user. */
export async function ensureSession(user: { id: string; contact: string }, bookingName: string, useCase?: string | null) {
  const { data: existing } = await supabaseAdmin
    .from('booking_sessions')
    .select('*')
    .eq('user_id', user.id)
    .is('consumed_booking_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) {
    await supabaseAdmin.from('booking_sessions')
      .update({ booking_name: bookingName, use_case: useCase ?? existing.use_case, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return { ...existing, booking_name: bookingName }
  }
  const { data, error } = await supabaseAdmin
    .from('booking_sessions')
    .insert({ user_id: user.id, verified_contact: user.contact, booking_name: bookingName, use_case: useCase ?? null })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}
