import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function syntheticEmail(e164Phone: string): string {
  return `phone_${e164Phone.replace('+', '')}@auth.bagdrop.in`
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const { type, contact, otp } = body ?? {}

  if (!type || !contact || !otp) {
    return NextResponse.json({ error: 'type, contact, and otp are required.' }, { status: 400 })
  }

  const authEmail = type === 'email'
    ? contact.trim().toLowerCase()
    : syntheticEmail(contact)

  const now = new Date().toISOString()

  // ── 1. Check OTP ──────────────────────────────────────────────
  const { data: record, error: fetchError } = await supabaseAdmin
    .from('auth_otps')
    .select('id, otp, used')
    .eq('contact', authEmail)
    .eq('used', false)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (fetchError || !record) {
    return NextResponse.json({ error: 'Invalid or expired code. Please request a new one.' }, { status: 400 })
  }

  if (record.otp !== otp) {
    return NextResponse.json({ error: 'Incorrect code. Please check and try again.' }, { status: 400 })
  }

  // ── 2. Mark OTP used ──────────────────────────────────────────
  await supabaseAdmin.from('auth_otps').update({ used: true }).eq('id', record.id)

  // ── 3. Create/retrieve Supabase auth user ─────────────────────
  //    generateLink creates the user if not exists AND confirms email.
  //    We capture the user.id so we can set a temp password next.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type:  'magiclink',
    email: authEmail,
    options: { shouldCreateUser: true },
  })

  if (linkError || !linkData?.user?.id) {
    console.error('[verify-otp] generateLink error:', linkError)
    return NextResponse.json({ error: 'Could not create account. Please try again.' }, { status: 500 })
  }

  // ── 4. Set a one-time temp password the client will sign in with ──
  //    Using signInWithPassword (not magic-link tokens) is the only
  //    path that reliably persists a Supabase session in localStorage.
  const tempPassword = crypto.randomUUID()

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    linkData.user.id,
    { password: tempPassword }
  )

  if (updateError) {
    console.error('[verify-otp] updateUserById error:', updateError)
    return NextResponse.json({ error: 'Could not finalise sign-in. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, authEmail, tempPassword })
}
