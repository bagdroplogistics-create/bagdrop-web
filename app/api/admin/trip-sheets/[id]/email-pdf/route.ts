// BAGDROP — app/api/admin/trip-sheets/[id]/email-pdf/route.ts
// Founder request, 2026-09-15: "Email to Admin" button on the Trip Sheet
// detail page. The PDF is generated client-side (browser, @react-pdf/
// renderer — same code the existing Download button uses on the Trip
// Sheets list page) and handed to this route as base64; this route only
// looks the trip sheet up for its display fields and relays the PDF to
// ADMIN_EMAILS as an attachment. Not for customers — internal use only.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { sendTripSheetPDFToAdmin } from '@/lib/email'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

// Resend's request size limit — mirrors the guard already used for
// indemnity-bond admin-notification attachments (see submit route there).
const ATTACHMENT_SIZE_LIMIT_BYTES = 35 * 1024 * 1024

export async function POST(req: NextRequest, { params }: Params) {
  if (!requireAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => null)
  const pdfBase64: string | undefined = body?.pdf_base64
  if (!pdfBase64) return NextResponse.json({ error: 'pdf_base64 is required' }, { status: 400 })

  const approxBytes = Math.ceil((pdfBase64.length * 3) / 4)
  if (approxBytes > ATTACHMENT_SIZE_LIMIT_BYTES) {
    return NextResponse.json({ error: 'PDF is too large to email (over 35MB).' }, { status: 413 })
  }

  const { data: sheet, error } = await supabaseAdmin
    .from('trip_sheets')
    .select('trip_number, customer_name, from_city, to_city, total_income, total_expense, net_profit')
    .eq('id', id)
    .maybeSingle()
  if (error || !sheet) return NextResponse.json({ error: 'Trip sheet not found' }, { status: 404 })

  const results = await sendTripSheetPDFToAdmin(
    {
      tripNumber:   sheet.trip_number,
      customerName: sheet.customer_name,
      fromCity:     sheet.from_city,
      toCity:       sheet.to_city,
      totalIncome:  Number(sheet.total_income)  || 0,
      totalExpense: Number(sheet.total_expense) || 0,
      netProfit:    Number(sheet.net_profit)    || 0,
    },
    { filename: `${sheet.trip_number}.pdf`, content: pdfBase64 },
  )

  const anySent = results.some(r => r.status === 'fulfilled')
  if (!anySent) return NextResponse.json({ error: 'Failed to send email to any admin address' }, { status: 500 })

  return NextResponse.json({ success: true })
}
