'use client'

// BAGDROP — Print single Inquiry / Booking record
//
// Renders a clean, A4-portrait print/PDF view of exactly ONE lead/inquiry
// row — the record the admin clicked the Print icon on in the Leads
// table's Actions column (see openLeadPrintView() in
// app/(admin)/admin/leads/page.tsx). Data arrives via sessionStorage, not
// a fresh server query — it's the exact same row object already rendered
// in that table, so the printout can never drift from what the admin was
// looking at and nothing new is ever created. Works identically for
// website-sourced and manually created inquiries: both are plain rows in
// the same `leads` table, and this page only ever reads, never writes.
//
// Follows the same print-page pattern already established by
// app/(admin)/admin/leads/print/page.tsx (list print) and
// app/(admin)/admin/quotes/[id]/print/page.tsx (single-document print):
// no-print toolbar, @media print / @page rules, auto-triggered
// window.print().

import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatCustomerName } from '@/lib/constants'
import { SOURCE_LABELS } from '@/lib/lead-source'

interface PrintLead {
  id: string
  title?: string | null
  name: string
  phone: string
  email: string | null
  source: string
  partner_name?: string | null
  service_interest: string | null
  service_type: string | null
  from_city: string | null
  to_city: string | null
  pickup_date: string | null
  delivery_date: string | null
  pickup_time: string | null
  pickup_address: string | null
  drop_address: string | null
  bags_count: number
  pnr: string | null
  flight_number: string | null
  flight_time: string | null
  status: string
  effective_status?: string
  is_confirmed?: boolean
  booking_id: string | null
  lead_number: string | null
  zoho_estimate_number: string | null
  quote_total?: number | null
  quote_discount_pct?: number | null
  quote_discount_amt?: number | null
  payment_status: string | null
  assigned_to: string | null
  notes: string | null
  created_at: string
  deleted_at?: string | null
}

interface PrintPayload {
  generatedAt: string
  lead: PrintLead
}

// Mirrors STATUS_CONFIG / BOOKING_STATUS_CONFIG in
// app/(admin)/admin/leads/page.tsx — kept as a small, local, print-only
// copy (display labels/colors only), same convention already used by
// app/(admin)/admin/leads/print/page.tsx. Must stay in sync with that
// file if statuses change.
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
  'airport-to-door': 'Airport → Doorstep Delivery',
  'door-to-airport': 'Doorstep → Airport Delivery',
  'intercity': 'Intercity Baggage Delivery',
}

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:            { label: 'Pending',             color: '#d97706' },
  partially_paid:     { label: 'Partially Paid',      color: '#0891b2' },
  paid:               { label: 'Paid',                color: '#16a34a' },
  approved_pending:   { label: 'Approved (No Payment)', color: '#d97706' },
  refunded:           { label: 'Refunded',             color: '#6b7280' },
  failed:             { label: 'Failed',               color: '#dc2626' },
}

