import { NextResponse } from 'next/server'

const RESEND_API = 'https://api.resend.com/emails'
const FROM       = 'Bagdrop Website <info@bagdrop.co>'
const ADMIN      = 'info@bagdrop.co'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { name, email, phone, subject, message, _hp, _ts } = body

  // ── Bot protection ──────────────────────────────────────────────
  // 1. Honeypot: if the hidden field is filled, silently succeed (fool the bot)
  if (_hp) return NextResponse.json({ success: true })

  // 2. Time-on-page: bots submit in milliseconds; humans take at least 4s
  const elapsed = Date.now() - Number(_ts || 0)
  if (elapsed < 4000) return NextResponse.json({ success: true })

  // 3. Required fields
  if (!name || !email || !phone || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // 4. Phone must be numeric (bots send random alpha strings)
  const digitsOnly = phone.replace(/[\s\+\-\(\)]/g, '')
  if (!/^\d{7,15}$/.test(digitsOnly)) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  // 5. Message must contain at least one space (random char strings have none)
  if (!message.includes(' ') || message.trim().length < 10) {
    return NextResponse.json({ error: 'Message too short or invalid' }, { status: 400 })
  }

  // 6. Name must look human: letters/spaces only, max 60 chars
  if (!/^[\p{L}\s'\-\.]{2,60}$/u.test(name.trim())) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
  }
  // ────────────────────────────────────────────────────────────────

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[Contact] RESEND_API_KEY not set')
    return NextResponse.json({ success: true })
  }

  const html = [
    '<p><strong>Name:</strong> ' + name + '</p>',
    '<p><strong>Email:</strong> ' + email + '</p>',
    '<p><strong>Phone:</strong> ' + phone + '</p>',
    '<p><strong>Subject:</strong> ' + (subject || 'Not specified') + '</p>',
    '<p><strong>Message:</strong></p>',
    '<p>' + message.replace(/\n/g, '<br/>') + '</p>',
  ].join('')

  await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      from: FROM,
      to: [ADMIN],
      subject: 'Website Contact: ' + (subject || 'New Message') + ' — ' + name,
      html,
    }),
  })

  return NextResponse.json({ success: true })
}
