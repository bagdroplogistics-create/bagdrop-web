import { NextResponse } from 'next/server'

const RESEND_API = 'https://api.resend.com/emails'
const FROM       = 'Bagdrop Website <info@bagdrop.co>'
const ADMIN      = 'info@bagdrop.co'

export async function POST(req: Request) {
  const { name, email, phone, subject, message } = await req.json()
  if (!name || !email || !phone || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

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