function statusMeta(l: PrintLead) {
  const key = l.effective_status ?? l.status
  return BOOKING_STATUS_CONFIG[key] ?? STATUS_CONFIG[key] ?? { label: key, color: '#374151' }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
// For DATE-ONLY columns (pickup_date/delivery_date) as opposed to full
// timestamps (created_at) — same UTC-pin fix as the main Leads table
// (see formatDateOnly() in app/(admin)/admin/leads/page.tsx) so a date
// never silently rolls back a day for an admin viewing west of UTC.
function fmtDateOnly(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function fmtPrintDate(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}
function fmtRs(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

// A record with no name AND no phone has nothing meaningful to print —
// rather than generate a near-blank document, surface a clear error (per
// spec: "If a record has no printable information, show a clear error
// instead of generating a blank document").
function hasPrintableContent(l: PrintLead): boolean {
  return !!(l.name?.trim() || l.phone?.trim())
}

export default function LeadPrintPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [payload, setPayload] = useState<PrintPayload | null>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const raw = sessionStorage.getItem('bagdrop_lead_print_data')
    if (!raw) { setError('No print data found — please use the Print icon on the Leads page.'); return }
    try {
      const parsed = JSON.parse(raw) as PrintPayload
      if (!parsed?.lead || parsed.lead.id !== id) {
        setError('This print link has expired or belongs to a different record — please click Print again from the Leads page.')
        return
      }
      if (!hasPrintableContent(parsed.lead)) {
        setError('This record has no printable information yet (no name or contact number on file).')
        return
      }
      setPayload(parsed)
    } catch {
      setError('Could not read print data — please click Print again from the Leads page.')
    }
  }, [id])

  useEffect(() => {
    if (payload) setTimeout(() => window.print(), 500)
  }, [payload])

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#6b7280', fontFamily: 'sans-serif', textAlign: 'center', padding: '24px' }}>
        <p style={{ maxWidth: '420px' }}>{error}</p>
        <button onClick={() => router.push('/admin/leads')}
          style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#f97316', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          ← Back to Leads
        </button>
      </div>
    )
  }

  if (!payload) return null

  const l = payload.lead
  const generatedAt = new Date(payload.generatedAt)
  const sm = statusMeta(l)
  const pm = l.payment_status ? PAYMENT_STATUS_LABELS[l.payment_status] : null
  const serviceRaw = l.service_interest ?? l.service_type ?? ''
  const serviceLabel = SERVICE_TYPE_LABELS[serviceRaw] ?? serviceRaw ?? '—'
  const refNumber = l.lead_number ?? l.zoho_estimate_number ?? l.id.slice(0, 8).toUpperCase()

  const field = (label: string, value: ReactNode) => (
    <div>
      <div style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#111827', marginTop: '2px' }}>{value ?? '—'}</div>
    </div>
  )

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @media print {
          @page { size: A4; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
        }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f3f4f6; color: #111827; }
      `}</style>

      {/* Top toolbar — hidden on print */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <p style={{ fontSize: '14px', fontWeight: 700, color: '#374151' }}>{refNumber} — Inquiry Detail</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => window.close()} style={{ padding: '6px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', fontSize: '13px', color: '#6b7280', cursor: 'pointer' }}>← Close</button>
          <button onClick={() => window.print()} style={{ padding: '6px 16px', borderRadius: '8px', border: 'none', background: '#f97316', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Print / Save PDF</button>
        </div>
      </div>

      {/* A4 Page */}
      <div className="page" style={{ maxWidth: '794px', margin: '72px auto 40px', background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,.10)', borderRadius: '4px', overflow: 'hidden' }}>

        {/* Orange header band */}
        <div style={{ background: '#f97316', padding: '28px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>BAGDROP</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', marginTop: '3px', letterSpacing: '1px', textTransform: 'uppercase' }}>India&apos;s Digital Baggage Infrastructure</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', textTransform: 'uppercase' }}>Inquiry / Booking Detail</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff', marginTop: '2px' }}>{refNumber}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', marginTop: '4px' }}>
              <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '20px', padding: '2px 10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{sm.label}</span>
            </div>
          </div>
        </div>

        {/* Metadata strip */}
        <div style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa', padding: '12px 36px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          {[
            { label: 'Inquiry Date', value: fmtDate(l.created_at) },
            { label: 'Source', value: (SOURCE_LABELS[l.source] ?? l.source ?? '—') + (l.partner_name ? ` (${l.partner_name})` : '') },
            { label: 'Service Type', value: serviceLabel },
            { label: 'Bags', value: `${l.bags_count ?? '—'} pc${l.bags_count === 1 ? '' : 's'}` },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{f.label}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827', marginTop: '2px' }}>{f.value}</div>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ padding: '28px 36px' }}>

          {/* Customer + Journey — 2 col */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

            {/* Customer */}
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px 18px', borderLeft: '3px solid #f97316' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '8px' }}>Customer</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#111827' }}>{formatCustomerName(l.title, l.name) || l.name || '—'}</div>
              <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>{l.phone || '—'}</div>
              {l.email && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{l.email}</div>}
            </div>

            {/* Journey */}
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px 18px', borderLeft: '3px solid #111827' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '8px' }}>Route</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase' }}>From</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#111827' }}>{l.from_city || '—'}</div>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ flex: 1, height: '1px', background: '#d1d5db' }} />
                  <div style={{ fontSize: '16px' }}>→</div>
                  <div style={{ flex: 1, height: '1px', background: '#d1d5db' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase' }}>To</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#111827' }}>{l.to_city || '—'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Pickup / Delivery — 2 col */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px 18px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '10px' }}>Pickup</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {field('Date', fmtDateOnly(l.pickup_date))}
                {field('Time', l.pickup_time)}
              </div>
              <div style={{ marginTop: '10px' }}>{field('Location', l.pickup_address || l.from_city)}</div>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px 18px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '10px' }}>Delivery</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {field('Date', fmtDateOnly(l.delivery_date))}
                {field('Time', '—')}
              </div>
              <div style={{ marginTop: '10px' }}>{field('Location', l.drop_address || l.to_city)}</div>
            </div>
          </div>

          {/* Flight/PNR — only if present, airport-context info already on file */}
          {(l.flight_number || l.pnr || l.flight_time) && (
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px 18px', marginBottom: '20px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '10px' }}>Flight Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {field('Flight Number', l.flight_number)}
                {field('PNR', l.pnr)}
                {field('Flight Time', l.flight_time)}
              </div>
            </div>
          )}

          {/* Payment & Status — 2 col */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px 18px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '10px' }}>Payment</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {field('Quote Amount', l.quote_total != null ? fmtRs(Number(l.quote_total)) : null)}
                {field('Payment Status', pm ? <span style={{ color: pm.color }}>{pm.label}</span> : (l.payment_status || '—'))}
              </div>
              {((l.quote_discount_amt ?? 0) > 0 || l.quote_discount_pct) && (
                <div style={{ marginTop: '10px' }}>
                  {field('Discount Applied', l.quote_discount_pct ? `${l.quote_discount_pct}%` : `₹${Number(l.quote_discount_amt).toLocaleString('en-IN')}`)}
                </div>
              )}
            </div>
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px 18px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '10px' }}>Status</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {field('Booking Status', <span style={{ color: sm.color }}>{sm.label}</span>)}
                {field('Assigned To', l.assigned_to)}
              </div>
            </div>
          </div>

          {/* Remarks */}
          {l.notes && (
            <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', borderLeft: '3px solid #f97316' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '4px' }}>Remarks</div>
              <div style={{ fontSize: '12px', color: '#374151', whiteSpace: 'pre-wrap' }}>{l.notes}</div>
            </div>
          )}

          {/* Footer — company details */}
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
            <div style={{ fontSize: '10px', color: '#9ca3af', lineHeight: '1.6' }}>
              <div style={{ fontWeight: 700, color: '#374151', fontSize: '11px', marginBottom: '2px' }}>BAGDROP LOGISTICS SOLUTIONS PVT. LTD.</div>
              <div>TF-302, Ananta Stallion, Gotri Sevasi Road, Vadodara – 391101</div>
              <div>GSTIN: 24AAACC9320N2ZL · CIN: U63090GJ2023PTC142601</div>
              <div>📞 63 5711 5711 · ✉ info@bagdrop.co · 🌐 www.bagdrop.co</div>
              <div style={{ marginTop: '8px', fontSize: '9px', color: '#c1c5cc' }}>Confidential internal document — generated {fmtPrintDate(generatedAt)}.</div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
