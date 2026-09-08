'use client'

// BAGDROP — Operational Baggage Tag System (Phase 1) — Individual bookings.
// Mirrors app/(admin)/admin/group-bookings/[id]/tags/page.tsx's design and
// actions (Print All / Print Selected / Reprint / Download PDF), driven by
// the generic app/api/admin/bookings/[id]/bag-tags API so both booking
// types share one backend.

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BagTagPrintCard, BAG_TAG_CARD_STYLES, type BagTagCardData } from '@/components/admin/BagTagPrintCard'
import { ConsignmentLabelCard, CONSIGNMENT_LABEL_CARD_STYLES, type ConsignmentLabelCardData } from '@/components/admin/ConsignmentLabelPrintCard'
import { formatCustomerName } from '@/lib/constants'

interface Booking {
  id: string; tracking_id: string; title: string | null; customer_name: string | null
  customer_phone: string | null; pickup_address: string | null; total_bags: number | null
  from_city: string | null; to_city: string | null; service_label: string | null; service_type: string | null
  pickup_date: string | null; drop_address: string | null; status: string
}
interface Bag {
  id: string; bag_label: string | null; delivery_location: string | null; tag_printed_at: string | null
}

export default function IndividualBagTagsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [booking, setBooking]   = useState<Booking | null>(null)
  const [bags, setBags]         = useState<Bag[]>([])
  const [canGenerate, setCanGenerate] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // "Bag Tags" (barcode/QR operational tag) vs "Consignment Labels"
  // (Consignor/Consignee sender-receiver document) — kept as separate
  // on-screen views rather than showing both grids at once, so each
  // view's own Print All/Print Selected only ever prints that document,
  // never a mix of both (founder request 2026-09-08: "need consignment
  // label show option also in this screen").
  const [view, setView] = useState<'tags' | 'labels'>('tags')

  const load = useCallback(async (key: string) => {
    setError('')
    const res = await fetch(`/api/admin/bookings/${id}/bag-tags?key=${key}`, { headers: { 'x-admin-key': key } })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j.error ?? 'Failed to load'); setLoading(false); return }
    setBooking(j.booking); setBags(j.bags ?? []); setCanGenerate(!!j.can_generate)
    setSelected(new Set((j.bags ?? []).map((b: Bag) => b.id)))
    setLoading(false)
  }, [id])

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    load(key)
  }, [load, router])

  async function generateTags() {
    setGenerating(true); setError('')
    const res = await fetch(`/api/admin/bookings/${id}/bag-tags?key=${adminKey}`, { method: 'POST', headers: { 'x-admin-key': adminKey } })
    const j = await res.json().catch(() => ({}))
    setGenerating(false)
    if (!res.ok) { setError(j.error ?? 'Failed to generate tags'); return }
    load(adminKey)
  }

  async function markPrinted(ids: string[]) {
    if (ids.length === 0) return
    await fetch(`/api/admin/bookings/${id}/bag-tags?key=${adminKey}`, {
      method: 'PATCH', headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bag_ids: ids }),
    })
  }

  async function handlePrint(ids: string[]) {
    await markPrinted(ids)
    setTimeout(() => window.print(), 200)
  }

  function handleDownloadPdf(ids: string[]) {
    const qs = ids.length < bags.length ? `&bag_ids=${ids.join(',')}` : ''
    window.open(`/api/admin/bookings/${id}/bag-tags/pdf?key=${adminKey}${qs}`, '_blank')
    markPrinted(ids)
  }

  // Consignor/Consignee Consignment Label — a separate document from the
  // barcode/QR Bag Tag above (lib/consignment-label-pdf.tsx), so it's
  // available regardless of whether tags have been generated yet: it
  // reads booking.total_bags as its fallback bag count.
  function handleDownloadConsignmentLabel() {
    window.open(`/api/admin/bookings/${id}/consignment-label?key=${adminKey}`, '_blank')
  }

  // No print-status tracking for this document (unlike Bag Tags' tag_
  // printed_at/status bump) — it's a plain browser print of whatever's on
  // screen in the Consignment Labels view.
  function handlePrintLabels() {
    setTimeout(() => window.print(), 200)
  }

  function toggle(bagId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(bagId)) next.delete(bagId); else next.add(bagId)
      return next
    })
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontFamily: 'sans-serif' }}>Loading tags…</div>
  if (error && !booking) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#ef4444', fontFamily: 'sans-serif' }}>{error}</div>
  if (!booking) return null

  const bagTotal = bags.length
  const customerName = formatCustomerName(booking.title, booking.customer_name) || booking.customer_name || 'Customer'
  const route = [booking.from_city, booking.to_city].filter(Boolean).join(' → ')
  const serviceLabel = booking.service_label || booking.service_type || 'Baggage Delivery'

  const tagData: BagTagCardData[] = bags.filter(b => b.bag_label).map((b, i) => ({
    id: b.id,
    bagLabel: b.bag_label as string,
    customerName,
    bookingId: booking.tracking_id,
    route,
    fromCity: booking.from_city,
    toCity: booking.to_city,
    serviceLabel,
    bagNumber: i + 1,
    bagTotal,
    pickupDate: booking.pickup_date,
    deliveryLocation: b.delivery_location || booking.drop_address,
  }))

  const selectedIds = tagData.filter(t => selected.has(t.id)).map(t => t.id)

  // Consignment Label preview data — Consignor = pickup identity/address,
  // Consignee = same customer identity + drop address (per the founder's
  // confirmed decision to reuse existing booking fields rather than add a
  // separate receiver-name field; mirrors app/api/admin/bookings/[id]/
  // consignment-label/route.ts's PDF-generation logic exactly, so the
  // on-screen preview always matches the downloaded PDF). Same fallback as
  // that route: use real per-bag tags if they've been generated, otherwise
  // fall back to booking.total_bags placeholder bags (bagLabel: null) —
  // this document is independent of the Bag Tag generation flow.
  const generatedLabels = bags.filter(b => b.bag_label)
  const labelBagTotal = generatedLabels.length > 0 ? bagTotal : Math.max(1, booking.total_bags || 1)
  const labelBagLabels: (string | null)[] = generatedLabels.length > 0
    ? generatedLabels.map(b => b.bag_label as string)
    : Array.from({ length: labelBagTotal }, () => null)

  const labelData: ConsignmentLabelCardData[] = labelBagLabels.map((bagLabel, i) => ({
    trackingId: booking.tracking_id,
    bagLabel,
    bagNumber: i + 1,
    bagTotal: labelBagTotal,
    serviceLabel,
    pickupDate: booking.pickup_date,
    consignorName: customerName,
    consignorPhone: booking.customer_phone,
    consignorAddress: booking.pickup_address,
    consigneeName: customerName,
    consigneePhone: booking.customer_phone,
    consigneeAddress: booking.drop_address,
  }))

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f3f4f6; color: #111827; }
        .toolbar { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e5e7eb; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 4px rgba(0,0,0,.06); flex-wrap: wrap; gap: 8px; }
        .toolbar p { font-size: 14px; font-weight: 700; color: #374151; }
        .toolbar button { padding: 6px 14px; border-radius: 8px; font-size: 12.5px; cursor: pointer; font-weight: 600; }
        .btn-back { border: 1px solid #e5e7eb; background: #fff; color: #6b7280; }
        .btn-secondary { border: 1px solid #f97316; background: #fff; color: #f97316; }
        .btn-print { border: none; background: #f97316; color: #fff; }
        .btn-print:disabled { opacity: 0.5; cursor: not-allowed; }
        .sheet { max-width: 900px; margin: 20px auto; }
        .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .err { color: #ef4444; font-size: 13px; padding: 8px 24px; }
        .view-tabs { display: flex; gap: 4px; padding: 0 24px; margin-top: 10px; }
        .view-tab { padding: 7px 16px; border-radius: 8px 8px 0 0; font-size: 12.5px; font-weight: 700; cursor: pointer; border: 1px solid #e5e7eb; border-bottom: none; background: #f3f4f6; color: #6b7280; }
        .view-tab.active { background: #fff; color: #f97316; }
        ${BAG_TAG_CARD_STYLES}
        ${CONSIGNMENT_LABEL_CARD_STYLES}
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .sheet { max-width: none; margin: 0; }
        }
      `}</style>

      <div className="toolbar no-print">
        <p>BAGDROP — {booking.tracking_id} — {bagTotal} Bag{bagTotal !== 1 ? 's' : ''}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-back" onClick={() => router.back()}>← Back</button>
          {view === 'tags' ? (
            tagData.length === 0 ? (
              <button className="btn-print" disabled={!canGenerate || generating} onClick={generateTags}>
                {generating ? 'Generating…' : canGenerate ? 'Generate Tags' : 'Confirm booking first'}
              </button>
            ) : (
              <>
                <button className="btn-secondary" onClick={() => handleDownloadPdf(selectedIds.length ? selectedIds : tagData.map(t => t.id))}>Download PDF</button>
                <button className="btn-secondary" onClick={() => handlePrint(selectedIds)}>Print Selected ({selectedIds.length})</button>
                <button className="btn-print" onClick={() => handlePrint(tagData.map(t => t.id))}>Print All</button>
              </>
            )
          ) : (
            <>
              <button className="btn-secondary" onClick={handleDownloadConsignmentLabel}>Download PDF</button>
              {labelData.length > 0 && <button className="btn-print" onClick={handlePrintLabels}>Print All</button>}
            </>
          )}
        </div>
      </div>

      {/* Bag Tags (barcode/QR operational tag) vs Consignment Labels
          (Consignor/Consignee sender-receiver document) — two separate
          documents, kept as separate tabs so Print All/Print Selected in
          the toolbar above only ever act on whichever one is showing. */}
      <div className="view-tabs no-print">
        <button className={`view-tab${view === 'tags' ? ' active' : ''}`} onClick={() => setView('tags')}>Bag Tags</button>
        <button className={`view-tab${view === 'labels' ? ' active' : ''}`} onClick={() => setView('labels')}>Consignment Labels</button>
      </div>

      {error && <div className="err no-print">{error}</div>}

      {view === 'tags' ? (
        tagData.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#9ca3af' }}>
            {canGenerate ? 'No tags yet — click "Generate Tags" above.' : 'This booking must reach Confirmed status before tags can be generated.'}
          </div>
        ) : (
          <div className="sheet">
            <div className="grid">
              {tagData.map(t => (
                <BagTagPrintCard key={t.id} tag={t} selected={selected.has(t.id)} onToggle={() => toggle(t.id)} />
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="sheet">
          <div className="grid">
            {labelData.map((l, i) => (
              <ConsignmentLabelCard key={l.bagLabel ?? `bag-${i}`} label={l} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
