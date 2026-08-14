'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { formatCustomerName } from '@/lib/constants'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import type { InvoicePDFLineItem, InvoicePDFProps } from '../InvoicePDF'

interface Invoice {
  id: string; invoice_number: string; booking_id: string | null
  po_number?: string | null
  title?: string | null
  customer_name: string; customer_phone: string; customer_email: string | null; customer_address: string | null
  // Business Customer support — see supabase/migrations/20260807_
  // business_customer_fields.sql.
  customer_type?: string | null
  business_name?: string | null
  gst_number?: string | null
  service_type: string | null; from_city: string; to_city: string; total_bags: number
  base_amount: number; cgst: number; sgst: number; igst?: number; total_amount: number
  payment_status: string; payment_method: string | null; payment_reference: string | null
  notes: string | null; invoice_date: string; created_at: string
  due_date?: string | null; place_of_supply?: string | null; consignment_no?: string | null
  pickup_date?: string | null; delivery_date?: string | null
  line_items?: InvoicePDFLineItem[] | null
}

// Shared by both the on-screen live preview (PDFViewer below) and the
// Download PDF button — one place building the props means the preview and
// the downloaded/emailed file can never visually drift apart again (the
// old version of this page hand-coded a SEPARATE, non-Zoho-style HTML
// preview here, which is exactly what looked wrong/stale on screen even
// after the real PDF generation was fixed).
function buildPdfProps(invoice: Invoice): InvoicePDFProps {
  const lineItems: InvoicePDFLineItem[] = Array.isArray(invoice.line_items) ? invoice.line_items : []
  return {
    invoiceNumber: invoice.invoice_number,
    invoiceDate:   invoice.invoice_date,
    dueDate:       invoice.due_date ?? null,
    terms:         'Due on Receipt',
    poNumber:      invoice.po_number ?? null,
    placeOfSupply: invoice.place_of_supply ?? null,
    consignmentNo: invoice.consignment_no ?? null,
    totalBags:     invoice.total_bags ?? null,
    pickupDate:    invoice.pickup_date ?? null,
    deliveryDate:  invoice.delivery_date ?? null,
    billToName:    invoice.customer_type === 'business' && invoice.business_name
      ? invoice.business_name
      : (formatCustomerName(invoice.title, invoice.customer_name) || invoice.customer_name),
    billToAddress: invoice.customer_address ?? null,
    billToPhone:   invoice.customer_phone ?? null,
    billToEmail:   invoice.customer_email ?? null,
    billToGstin:   invoice.gst_number ?? null,
    shipToLabel:   'Ship To',
    shipToLines:   [invoice.to_city, 'India'].filter(Boolean) as string[],
    lineItems,
    subtotal:      Number(invoice.base_amount ?? 0),
    cgst:          Number(invoice.cgst ?? 0),
    sgst:          Number(invoice.sgst ?? 0),
    igst:          Number(invoice.igst ?? 0),
    total:         Number(invoice.total_amount ?? 0),
    paymentMade:   invoice.payment_status === 'paid' ? Number(invoice.total_amount ?? 0) : 0,
    balanceDue:    invoice.payment_status === 'paid' ? 0 : Number(invoice.total_amount ?? 0),
    notes:         invoice.notes ?? null,
    termsText:     null,
    paid:          invoice.payment_status === 'paid',
  }
}

