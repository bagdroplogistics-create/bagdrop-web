import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAdminRole } from '@/lib/admin-auth'
import { sendPaymentReceiptAcknowledgment } from '@/lib/payment-receipt-notification'

// BAGDROP — POST /api/admin/payments/[id]/send-receipt
//
// Admin-triggered "Retry" for the Payment Acknowledgement + Payment
// Receipt automation (spec requirement 6: "If payment is successfully
// approved but email/WhatsApp fails... allow the admin to retry the
// failed notification"). Calls the exact same
// sendPaymentReceiptAcknowledgment() the automatic trigger uses — it is
// naturally idempotent per channel (see that file's module comment), so
// re-running it here only ever attempts a channel that isn't already
// 'sent'. Never re-sends a channel that already succeeded, so this can't
// produce a duplicate email/WhatsApp to the customer.
//
// Requires the payment to actually be Accounts-approved (payment_status
// 'paid') — sendPaymentReceiptAcknowledgment() itself no-ops otherwise,
// so this can never be used to send a receipt for a payment that hasn't
// been verified.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getAdminRole(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .select('id, payment_status')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  if (payment.payment_status !== 'paid') {
    return NextResponse.json({ error: 'This payment has not been Accounts-approved yet — nothing to send.' }, { status: 400 })
  }

  await sendPaymentReceiptAcknowledgment(id)

  const { data: updated } = await supabaseAdmin
    .from('payments')
    .select('receipt_email_status, receipt_email_error, receipt_whatsapp_status, receipt_whatsapp_error, receipt_pdf_url')
    .eq('id', id)
    .maybeSingle()

  return NextResponse.json({ ok: true, receipt: updated })
}
