import { pdf } from '@react-pdf/renderer'
import { formatCustomerName } from '@/lib/constants'
// NOTE: lives under the (admin) route group, not this file's own folder —
// '@/app/...' resolves fine at import time (route-group parens only affect
// URL routing, not module resolution).
import InvoicePDF, { type InvoicePDFLineItem } from '@/app/(admin)/admin/invoices/[id]/InvoicePDF'

// Extracted from app/api/admin/invoices/route.ts's buildInvoicePdfBase64()
// so the exact same PDF-building logic can be reused by BOTH the email
// attachment path (that route, three call sites) AND
// app/api/admin/invoices/[id]/pdf/route.ts (a plain GET download endpoint
// added for the mobile app's "Download/share invoice PDF" requirement —
// mobile has no browser-only @react-pdf/renderer PDFViewer to open, so it
// needs real PDF bytes to save via expo-file-system, not an in-browser
// preview). One function, two callers — never two copies of this prop
// mapping to drift apart again.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateInvoicePdfBuffer(inv: any): Promise<Buffer | null> {
  try {
    const lineItems: InvoicePDFLineItem[] = Array.isArray(inv.line_items) ? inv.line_items : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = InvoicePDF({
      invoiceNumber: inv.invoice_number,
      invoiceDate:   inv.invoice_date,
      dueDate:       inv.due_date ?? null,
      terms:         'Due on Receipt',
      poNumber:      inv.po_number ?? null,
      placeOfSupply: inv.place_of_supply ?? null,
      consignmentNo: inv.consignment_no ?? null,
      totalBags:     inv.total_bags ?? null,
      pickupDate:    inv.pickup_date ?? null,
      deliveryDate:  inv.delivery_date ?? null,
      billToName:    inv.customer_type === 'business' && inv.business_name
        ? inv.business_name
        : (formatCustomerName(inv.title, inv.customer_name) || inv.customer_name),
      billToAddress: inv.customer_address ?? null,
      billToPhone:   inv.customer_phone ?? null,
      billToEmail:   inv.customer_email ?? null,
      billToGstin:   inv.gst_number ?? null,
      shipToLabel:   'Ship To',
      shipToLines:   [inv.to_city, 'India'].filter(Boolean),
      lineItems,
      subtotal:      Number(inv.base_amount ?? 0),
      cgst:          Number(inv.cgst ?? 0),
      sgst:          Number(inv.sgst ?? 0),
      igst:          Number(inv.igst ?? 0),
      total:         Number(inv.total_amount ?? 0),
      paymentMade:   inv.payment_status === 'paid' ? Number(inv.total_amount ?? 0) : 0,
      balanceDue:    inv.payment_status === 'paid' ? 0 : Number(inv.total_amount ?? 0),
      notes:         inv.notes ?? null,
      termsText:     inv.terms_conditions ?? null,
      paid:          inv.payment_status === 'paid',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const blob = await pdf(el).toBlob()
    const arr  = await blob.arrayBuffer()
    return Buffer.from(arr)
  } catch (err) {
    console.error('[invoice-pdf] PDF generation failed:', err)
    return null
  }
}
