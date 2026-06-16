// BAGDROP — /app/api/orders/route.ts
// Creates a Razorpay order via direct REST (no SDK).
// In development without API keys, returns a mock order for end-to-end testing.

import { NextResponse } from 'next/server'
import { generateOrderId } from '@/lib/utils'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      amount:    number   // ₹ (float) — converted to paise below
      currency?: string
      notes?:    Record<string, string>
    }

    if (!body.amount || body.amount < 1) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const keyId     = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    const receipt   = generateOrderId()

    // ── DEV MODE: return mock order when keys are not configured ──────────
    if (!keyId || !keySecret) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[Razorpay] Keys not set — returning mock order for dev. ' +
          'Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.local for live payments.'
        )
        return NextResponse.json({
          id:       `order_dev_${Date.now()}`,
          amount:   Math.round(body.amount * 100),
          currency: body.currency ?? 'INR',
          receipt,
        })
      }
      console.error('[Razorpay] Missing API keys — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local')
      return NextResponse.json(
        { error: 'Payment gateway not configured' },
        { status: 503 }
      )
    }

    // ── Razorpay Orders API (Basic auth, no SDK) ──────────────────────────
    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64')

    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        amount:   Math.round(body.amount * 100),   // ₹ → paise
        currency: body.currency ?? 'INR',
        receipt,
        notes:    body.notes ?? {},
      }),
    })

    if (!rzpRes.ok) {
      const err = await rzpRes.json().catch(() => ({}))
      console.error('[Razorpay] API error:', err)
      return NextResponse.json(
        { error: (err as any)?.error?.description ?? 'Order creation failed' },
        { status: rzpRes.status }
      )
    }

    const order = await rzpRes.json()

    return NextResponse.json({
      id:       order.id,
      amount:   order.amount,
      currency: order.currency,
      receipt:  order.receipt,
    })
  } catch (err: unknown) {
    console.error('[Razorpay] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Order creation failed' },
      { status: 500 }
    )
  }
}
