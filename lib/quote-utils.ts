// ── Quote utility functions (not tied to any route file) ─────────

export async function sendQuoteWhatsApp(p: {
  phone: string; customerName: string; quoteNumber: string
  fromCity: string; toCity: string; totalAmount: number
}): Promise<boolean> {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) { console.warn('[quotes] WhatsApp env not set'); return false }

  const digits = p.phone.replace(/\D/g, '')
  const e164   = digits.startsWith('91') ? digits : '91' + digits
  const fmt    = (n: number) => '₹' + n.toLocaleString('en-IN')

  const text = `Hi ${p.customerName}! 🧳\n\nYour Bagdrop service quote is ready.\n\n` +
    `📋 Quote: *${p.quoteNumber}*\n` +
    `🗺️ Route: ${p.fromCity} → ${p.toCity}\n` +
    `💰 Total: *${fmt(p.totalAmount)}*\n\n` +
    `To confirm your booking, reply to this message or call us at +91 98765 43210.\n\n` +
    `_Bagdrop — Baggage Delivered. Journey Simplified._`

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: e164, type: 'text', text: { body: text } }),
    })
    return res.ok
  } catch {
    return false
  }
}