// react-pdf pieces are dynamically imported (client-only — PDFViewer
// renders into an iframe and touches browser APIs that don't exist during
// SSR), same pattern already used for the Download PDF button and for
// QuotePDF's downloadPDF() elsewhere in the admin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfModules = { PDFViewer: any; InvoicePDF: any }

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [downloading, setDownloading] = useState(false)
  const [pdfMods, setPdfMods] = useState<PdfModules | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [assignErr, setAssignErr] = useState('')

  function loadInvoice(key: string) {
    return fetch(`/api/admin/invoices/${id}?key=${key}`)
      .then(r => r.json())
      .then(d => { setInvoice(d.invoice ?? null); setLoading(false) })
      .catch(() => { setError('Failed to load invoice'); setLoading(false) })
  }

  function getKey(): string | null {
    const urlKey = new URLSearchParams(window.location.search).get('key')
    return urlKey || sessionStorage.getItem('bagdrop_admin_key')
  }

  useEffect(() => {
    const key = getKey()
    if (!key) { setError('Unauthorized'); setLoading(false); return }
    loadInvoice(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // One-time upgrade path for invoices still carrying the very old local
  // placeholder number (BDI-{year}-{seq}, from before Bagdrop had any real
  // numbering source) — assigns a real number from the current local
  // "BLS26" sequence, without touching the already-billed amounts. Only
  // ever shown for legacy invoices (see the button's render condition
  // below) and guarded server-side against being run twice.
  async function assignInvoiceNumber() {
    const key = getKey()
    if (!key || assigning) return
    setAssigning(true); setAssignErr('')
    try {
      const r = await fetch(`/api/admin/invoices/${id}/assign-number?key=${key}`, {
        method: 'POST', headers: { 'x-admin-key': key },
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setAssignErr(d.error ?? 'Assigning invoice number failed'); return }
      setInvoice(d.invoice ?? invoice)
    } catch {
      setAssignErr('Network error — please try again')
    } finally {
      setAssigning(false)
    }
  }

  useEffect(() => {
    Promise.all([import('@react-pdf/renderer'), import('../InvoicePDF')]).then(
      ([{ PDFViewer }, invoicePdfModule]) => setPdfMods({ PDFViewer, InvoicePDF: invoicePdfModule.default })
    )
  }, [])

  async function downloadPDF() {
    if (!invoice || downloading) return
    setDownloading(true)
    try {
      const { pdf }                  = await import('@react-pdf/renderer')
      const { default: InvoicePDF }  = await import('../InvoicePDF')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(InvoicePDF(buildPdfProps(invoice)) as any).toBlob()

      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href     = url
      link.download = `${invoice.invoice_number}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Invoice PDF generation failed:', e)
      alert('PDF generation failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading invoice...</div>
  if (error || !invoice) return <div className="flex items-center justify-center min-h-screen text-red-400">{error || 'Invoice not found'}</div>

  const { PDFViewer, InvoicePDF } = pdfMods ?? {}
  const isLegacyPlaceholder = String(invoice.invoice_number ?? '').startsWith('BDI-')

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div>
          <p className="text-sm font-bold text-gray-700">{invoice.invoice_number} — Tax Invoice</p>
          {isLegacyPlaceholder && (
            <p className="text-xs text-amber-600">Legacy invoice — no real invoice number assigned yet.</p>
          )}
          {assignErr && <p className="text-xs font-semibold text-red-600">{assignErr}</p>}
        </div>
        <div className="flex gap-3">
          {isLegacyPlaceholder && (
            <button onClick={assignInvoiceNumber} disabled={assigning}
              title="Assigns the next real invoice number (from the current BLS26 series) to this record — the billed amount is never changed."
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60">
              {assigning ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Assigning…</> : <><RefreshCw className="h-3.5 w-3.5" /> Assign Invoice Number</>}
            </button>
          )}
          <button onClick={() => window.history.back()} className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">← Back</button>
          <button onClick={downloadPDF} disabled={downloading}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
            {downloading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Download className="h-3.5 w-3.5" /> Download PDF</>}
          </button>
        </div>
      </div>

      {/* Live preview of the ACTUAL generated PDF (react-pdf's PDFViewer
          renders it into an iframe) — this is exactly the same document
          the Download button saves and the same one attached to the
          invoice email, not a separate hand-styled approximation. */}
      <div className="flex-1">
        {PDFViewer && InvoicePDF ? (
          <PDFViewer style={{ width: '100%', height: '100%', border: 'none' }} showToolbar={false}>
            <InvoicePDF {...buildPdfProps(invoice)} />
          </PDFViewer>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Rendering invoice…
          </div>
        )}
      </div>
    </div>
  )
}
