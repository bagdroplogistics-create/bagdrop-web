import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/email'
import { buildQuotePdfBuffer, quotePdfFilename, type LeadRowForPdf } from '@/lib/quote-pdf'
import { formatCustomerName } from '@/lib/constants'

export const runtime = 'nodejs'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// POST /api/admin/leads/[id]/send-return-quote-email
// Emails the RETURN journey quote (with its PDF attached) to the customer and
// marks the return quote as sent. Never touches the onward quote/booking.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data: lead, error } = await supabaseAdmin.from('leads').select('*').eq('id', id).single()
  if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!lead.return_quote_number) return NextResponse.json({ error: 'This lead has no return quote.' }, { status: 400 })
  if (!lead.email) return NextResponse.json({ error: 'Customer has no email address on this inquiry.' }, { status: 400 })

  let attachment: { filename: string; content: string } | undefined
  try {
    const buf = await buildQuotePdfBuffer(lead as LeadRowForPdf, 'return')
    attachment = { filename: quotePdfFilename(lead as LeadRowForPdf, 'return'), content: buf.toString('base64') }
  } catch (e) {
    console.error('[send-return-quote-email] PDF failed (sending without attachment):', e)
  }

  const name  = formatCustomerName(lead.title, lead.name) || lead.name || 'Customer'
  const from  = lead.return_from_city ?? lead.to_city ?? ''
  const to    = lead.return_to_city ?? lead.from_city ?? ''
  const total = '₹' + Math.round(Number(lead.return_quote_total ?? 0)).toLocaleString('en-IN')
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222;">` +
    `<h2 style="margin:0 0 8px;">Your Return Journey Quote from Bagdrop</h2>` +
    `<p>Hi ${esc(name)}, your return journey quote is ready${attachment ? ' (PDF attached)' : ''}.</p>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px;">` +
    `<tr><td style="padding:6px 0;color:#777;">Quote No</td><td><b>${esc(lead.return_quote_number)}</b></td></tr>` +
    `<tr><td style="padding:6px 0;color:#777;">Route</td><td>${esc(from)} → ${esc(to)}</td></tr>` +
    `<tr><td style="padding:6px 0;color:#777;">No. of Bags</td><td>${esc(lead.return_bags_count ?? lead.bags_count ?? 1)}</td></tr>` +
    `<tr><td style="padding:6px 0;color:#777;">Total (incl. GST)</td><td><b>${esc(total)}</b></td></tr>` +
    `</table>` +
    `<p style="margin-top:18px;">To confirm this return journey, reply to this email or WhatsApp us on +91 63571 15711.</p>` +
    `<p>— Team Bagdrop</p></div>`

  const r = await sendEmail(
    lead.email,
    `Return Quote ${lead.return_quote_number} — ${from} → ${to} | Bagdrop`,
    html,
    lead.return_quote_number,
    attachment ? [attachment] : undefined,
  )
  if (!r.success) return NextResponse.json({ error: r.error ?? 'Email failed to send' }, { status: 502 })

  await supabaseAdmin.from('leads').update({
    return_quote_status: lead.return_quote_status === 'accepted' ? 'accepted' : 'sent',
    return_quote_sent_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true, attachment: !!attachment })
}
