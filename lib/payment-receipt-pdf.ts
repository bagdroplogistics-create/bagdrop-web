// BAGDROP — server-side Payment Receipt PDF generation.
//
// Mirrors lib/quote-pdf.ts's exact pattern: one plain function component
// (PaymentReceiptPDF.tsx, no browser-only APIs) reused for two different
// needs — real PDF bytes (base64, for the email attachment) and a public
// Storage URL (for the WhatsApp Document-header media_url). Built for the
// new Payment Acknowledgement + Receipt automation (2026-09-07) — fires
// once Accounts approves a payment's verification, see
// lib/payment-receipt-notification.ts for the orchestration and
// app/api/admin/payments/[id]/route.ts for the trigger point.

import { pdf } from '@react-pdf/renderer'
import React from 'react'
import PaymentReceiptPDF, { type PaymentReceiptPDFProps } from '@/app/(admin)/admin/payments/PaymentReceiptPDF'
import { supabaseAdmin } from '@/lib/supabase'

export async function buildPaymentReceiptPdfBuffer(props: PaymentReceiptPDFProps): Promise<Buffer> {
  const element = React.createElement(PaymentReceiptPDF, props)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(element as any).toBlob()
  const arr  = await blob.arrayBuffer()
  return Buffer.from(arr)
}

export function paymentReceiptPdfFilename(receiptNumber: string): string {
  return `Payment-Receipt-${receiptNumber.replace(/\//g, '-')}.pdf`
}

export interface PaymentReceiptPdfUrlResult {
  url: string
  filename: string
}

// Uploads an ALREADY-BUILT PDF buffer to the "payment-receipts" Supabase
// Storage bucket (must be created manually, Public — see
// supabase/migrations/20260907_payment_receipt_acknowledgement.sql),
// returning a public URL + filename. Split out from PDF generation
// (unlike lib/quote-pdf.ts's combined getQuotePdfUrl()) because
// lib/payment-receipt-notification.ts needs the SAME buffer for both the
// email attachment (base64) and this upload — building it twice would
// mean two full react-pdf renders for one send. `upsert: true` at a
// deterministic path (payments/{id}/{filename}) so retrying for the same
// payment simply replaces the same file rather than accumulating
// duplicates.
export async function uploadPaymentReceiptPdf(
  paymentDbId: string,
  filename: string,
  pdfBuffer: Buffer,
): Promise<PaymentReceiptPdfUrlResult> {
  const storagePath = `payments/${paymentDbId}/${filename}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('payment-receipts')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (uploadError) {
    throw new Error(`Payment Receipt PDF upload failed: ${uploadError.message}`)
  }

  const { data: urlData } = supabaseAdmin.storage.from('payment-receipts').getPublicUrl(storagePath)
  return { url: `${urlData.publicUrl}?t=${Date.now()}`, filename }
}
