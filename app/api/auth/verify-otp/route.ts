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
  const otpStr = String(otp).trim()

  // ── 1. Fetch latest unused, unexpired OTP for this contact ──
  //    Don't filter by OTP value in SQL — check in application code
  //    so we can give a clear "wrong code" vs "expired" message.
  const { data: rows, error: fetchError } = await supabaseAdmin
    .from('auth_otps')
    .select('id, otp, used')
    .eq('contact', authEmail)
    .eq('used', false)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)

  if (fetchError) {
    console.error('[verify-otp] DB fetch error:', fetchError)
    return NextResponse.json({ error: 'Database error. Please try again.' }, { status: 500 })
  }

  const record = rows?.[0]

  if (!record) {
    return NextResponse.json(
      { error: 'Code expired or not found. Tap "Resend" to get a new one.' },
      { status: 400 }
    )
  }

  if (String(record.otp).trim() !== otpStr) {
    return NextResponse.json(
      { error: 'Incorrect code. Please check and try again.' },
      { status: 400 }
    )
  }

  // ── 2. Mark OTP used ──────────────────────────────────────────
  await supabaseAdmin.from('auth_otps').update({ used: true }).eq('id', record.id)

  // ── 3. Create/retrieve Supabase auth user via generateLink ────
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type:  'magiclink',
    email: authEmail,
    options: { shouldCreateUser: true },
  })

  if (linkError || !linkData?.user?.id) {
    console.error('[verify-otp] generateLink error:', linkError)
    return NextResponse.json({ error: 'Could not create account. Please try again.' }, { status: 500 })
  }

  // ── 4. Set one-time temp password for client signInWithPassword ──
  const tempPassword = crypto.randomUUID()

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    linkData.user.id,
    {
      password:      tempPassword,
      email_confirm: true,   // required — allows signInWithPassword without email verification
    }
  )

  if (updateError) {
    console.error('[verify-otp] updateUserById error:', updateError)
    return NextResponse.json({ error: 'Could not finalise sign-in. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, authEmail, tempPassword })
}
