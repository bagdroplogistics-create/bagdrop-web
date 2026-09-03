'use client'

// BAGDROP — Print Leads List
//
// Renders a clean, A4-landscape print/PDF view of exactly the rows the
// admin had on screen in /admin/leads when they clicked "Print" — passed
// via sessionStorage (see openPrintView() in app/(admin)/admin/leads/page.tsx),
// not a fresh server query, so it always matches the currently applied
// filters/search/sort and never drifts from — or duplicates — the real
// Leads table data. Purely a presentation/export layer: no writes, no new
// list, no change to lead/quote/booking workflow or status logic.
//
// Follows the same print-page pattern already established by
// app/(admin)/admin/quotes/[id]/print/page.tsx (no-print toolbar,
// @media print / @page rules, auto-triggered window.print()).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCustomerName } from '@/lib/constants'
import { SOURCE_LABELS } from '@/lib/lead-source'

interface PrintLead {
  id: string
  title?: string | null
  name: string
  phone: string
  source: string
  partner_name?: string | null
  service_interest: string | null
  service_type: string | null
  from_city: string | null
  to_city: string | null
  pickup_date: string | null
  bags_count: number
  status: string
  effective_status?: string
  booking_id: string | null
  lead_number: string | null
  zoho_estimate_number: string | null
  created_at: string
}

interface PrintPayload {
  generatedAt: string
  filterSummary: string
  rows: PrintLead[]
}

// Mirrors STATUS_CONFIG / BOOKING_STATUS_CONFIG in
// app/(admin)/admin/leads/page.tsx — kept as a small, local, print-only
// copy (display labels/colors only) rather than importing from a page
// module. Must stay in sync with that file if statuses change.
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:       { label: 'New',       color: '#2563eb' },
  contacted: { label: 'Contacted', color: '#d97706' },
  qualified: { label: 'Qualified', color: '#7c3aed' },
  converted: { label: 'Converted', color: '#16a34a' },
  lost:      { label: 'Lost',      color: '#dc2626' },
  confirmed: { label: 'Confirmed', color: '#0e7490' },
  cancelled: { label: 'Cancelled', color: '#dc2626' },
}

const BOOKING_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  inquiry:               { label: 'New Inquiry',           color: '#92400e' },
  quote_created:         { label: 'Quote Created',         color: '#4f46e5' },
  quote_sent:            { label: 'Quote Sent',            color: '#6d28d9' },
  accepted:              { label: 'Quote Accepted',        color: '#0891b2' },
  rejected:              { label: 'Quote Rejected',        color: '#dc2626' },
  closed:                { label: 'Inquiry Closed',        color: '#6b7280' },
  payment_pending:       { label: 'Payment Requested',     color: '#d97706' },
  payment_received:      { label: 'Payment Received',      color: '#059669' },
  payment_approved:      { label: 'Admin Approved (VIP)',  color: '#d97706' },
  confirmed:             { label: 'Booking Confirmed',     color: '#2563eb' },
  invoice_generated:     { label: 'Invoice Generated',     color: '#7c3aed' },
  invoice_sent:          { label: 'Invoice Sent',          color: '#6d28d9' },
  pickup_scheduled:      { label: 'Pickup Scheduled',      color: '#7c3aed' },
  picked_up:             { label: 'Bags Picked Up',        color: '#7c3aed' },
  in_transit:            { label: 'In Transit',            color: '#0891b2' },
  out_for_delivery:      { label: 'Out for Delivery',      color: '#ea580c' },
  driver_details_shared: { label: 'Driver Details Shared', color: '#0369a1' },
  indemnity_bond_sent:   { label: 'Indemnity Bond Sent',   color: '#b45309' },
  indemnity_bond_signed: { label: 'Indemnity Bond Signed', color: '#65a30d' },
  delivered:             { label: 'Delivered',             color: '#16a34a' },
  trip_created:          { label: 'Trip Sheet Created',    color: '#0891b2' },
  completed:             { label: 'Completed',             color: '#14532d' },
  cancelled:             { label: 'Cancelled',             color: '#dc2626' },
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  'airport-to-doorstep': 'Airport → Doorstep',
  'doorstep-to-airport': 'Doorstep → Airport',
  'doorstep-to-doorstep': 'Doorstep → Doorstep',
  'airport-to-airport': 'Airport → Airport',
}

