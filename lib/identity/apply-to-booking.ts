import { supabaseAdmin } from '@/lib/supabase'

// After Aadhaar verification the booking carries the Aadhaar-verified name
// (e.g. typed "Monali K Patel" → "Monaliben Keyur Patel"). The typed name is kept in the notes.
// All-capital Aadhaar names are shown in normal capitals. Idempotent.
export function tidyName(n: string): string {
  const t = n.trim()
  return t && t === t.toUpperCase() ? t.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : t
}

export async function applyVerifiedNameToBooking(verificationId: string): Promise<void> {
  const { data: ver } = await supabaseAdmin.from('identity_verifications')
    .select('verified_name').eq('id', verificationId).maybeSingle()
  const verified = tidyName(String(ver?.verified_name ?? ''))
  if (!verified) return
  const { data: b } = await supabaseAdmin.from('bookings')
    .select('id, customer_name, notes').eq('identity_verification_id', verificationId).maybeSingle()
  if (!b || b.customer_name === verified) return
  const note = `[Name on booking form: ${b.customer_name} — replaced by Aadhaar-verified name]`
  await supabaseAdmin.from('bookings').update({
    customer_name: verified,
    notes: [b.notes, note].filter(Boolean).join(' | '),
  }).eq('id', b.id)
}
