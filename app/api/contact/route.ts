import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const RESEND_API = 'https://api.resend.com/emails'
const FROM       = 'Bagdrop Website <info@bagdrop.co>'
const ADMIN      = 'info@bagdrop.co'

// ── Competitor / suspicious domain blocklist ──────────────────────
// Submissions from these domains are silently swallowed.
// They see "success" but we never receive the message.
const BLOCKED_DOMAINS = [
  'flymyluggage.com',
  'flymyluggage.in',
  'luggageforward.com',
  'sendmybag.com',
  'airportr.com',
]

// Keywords that flag a submission as competitor intelligence-gathering.
// We block silently AND log an alert so you know who's watching.
const COMPETITOR_KEYWORDS = [
  'flymyluggage', 'fly my luggage',
  'luggage forward', 'luggageforward',
  'send my bag', 'sendmybag',
  'airportr',
  'competitor', 'pricing research', 'market research',
]

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { name, email, phone, subject, message, _hp, _ts } = body

  // Capture submitter IP for pattern tracking
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown'

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

  // ── Competitor / domain block ────────────────────────────────────
  const emailDomain = (email as string).split('@')[1]?.toLowerCase() ?? ''
  if (BLOCKED_DOMAINS.some(d => emailDomain === d || emailDomain.endsWith('.' + d))) {
    console.warn(`[Contact] BLOCKED — competitor domain: ${email}`)
    return NextResponse.json({ success: true })   // silent block
  }

  const combined = `${name} ${email} ${message}`.toLowerCase()
  const matchedKeyword = COMPETITOR_KEYWORDS.find(kw => combined.includes(kw))
  if (matchedKeyword) {
    console.warn(`[Contact] COMPETITOR INTELLIGENCE ATTEMPT — keyword "${matchedKeyword}" | from: ${email} | msg: ${message.slice(0, 120)}`)
    // Still block silently — they get "success" but we never receive it
    return NextResponse.json({ success: true })
  }
  // ────────────────────────────────────────────────────────────────

  // ── Auto-create Lead ──────────────────────────────────────────────
  // The contact form used to only email info@ — it never wrote a row to
  // the leads table, so these inquiries never showed up in the Dashboard.
  // Every other inquiry source (booking forms, mobile app) already
  // auto-creates a lead (see app/api/bookings/route.ts); this brings the
  // contact form in line so it's visible in the same place.
  try {
    const cleanPhone = (phone as string).replace(/[\s\-\(\)]/g, '')
    const normalizedPhone = cleanPhone.startsWith('+') ? cleanPhone : '+91' + digitsOnly
    const cleanEmail = (email as string).trim().toLowerCase()

    const year = new Date().getFullYear()
    const { data: lastLead } = await supabaseAdmin
      .from('leads')
      .select('lead_number')
      .like('lead_number', `BDL-${year}-%`)
      .order('lead_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    let nextSeq = 1
    if (lastLead?.lead_number) {
      const parts = lastLead.lead_number.split('-')
      const last = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(last)) nextSeq = last + 1
    }
    const leadNumber = `BDL-${year}-${String(nextSeq).padStart(4, '0')}`

    const { error: leadInsertErr } = await supabaseAdmin.from('leads').insert({
      lead_number:      leadNumber,
      name:             (name as string).trim(),
      phone:            normalizedPhone,
      email:            cleanEmail || null,
      source:           'contact-form',
      status:           'new',
      service_interest: subject || 'General Inquiry',
      service_type:     subject || 'General Inquiry',
      notes:            `[Contact Form] ${message}`,
    })

    if (leadInsertErr) {
      console.error('[Contact] Lead insert error:', leadInsertErr.message)
    } else {
      console.log(`[Contact] Auto-created lead ${leadNumber} from contact form`)
    }
  } catch (leadErr) {
    // Non-fatal — the inquiry email still sends below even if this fails.
    console.error('[Contact] Lead auto-create failed (non-fatal):', leadErr)
  }
  // ── End Auto-create Lead ──────────────────────────────────────────

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
    '<hr/>',
    '<p style="color:#888;font-size:12px"><strong>IP Address:</strong> ' + ip + ' &nbsp;|&nbsp; <strong>Time:</strong> ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST</p>',
    '<p style="color:#888;font-size:12px">If this looks like a competitor inquiry, search this IP in your logs to find repeat submissions.</p>',
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
