'use client'

// BAGDROP — Operational Baggage Tag System (Phase 1) — Individual bookings.
// Mirrors app/(admin)/admin/group-bookings/[id]/tags/page.tsx's design and
// actions (Print All / Print Selected / Reprint / Download PDF), driven by
// the generic app/api/admin/bookings/[id]/bag-tags API so both booking
// types share one backend.

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BagTagPrintCard, BAG_TAG_CARD_STYLES, type BagTagCardData } from '@/components/admin/BagTagPrintCard'
import { formatCustomerName } from '@/lib/constants'

interface Booking {
  id: string; tracking_id: string; title: string | null; customer_name: string | null
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
    serviceLabel,
    bagNumber: i + 1,
    bagTotal,
    pickupDate: booking.pickup_date,
    deliveryLocation: b.delivery_location || booking.drop_address,
  }))

  const selectedIds = tagData.filter(t => selected.has(t.id)).map(t => t.id)

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
        .sheet { max-width: 820px; margin: 20px auto; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .err { color: #ef4444; font-size: 13px; padding: 8px 24px; }
        ${BAG_TAG_CARD_STYLES}
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .sheet { max-width: none; margin: 0; }
        }
      `}</style>

      <div className="toolbar no-print">
        <p>BAGDROP — {booking.tracking_id} — {bagTotal} Bag Tag{bagTotal !== 1 ? 's' : ''}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-back" onClick={() => router.back()}>← Back</button>
          {tagData.length === 0 ? (
            <button className="btn-print" disabled={!canGenerate || generating} onClick={generateTags}>
              {generating ? 'Generating…' : canGenerate ? 'Generate Tags' : 'Confirm booking first'}
            </button>
          ) : (
            <>
              <button className="btn-secondary" onClick={() => handleDownloadPdf(selectedIds.length ? selectedIds : tagData.map(t => t.id))}>Download PDF</button>
              <button className="btn-secondary" onClick={() => handlePrint(selectedIds)}>Print Selected ({selectedIds.length})</button>
              <button className="btn-print" onClick={() => handlePrint(tagData.map(t => t.id))}>Print All</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="err no-print">{error}</div>}

      {tagData.length === 0 ? (
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
      )}
    </>
  )
}
