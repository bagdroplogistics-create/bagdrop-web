'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Invoice {
  id: string; invoice_number: string; booking_id: string | null
  customer_name: string; customer_phone: string; customer_email: string | null; customer_address: string | null
  service_type: string | null; from_city: string; to_city: string; total_bags: number
  base_amount: number; cgst: number; sgst: number; total_amount: number
  payment_status: string; payment_method: string | null; payment_reference: string | null
  notes: string | null; invoice_date: string; created_at: string
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtRs(n: number) {
  return '₹ ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    const urlKey = new URLSearchParams(window.location.search).get('key')
    const key    = urlKey || sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { setError('Unauthorized'); setLoading(false); return }
    fetch(`/api/admin/invoices/${id}?key=${key}`)
      .then(r => r.json())
      .then(d => { setInvoice(d.invoice ?? null); setLoading(false) })
      .catch(() => { setError('Failed to load invoice'); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (invoice) setTimeout(() => window.print(), 600)
  }, [invoice])

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading invoice...</div>
  if (error || !invoice) return <div className="flex items-center justify-center min-h-screen text-red-400">{error || 'Invoice not found'}</div>

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 18mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; background: #fff; }
        .text-gray-400, .text-gray-500, .text-gray-600 { color: #545454 !important; }
      `}</style>

      <div className="no-print fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3 shadow-sm">
        <p className="text-sm font-bold text-gray-700">{invoice.invoice_number} — Invoice PDF</p>
        <div className="flex gap-3">
          <button onClick={() => window.history.back()} className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">← Back</button>
          <button onClick={() => window.print()} className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600">Print / PDF</button>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-[794px] bg-white p-12 shadow-lg print:mt-0 print:shadow-none">

        {/* Header */}
        <div className="flex items-start justify-between pb-6 mb-6 border-b-2 border-orange-500">
          <div>
            <p className="text-2xl font-black tracking-tight text-orange-500">BAGDROP</p>
            <p className="text-xs text-gray-400 mt-0.5">Baggage Delivered. Journey Simplified.</p>
            <p className="text-xs text-gray-400">bagdrop.co · info@bagdrop.co</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Tax Invoice</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5">{invoice.invoice_number}</p>
            <p className="text-xs text-gray-500 mt-1">Date: {fmtDate(invoice.invoice_date)}</p>
            {invoice.booking_id && <p className="text-xs text-gray-400 mt-0.5">Booking: {invoice.booking_id.slice(0,8).toUpperCase()}</p>}
          </div>
        </div>

        {/* Bill to / Service */}
        <div className="mb-8 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Bill To</p>
            <p className="text-base font-bold text-gray-900">{invoice.customer_name}</p>
            <p className="text-sm text-gray-600">{invoice.customer_phone}</p>
            {invoice.customer_email && <p className="text-sm text-gray-600">{invoice.customer_email}</p>}
            {invoice.customer_address && <p className="text-sm text-gray-500 mt-1">{invoice.customer_address}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Service Details</p>
            <p className="text-sm font-semibold text-gray-800">{invoice.service_type?.replace('airport-to-door','Airport → Doorstep').replace('door-to-airport','Doorstep → Airport').replace('intercity','Intercity') ?? 'Baggage Delivery'}</p>
            <p className="text-sm text-gray-600">{invoice.from_city} → {invoice.to_city}</p>
            <p className="text-sm text-gray-500 mt-1">{invoice.total_bags} bag{invoice.total_bags !== 1 ? 's' : ''}</p>
            {invoice.payment_method && <p className="text-sm text-gray-500">Payment: {invoice.payment_method.toUpperCase()}</p>}
            {invoice.payment_reference && <p className="text-xs text-gray-400">Ref: {invoice.payment_reference}</p>}
          </div>
        </div>

        {/* Line items */}
        <table className="w-full mb-8 text-sm">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="px-4 py-3 text-left font-semibold">Description</th>
              <th className="px-4 py-3 text-center font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Rate</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3 text-gray-800">
                Baggage Delivery Service
                <span className="text-gray-400 text-xs"> · {invoice.from_city} → {invoice.to_city}</span>
              </td>
              <td className="px-4 py-3 text-center text-gray-700">{invoice.total_bags}</td>
              <td className="px-4 py-3 text-right text-gray-700">{fmtRs(invoice.base_amount / invoice.total_bags)}</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtRs(invoice.base_amount)}</td>
            </tr>
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal (excl. GST)</span><span>{fmtRs(invoice.base_amount)}</span></div>
            <div className="flex justify-between text-gray-500"><span>CGST @ 2.5%</span><span>{fmtRs(invoice.cgst)}</span></div>
            <div className="flex justify-between text-gray-500"><span>SGST @ 2.5%</span><span>{fmtRs(invoice.sgst)}</span></div>
            <div className="flex justify-between border-t-2 border-gray-900 pt-3 text-base font-bold text-gray-900">
              <span>Total Amount</span>
              <span className="text-orange-500">{fmtRs(invoice.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold" style={{color: invoice.payment_status === 'paid' ? '#16a34a' : '#d97706'}}>
              <span>Payment Status</span>
              <span>{invoice.payment_status === 'paid' ? '✓ PAID' : 'PENDING'}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="rounded-xl bg-gray-50 px-5 py-4 mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Notes</p>
            <p className="text-sm text-gray-700">{invoice.notes}</p>
          </div>
        )}

        <div className="text-xs text-gray-400 border-t border-gray-100 pt-6 space-y-1">
          <p className="font-semibold text-gray-500">Terms & Conditions</p>
          <p>1. GST applicable at 5% (CGST 2.5% + SGST 2.5%) as per prevailing tax laws.</p>
          <p>2. This is a computer-generated invoice and does not require a physical signature.</p>
          <p>3. For disputes or queries, contact info@bagdrop.co within 7 days of invoice date.</p>
        </div>

        <div className="mt-8 text-center text-xs text-gray-300 border-t border-gray-100 pt-4">
          Bagdrop · India's Digital Baggage Infrastructure Platform · bagdrop.co
        </div>
      </div>
    </>
  )
}
