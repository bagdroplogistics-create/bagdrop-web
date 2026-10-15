import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { resolveEnabledUseCases } from '@/lib/use-cases'
import { identityGateLocalOverride } from '@/lib/booking-session'

// Public, read-only switches for the /book form. Everything defaults to OFF/safe.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .or('key.in.(identity_gate_enabled,use_case_picker_enabled),key.like.use_case_enabled:%')
    const map: Record<string, string> = {}
    for (const r of data ?? []) map[r.key] = String(r.value)

    const overrides: Record<string, string> = {}
    for (const [k, v] of Object.entries(map)) {
      if (k.startsWith('use_case_enabled:')) overrides[k] = v
    }
    const gate = identityGateLocalOverride() || (map['identity_gate_enabled'] ?? 'false').toLowerCase() === 'true'
    const picker = (map['use_case_picker_enabled'] ?? 'false').toLowerCase() === 'true'
    return NextResponse.json({
      identityGate: gate,
      useCasePicker: picker,
      useCases: picker ? resolveEnabledUseCases(overrides).map(u => ({ id: u.id, label: u.label, tagline: u.tagline })) : [],
    })
  } catch {
    return NextResponse.json({ identityGate: false, useCasePicker: false, useCases: [] })
  }
}
