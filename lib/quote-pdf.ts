// BAGDROP — server-side Quote PDF generation.
//
// Single source of truth for turning a `leads` row into the same Quote PDF
// the admin already gets from the "Download PDF" button on the Booking
// Workflow page (app/(admin)/admin/quotes/view/[lead_id]/page.tsx's
// downloadPDF()). That function renders entirely in the browser via
// @react-pdf/renderer's pdf().toBlob() — fine for a manual download, but
// useless for anything the SERVER needs to do with the PDF bytes (email it
// as a real attachment, or upload it so a WhatsApp message can link to it).
// This reuses the exact same QuotePDF.tsx component (a plain function
// component with no browser-only APIs, so it runs fine under Node) with the
// exact same field mapping downloadPDF() uses, so the emailed/shared PDF
// can never drift from what "Download PDF" produces.
//
// 2026-08-24 — built for: "when we click send quote on whatsapp or email...
// quote pdf will also send with message template."

import { pdf } from '@react-pdf/renderer'
import React from 'react'
import QuotePDF from '@/app/(admin)/admin/quotes/view/[lead_id]/QuotePDF'
import { formatCustomerName } from '@/lib/constants'
import { supabaseAdmin } from '@/lib/supabase'

// Loose shape — deliberately not the full `Lead` interface from the quotes
// view page (that's a client-only file's local type). Every field here is
// read the same way downloadPDF() reads it, just off a plain Supabase row.
export interface LeadRowForPdf {
  id: string
  lead_number: string
  title?: string | null
  name: string
  phone: string
  email: string | null
  from_city: string | null
  to_city: string | null
  bags_count: number | null
  pickup_date: string | null
  pickup_time: string | null
  delivery_date: string | null
  flight_number: string | null
  pnr: string | null
  pickup_address: string | null
  drop_address: string | null
  customer_type?: string | null
  business_name?: string | null
  quote_number: string | null
  zoho_estimate_number?: string | null
  quote_date: string | null
  quote_expiry_date: string | null
  salesperson_name: string | null
  agent_name: string | null
  quote_subject: string | null
  quote_line_items: { name: string; description: string; quantity: number; rate: number; tax_pct: number; amount: number }[] | null
  quote_subtotal: number | null
  quote_discount_amt: number | null
  quote_discount_pct: number | null
  quote_tax: number | null
  quote_total: number | null
  quote_notes: string | null
  quote_terms: string | null
  return_quote_number?: string | null
  return_from_city?: string | null
  return_to_city?: string | null
  return_bags_count?: number | null
  return_pickup_date?: string | null
  return_quote_line_items?: { name: string; description: string; quantity: number; rate: number; tax_pct: number; amount: number }[] | null
  return_quote_subtotal?: number | null
  return_quote_tax?: number | null
  return_quote_total?: number | null
}

export function quotePdfFilename(lead: Pick<LeadRowForPdf, 'quote_number' | 'zoho_estimate_number' | 'lead_number'>): string {
  const qn = lead.quote_number ?? lead.zoho_estimate_number ?? lead.lead_number
  return `${qn.replace(/\//g, '-')}.pdf`
}

export async function buildQuotePdfBuffer(lead: LeadRowForPdf): Promise<Buffer> {
  const lineItems  = lead.quote_line_items ?? []
  const subtotal   = lead.quote_subtotal   ?? lineItems.reduce((s, i) => s + i.amount, 0)
  const taxTotal   = lead.quote_tax        ?? Math.round(subtotal * 5) / 100
  const grandTotal = lead.quote_total      ?? (subtotal + taxTotal)
  const qn         = lead.quote_number ?? lead.zoho_estimate_number ?? lead.lead_number

  const element = React.createElement(QuotePDF, {
    quoteNumber:   qn,
    quoteDate:     lead.quote_date,
    expiryDate:    lead.quote_expiry_date,
    leadNumber:    lead.lead_number,
    salesperson:   lead.salesperson_name,
    agentName:     lead.agent_name,
    subject:       lead.quote_subject,
    customerName:  formatCustomerName(lead.title ?? null, lead.name) || lead.name,
    customerPhone: lead.phone,
    customerEmail: lead.email,
    businessName:  lead.customer_type === 'business' ? (lead.business_name ?? null) : null,
    fromCity:      lead.from_city,
    toCity:        lead.to_city,
    bagsCount:     lead.bags_count,
    pickupDate:    lead.pickup_date,
    pickupTime:    lead.pickup_time,
    deliveryDate:  lead.delivery_date,
    flightNumber:  lead.flight_number,
    pnr:           lead.pnr,
    pickupAddress: lead.pickup_address,
    dropAddress:   lead.drop_address,
    lineItems,
    subtotal,
    discountAmt: lead.quote_discount_amt ?? undefined,
    discountPct: lead.quote_discount_pct ?? undefined,
    tax:    taxTotal,
    total:  grandTotal,
    notes:  lead.quote_notes,
    terms:  lead.quote_terms,
    ...(lead.return_quote_number ? {
      returnFromCity:   lead.return_from_city,
      returnToCity:     lead.return_to_city,
      returnBagsCount:  lead.return_bags_count,
      returnPickupDate: lead.return_pickup_date,
      returnLineItems:  lead.return_quote_line_items ?? [],
      returnSubtotal:   lead.return_quote_subtotal ?? 0,
      returnTax:        lead.return_quote_tax ?? 0,
      returnTotal:      lead.return_quote_total ?? 0,
    } : {}),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob  = await pdf(element as any).toBlob()
  const arr   = await blob.arrayBuffer()
  return Buffer.from(arr)
}

export interface QuotePdfUrlResult {
  url: string
  filename: string
}

// Generates the CURRENT Quote PDF for this lead and uploads it to Supabase
// Storage, returning a public URL + filename. `upsert: true` always
// overwrites the same deterministic path (leads/{id}/{filename}) rather
// than versioning it, so the URL this returns can never point at a stale
// or previous quote — every call regenerates the PDF fresh off the lead's
// current row (buildQuotePdfBuffer above never caches), and re-running this
// after a quote edit simply replaces the same file in place. The returned
// URL also has a cache-busting query param appended so a CDN-cached
// response for that storage path can't serve an older version to whatever
// fetches it right after a regenerate (e.g. Fast2SMS fetching media_url).
//
// Single source of truth for every caller that needs a downloadable/
// attachable PDF LINK rather than raw bytes (the browser "Download PDF"
// button generates bytes client-side instead; the email attachment path
// uses buildQuotePdfBuffer directly for the same reason — it needs base64
// content, not a URL). Callers: app/api/admin/leads/[id]/quote-pdf/route.ts
// (manual "Send Quote via WhatsApp" button's text-link fallback — web.
// whatsapp.com can't attach real files) and lib/lifecycle-notifications.ts's
// automated Fast2SMS 'quote_sent' send (2026-08-25 — a real Document-header
// PDF attachment, since that template has one configured).
export async function getQuotePdfUrl(lead: LeadRowForPdf): Promise<QuotePdfUrlResult> {
  const pdfBuffer    = await buildQuotePdfBuffer(lead)
  const filename     = quotePdfFilename(lead)
  const storagePath  = `leads/${lead.id}/${filename}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('quotes')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (uploadError) {
    throw new Error(`Quote PDF upload failed: ${uploadError.message}`)
  }

  const { data: urlData } = supabaseAdmin.storage.from('quotes').getPublicUrl(storagePath)
  return { url: `${urlData.publicUrl}?t=${Date.now()}`, filename }
}
