import { NextRequest, NextResponse } from 'next/server'

// GET /api/admin/test-email?key=bagdrop@2026admin
// Tests Resend email delivery synchronously and returns the full API response.
// DELETE THIS FILE after diagnosis is complete.

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== 'bagdrop@2026admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    return NextResponse.json({
      status: 'FAIL',
      reason: 'RESEND_API_KEY environment variable is not set in this environment.',
      fix:    'Go to Vercel Dashboard → your project → Settings → Environment Variables → add RESEND_API_KEY',
    }, { status: 500 })
  }

  // Send a real test email to both admin addresses
  const ADMIN_EMAILS = ['info@bagdrop.co', 'aditya@bagdrop.co']
  const results: Record<string, unknown>[] = []

  for (const to of ADMIN_EMAILS) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        from:    'Bagdrop <info@bagdrop.co>',
        to:      [to],
        subject: '[Test] Bagdrop Email Delivery Check — ' + new Date().toISOString(),
        html:    '<p>This is a test email from the Bagdrop admin panel to confirm email delivery is working correctly.</p><p style="color:#FF6300;font-weight:bold;">If you received this, emails are working!</p>',
      }),
    })

    const body = await res.json().catch(() => ({}))
    results.push({ to, http_status: res.status, resend_response: body })
  }

  const allOk = results.every(r => (r.http_status as number) < 300)

  return NextResponse.json({
    status:         allOk ? 'OK — emails sent, check your inbox' : 'FAIL — see errors below',
    api_key_prefix: apiKey.slice(0, 12) + '...',
    results,
    common_fixes: allOk ? null : [
      '1. Domain not verified: Go to resend.com/domains and verify bagdrop.co — add the required DNS records',
      '2. Wrong API key: Check resend.com/api-keys — make sure RESEND_API_KEY in Vercel matches an active key',
      '3. Free plan restriction: Resend free tier only allows sending to your own account email unless domain is verified',
    ],
  })
}
