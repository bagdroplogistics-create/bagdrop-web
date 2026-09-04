'use client'

// BAGDROP — Printable Bag Tags (spec section 13). Every physical bag gets
// its OWN tag with its OWN QR code — never one QR for the whole group.
// Follows the same print-page convention as app/(admin)/admin/leads/print
// and app/(admin)/admin/quotes/[id]/print: fixed no-print toolbar, @page
// print rules, auto-triggered window.print(). QR images use the same
// api.qrserver.com service already used for the payment QR elsewhere in
// this codebase (components/admin/LRPDF.tsx) — no new dependency.
//
// QR payload is just the bag's own bag_number (globally unique) — Phase
// 2's scan workflow looks it up against GET /api/admin/group-bookings/
// [id]/bags (or a dedicated bag lookup route) to show the full detail
// (Guest, Mobile, Group Booking, Route, Hotel, Room, Status) described in
// spec section 12.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface Guest { id: string; guest_name: string; mobile_number: string | null }
interface Bag {
  id: string; guest_id: string | null; bag_number: string
  hotel_name: string | null; room_number: string | null; delivery_location: string | null
}
interface GroupDetails {
  group_booking_number: string; event_name: string
  pickup_city: string | null; delivery_city: string | null
}

function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(data)}`
}

export default function BagTagsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [group, setGroup] = useState<GroupDetails | null>(null)
  const [guests, setGuests] = useState<Guest[]>([])
  const [bags, setBags] = useState<Bag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    fetch(`/api/admin/group-bookings/${id}?key=${key}`, { headers: { 'x-admin-key': key } })
      .then(r => r.json())
      .then(j => { setGroup(j.group_booking ?? null); setGuests(j.guests ?? []); setBags(j.bags ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id, router])

  useEffect(() => {
    if (!loading && group && bags.length > 0) setTimeout(() => window.print(), 700)
  }, [loading, group, bags.length])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontFamily: 'sans-serif' }}>Loading tags…</div>
  if (!group) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#ef4444', fontFamily: 'sans-serif' }}>Group booking not found</div>
  if (bags.length === 0) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontFamily: 'sans-serif' }}>No bags to tag yet — add guests/bags first.</div>

  const guestById = new Map(guests.map(g => [g.id, g]))
  const destination = [group.pickup_city, group.delivery_city].filter(Boolean).join(' → ')

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f3f4f6; color: #111827; }
        .toolbar {
          position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e5e7eb;
          padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 4px rgba(0,0,0,.06);
        }
        .toolbar p { font-size: 14px; font-weight: 700; color: #374151; }
        .toolbar button { padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        .btn-back { border: 1px solid #e5e7eb; background: #fff; color: #6b7280; margin-right: 10px; }
        .btn-print { border: none; background: #f97316; color: #fff; font-weight: 700; }

        .sheet { max-width: 820px; margin: 20px auto; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .tag {
          border: 1.5px dashed #d1d5db; border-radius: 10px; padding: 12px 14px;
          display: flex; align-items: center; gap: 10px; background: #fff;
          break-inside: avoid; page-break-inside: avoid;
        }
        .tag-info { flex: 1; min-width: 0; }
        .tag-brand { font-size: 12px; font-weight: 900; color: #f97316; letter-spacing: 0.5px; }
        .tag-bagid { font-size: 15px; font-weight: 800; color: #111827; font-family: monospace; margin-top: 2px; }
        .tag-row { font-size: 10px; color: #4b5563; margin-top: 3px; line-height: 1.4; }
        .tag-row b { color: #111827; }
        .tag-qr { flex-shrink: 0; width: 64px; height: 64px; }
        .tag-qr img { width: 100%; height: 100%; display: block; }

        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .sheet { max-width: none; margin: 0; }
        }
      `}</style>

      <div className="toolbar no-print">
        <p>BAGDROP — {group.event_name} — {bags.length} Bag Tags</p>
        <div>
          <button className="btn-back" onClick={() => router.back()}>← Back</button>
          <button className="btn-print" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>

      <div className="sheet">
        <div className="grid">
          {bags.map(b => {
            const guest = b.guest_id ? guestById.get(b.guest_id) : null
            return (
              <div key={b.id} className="tag">
                <div className="tag-info">
                  <div className="tag-brand">BAGDROP</div>
                  <div className="tag-bagid">{b.bag_number}</div>
                  <div className="tag-row"><b>Guest:</b> {guest?.guest_name ?? 'Unassigned'}</div>
                  {guest?.mobile_number && <div className="tag-row"><b>Mobile:</b> {guest.mobile_number}</div>}
                  <div className="tag-row"><b>Group:</b> {group.group_booking_number}</div>
                  {destination && <div className="tag-row"><b>Route:</b> {destination}</div>}
                  {(b.hotel_name || b.room_number) && (
                    <div className="tag-row"><b>Hotel/Room:</b> {b.hotel_name ?? '—'}{b.room_number ? ` / ${b.room_number}` : ''}</div>
                  )}
                  {b.delivery_location && <div className="tag-row"><b>Destination:</b> {b.delivery_location}</div>}
                </div>
                <div className="tag-qr"><img src={qrUrl(b.bag_number)} alt={b.bag_number} /></div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