function statusMeta(l: PrintLead) {
  const key = l.effective_status ?? l.status
  return BOOKING_STATUS_CONFIG[key] ?? STATUS_CONFIG[key] ?? { label: key, color: '#374151' }
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateOnly(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
function fmtPrintDate(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export default function LeadsPrintPage() {
  const router = useRouter()
  const [payload, setPayload] = useState<PrintPayload | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('bagdrop_leads_print_data')
    if (!raw) { setNotFound(true); return }
    try {
      setPayload(JSON.parse(raw))
    } catch {
      setNotFound(true)
    }
  }, [])

  useEffect(() => {
    if (payload) setTimeout(() => window.print(), 500)
  }, [payload])

  if (notFound) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#6b7280', fontFamily: 'sans-serif' }}>
        <p>No print data found — please use the <strong>Print</strong> button on the Leads page.</p>
        <button onClick={() => router.push('/admin/leads')}
          style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#f97316', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          ← Back to Leads
        </button>
      </div>
    )
  }

  if (!payload) return null

  const generatedAt = new Date(payload.generatedAt)
  const rows = payload.rows

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; background: #f3f4f6; margin: 0; }

        .toolbar {
          position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e5e7eb;
          padding: 12px 24px; display: flex; align-items: center; justify-content: space-between;
          box-shadow: 0 1px 4px rgba(0,0,0,.06);
        }
        .toolbar p { font-size: 14px; font-weight: 700; color: #374151; margin: 0; }
        .toolbar-btns { display: flex; gap: 10px; }
        .toolbar-btns button {
          padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer;
        }
        .btn-back { border: 1px solid #e5e7eb; background: #fff; color: #6b7280; }
        .btn-print { border: none; background: #f97316; color: #fff; font-weight: 700; }

        .sheet { background: #fff; margin: 20px auto; max-width: 1200px; box-shadow: 0 4px 24px rgba(0,0,0,.10); border-radius: 4px; }

        .doc-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          padding: 18px 24px 12px; border-bottom: 2px solid #111827;
        }
        .doc-header .brand { font-size: 22px; font-weight: 900; color: #f97316; letter-spacing: -0.5px; line-height: 1; }
        .doc-header .subtitle { font-size: 13px; font-weight: 700; color: #111827; margin-top: 3px; }
        .doc-header .meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.5; }
        .filter-line { padding: 6px 24px; font-size: 10.5px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #f3f4f6; }
        .count-line { padding: 6px 24px 0; font-size: 10.5px; color: #6b7280; }

        table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 6px; }
        thead { display: table-header-group; }
        th {
          text-align: left; padding: 6px 8px; background: #111827; color: #fff;
          font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
          white-space: nowrap;
        }
        td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; color: #111827; }
        tbody tr:nth-child(even) { background: #fafafa; }
        tbody tr { break-inside: avoid; page-break-inside: avoid; }
        .muted { color: #6b7280; }
        .name-cell { font-weight: 700; }
        .status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; }
        .doc-footer { padding: 10px 24px 18px; font-size: 9px; color: #9ca3af; border-top: 1px solid #f3f4f6; margin-top: 8px; }

        @media print {
          @page { size: A4 landscape; margin: 12mm 10mm 14mm; }
          @page { @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8.5px; color: #6b7280; } }
          body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; max-width: none; }
        }
      `}</style>

      {/* Toolbar — screen only */}
      <div className="toolbar no-print">
        <p>BAGDROP — Leads / Quote List ({rows.length} record{rows.length !== 1 ? 's' : ''})</p>
        <div className="toolbar-btns">
          <button className="btn-back" onClick={() => window.close()}>← Close</button>
          <button className="btn-print" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>

      <div className="sheet">
        {/* Header — required on every page. thead below repeats the column
            headers on each printed page natively; this masthead block
            itself renders once at the top of the document, which is the
            standard, cross-browser-reliable behavior for a print stylesheet
            without a PDF-generation engine. Enabling "Headers and footers"
            in the browser's print dialog will additionally add native page
            numbers if the @page counter rule above isn't supported. */}
        <div className="doc-header">
          <div>
            <div className="brand">BAGDROP</div>
            <div className="subtitle">Leads / Quote List</div>
          </div>
          <div className="meta">
            <div>Print Date: {fmtPrintDate(generatedAt)}</div>
            <div>{rows.length} record{rows.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        {payload.filterSummary && (
          <div className="filter-line">Filters applied: {payload.filterSummary}</div>
        )}

        <div style={{ padding: '0 16px' }}>
          <table>
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Customer Name</th>
                <th>Contact Number</th>
                <th>Service Type</th>
                <th>Route</th>
                <th>Pickup Date</th>
                <th>Bags</th>
                <th>Source</th>
                <th>Current Status</th>
                <th>Booking / Estimate</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(l => {
                const sm = statusMeta(l)
                const serviceRaw = l.service_interest ?? l.service_type ?? ''
                const serviceLabel = SERVICE_TYPE_LABELS[serviceRaw] ?? serviceRaw ?? '—'
                return (
                  <tr key={l.id}>
                    <td className="muted" style={{ fontWeight: 700 }}>{l.lead_number ?? '—'}</td>
                    <td className="name-cell">{formatCustomerName(l.title, l.name) || l.name}</td>
                    <td>{l.phone || '—'}</td>
                    <td>{serviceLabel}</td>
                    <td>{l.from_city && l.to_city ? `${l.from_city} → ${l.to_city}` : '—'}</td>
                    <td>{fmtDateOnly(l.pickup_date)}</td>
                    <td style={{ textAlign: 'center' }}>{l.bags_count ?? '—'}</td>
                    <td>
                      {SOURCE_LABELS[l.source] ?? l.source ?? '—'}
                      {l.partner_name ? ` (${l.partner_name})` : ''}
                    </td>
                    <td>
                      <span className="status-dot" style={{ background: sm.color }} />
                      <span style={{ color: sm.color, fontWeight: 700 }}>{sm.label}</span>
                    </td>
                    <td>
                      {l.zoho_estimate_number ?? (l.booking_id ? 'Booking linked' : '—')}
                    </td>
                    <td className="muted">{fmtDate(l.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="doc-footer">
          BAGDROP LOGISTICS SOLUTIONS PVT. LTD. — www.bagdrop.co — Confidential internal document, generated {fmtPrintDate(generatedAt)}.
        </div>
      </div>
    </>
  )
}
