'use client'

// BAGDROP — Group / Wedding Booking detail: event summary + Guest & Bag
// Manifest (spec section 9). Quote/payment/LR/Tripsheet/Invoice are
// deliberately NOT reimplemented here — this page links out to the
// EXISTING quote workflow page (/admin/quotes/view/[lead_id]) via the
// linked lead created alongside this group booking, so all of that logic
// (pricing, sending, payment, LR, tripsheet, invoice) runs completely
// unchanged. This page only owns: event details, guests, and bags.

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Users2, Plus, Search, RefreshCw, Pencil, Trash2, X, Save,
  Luggage, Upload, Download, Tag, FileText, ExternalLink, ChevronDown, AlertTriangle,
} from 'lucide-react'

interface Booking {
  id: string; tracking_id: string; status: string; payment_status: string | null; total_amount: number | null; is_test?: boolean
}
interface Lead {
  id: string; quote_number: string | null; quote_total: number | null; status: string
}
interface GroupDetails {
  booking_id: string; group_booking_number: string; event_name: string; event_type: string | null
  primary_contact_name: string; primary_contact_number: string; primary_contact_email: string | null
  event_date: string | null; pickup_city: string | null; pickup_address: string | null
  delivery_city: string | null; delivery_address: string | null; hotel_name: string | null
  estimated_total_bags: number | null; final_total_bags: number | null
  pickup_window_start: string | null; pickup_window_end: string | null
  special_instructions: string | null; remarks: string | null
}
interface Guest {
  id: string; guest_name: string; mobile_number: string | null; email: string | null
  hotel_name: string | null; room_number: string | null; delivery_location: string | null; remarks: string | null
}
interface Bag {
  id: string; guest_id: string | null; bag_number: string; status: string
  pickup_location: string | null; delivery_location: string | null
  hotel_name: string | null; room_number: string | null; remarks: string | null
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:           { label: 'Pending',           color: '#6b7280', bg: '#f3f4f6' },
  picked_up:         { label: 'Picked Up',         color: '#0891b2', bg: '#cffafe' },
  received:          { label: 'Received',          color: '#4f46e5', bg: '#eef2ff' },
  tagged:            { label: 'Tagged',             color: '#7c3aed', bg: '#ede9fe' },
  in_transit:        { label: 'In Transit',         color: '#0369a1', bg: '#e0f2fe' },
  out_for_delivery:  { label: 'Out for Delivery',   color: '#ea580c', bg: '#ffedd5' },
  delivered:         { label: 'Delivered',          color: '#16a34a', bg: '#dcfce7' },
  missing:           { label: 'Missing',            color: '#dc2626', bg: '#fee2e2' },
  damaged:           { label: 'Damaged',            color: '#dc2626', bg: '#fee2e2' },
  delivery_issue:    { label: 'Delivery Issue',     color: '#d97706', bg: '#fef3c7' },
  returned:          { label: 'Returned',           color: '#6b7280', bg: '#f3f4f6' },
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
const labelCls = 'mb-1 block text-xs font-semibold text-gray-600'

export default function GroupBookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed]     = useState(false)

  const [group, setGroup]   = useState<GroupDetails | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [lead, setLead]     = useState<Lead | null>(null)
  const [guests, setGuests] = useState<Guest[]>([])
  const [bags, setBags]     = useState<Bag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setAuthed(true)
  }, [router])

  const load = useCallback(async () => {
    if (!adminKey || !id) return
    setError('')
    try {
      const res = await fetch(`/api/admin/group-bookings/${id}?key=${adminKey}`, { headers: { 'x-admin-key': adminKey } })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'Could not load this group booking'); setLoading(false); return }
      setGroup(j.group_booking); setBooking(j.group_booking?.booking ?? null); setLead(j.lead); setGuests(j.guests ?? []); setBags(j.bags ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [adminKey, id])

  useEffect(() => { if (authed) load() }, [authed, load])

  // ── Guest modal ──────────────────────────────────────────────────
  const [guestModal, setGuestModal] = useState<{ open: boolean; guest: Guest | null }>({ open: false, guest: null })
  const [guestForm, setGuestForm] = useState({ guest_name: '', mobile_number: '', email: '', hotel_name: '', room_number: '', delivery_location: '', remarks: '', bags_count: '1' })
  const [guestSaving, setGuestSaving] = useState(false)
  const [guestErr, setGuestErr] = useState('')

  function openGuestModal(guest: Guest | null) {
    setGuestErr('')
    setGuestForm(guest ? {
      guest_name: guest.guest_name, mobile_number: guest.mobile_number ?? '', email: guest.email ?? '',
      hotel_name: guest.hotel_name ?? '', room_number: guest.room_number ?? '', delivery_location: guest.delivery_location ?? '',
      remarks: guest.remarks ?? '', bags_count: '0',
    } : { guest_name: '', mobile_number: '', email: '', hotel_name: group?.hotel_name ?? '', room_number: '', delivery_location: '', remarks: '', bags_count: '1' })
    setGuestModal({ open: true, guest })
  }

  async function saveGuest() {
    if (!guestForm.guest_name.trim()) { setGuestErr('Guest name is required'); return }
    setGuestSaving(true); setGuestErr('')
    try {
      const url    = guestModal.guest ? `/api/admin/group-bookings/${id}/guests/${guestModal.guest.id}` : `/api/admin/group-bookings/${id}/guests`
      const method = guestModal.guest ? 'PATCH' : 'POST'
      const res = await fetch(`${url}?key=${adminKey}`, {
        method, headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify(guestModal.guest ? guestForm : { ...guestForm, bags_count: Number(guestForm.bags_count) || 0 }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 207) { setGuestErr(j.error ?? 'Could not save guest'); setGuestSaving(false); return }
      if (j.error) setGuestErr(j.error) // 207 partial success (guest ok, bags failed)
      setGuestModal({ open: false, guest: null })
      await load()
    } catch (e) {
      setGuestErr(e instanceof Error ? e.message : 'Network error')
    } finally {
      setGuestSaving(false)
    }
  }

  async function deleteGuest(guest: Guest) {
    if (!confirm(`Remove ${guest.guest_name} and their bags from this manifest? Bag IDs already issued will never be reused.`)) return
    await fetch(`/api/admin/group-bookings/${id}/guests/${guest.id}?key=${adminKey}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
    await load()
  }

  // ── Bag modal ────────────────────────────────────────────────────
  const [bagModal, setBagModal] = useState<{ open: boolean; bag: Bag | null }>({ open: false, bag: null })
  const [bagForm, setBagForm] = useState({ guest_id: '', pickup_location: '', delivery_location: '', hotel_name: '', room_number: '', remarks: '', status: 'pending' })
  const [bagSaving, setBagSaving] = useState(false)
  const [bagErr, setBagErr] = useState('')

  function openBagModal(bag: Bag | null) {
    setBagErr('')
    setBagForm(bag ? {
      guest_id: bag.guest_id ?? '', pickup_location: bag.pickup_location ?? '', delivery_location: bag.delivery_location ?? '',
      hotel_name: bag.hotel_name ?? '', room_number: bag.room_number ?? '', remarks: bag.remarks ?? '', status: bag.status,
    } : { guest_id: '', pickup_location: group?.pickup_address ?? '', delivery_location: group?.delivery_address ?? '', hotel_name: group?.hotel_name ?? '', room_number: '', remarks: '', status: 'pending' })
    setBagModal({ open: true, bag })
  }

  async function saveBag() {
    setBagSaving(true); setBagErr('')
    try {
      const url    = bagModal.bag ? `/api/admin/group-bookings/${id}/bags/${bagModal.bag.id}` : `/api/admin/group-bookings/${id}/bags`
      const method = bagModal.bag ? 'PATCH' : 'POST'
      const res = await fetch(`${url}?key=${adminKey}`, {
        method, headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ ...bagForm, guest_id: bagForm.guest_id || null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setBagErr(j.error ?? 'Could not save bag'); setBagSaving(false); return }
      setBagModal({ open: false, bag: null })
      await load()
    } catch (e) {
      setBagErr(e instanceof Error ? e.message : 'Network error')
    } finally {
      setBagSaving(false)
    }
  }

  async function deleteBag(bag: Bag) {
    if (!confirm(`Remove bag ${bag.bag_number}? This ID will never be reused.`)) return
    await fetch(`/api/admin/group-bookings/${id}/bags/${bag.id}?key=${adminKey}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
    await load()
  }

  // ── Excel/CSV import ────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null)
  const [importModal, setImportModal] = useState<{ open: boolean; step: 'pick' | 'preview' | 'result'; file: File | null; preview: any; result: any; busy: boolean; err: string }>(
    { open: false, step: 'pick', file: null, preview: null, result: null, busy: false, err: '' }
  )

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportModal(m => ({ ...m, file, err: '' }))
  }

  async function previewImport() {
    if (!importModal.file) return
    setImportModal(m => ({ ...m, busy: true, err: '' }))
    const fd = new FormData()
    fd.append('file', importModal.file)
    fd.append('mode', 'preview')
    const res = await fetch(`/api/admin/group-bookings/${id}/import?key=${adminKey}`, { method: 'POST', headers: { 'x-admin-key': adminKey }, body: fd })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setImportModal(m => ({ ...m, busy: false, err: j.error ?? 'Could not read file' })); return }
    setImportModal(m => ({ ...m, busy: false, step: 'preview', preview: j }))
  }

  async function commitImport() {
    if (!importModal.file) return
    setImportModal(m => ({ ...m, busy: true, err: '' }))
    const fd = new FormData()
    fd.append('file', importModal.file)
    fd.append('mode', 'commit')
    const res = await fetch(`/api/admin/group-bookings/${id}/import?key=${adminKey}`, { method: 'POST', headers: { 'x-admin-key': adminKey }, body: fd })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setImportModal(m => ({ ...m, busy: false, err: j.error ?? 'Import failed' })); return }
    setImportModal(m => ({ ...m, busy: false, step: 'result', result: j }))
    await load()
  }

  const [deleting, setDeleting] = useState(false)
  async function deleteTestBooking() {
    if (!booking?.is_test) return
    if (!confirm(`Permanently delete this TEST group booking (${group?.group_booking_number}) and everything under it — guests, bags, quote, payments, LR, tripsheets, invoices? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/group-bookings/${id}?key=${adminKey}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert(j.error ?? 'Could not delete this booking'); setDeleting(false); return }
      router.push('/admin/group-bookings')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Network error')
      setDeleting(false)
    }
  }

  if (!authed) return null
  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" /></div>
  if (error || !group) return (
    <main className="px-6 py-10 text-center text-sm text-red-500">{error || 'Group booking not found'}</main>
  )

  const guestById = new Map(guests.map(g => [g.id, g]))
  const totalBags = group.final_total_bags ?? group.estimated_total_bags ?? bags.length
  const filteredBags = bags.filter(b => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    const guest = b.guest_id ? guestById.get(b.guest_id) : null
    return b.bag_number.toLowerCase().includes(q)
      || (guest?.guest_name ?? '').toLowerCase().includes(q)
      || (guest?.mobile_number ?? '').includes(q)
  })

  return (
    <>
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <button onClick={() => router.push('/admin/group-bookings')}
          className="mb-2 flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Group Bookings
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Users2 className="h-5 w-5 text-orange-500" /> {group.event_name}</h1>
            <p className="mt-0.5 text-sm text-gray-400">
              <span className="font-mono font-semibold text-pink-700">{group.group_booking_number}</span> · {booking?.tracking_id} · {guests.length} guests · {bags.length} / {totalBags} bags
            </p>
          </div>
          <div className="flex gap-2">
            {lead && (
              <button onClick={() => router.push(`/admin/quotes/view/${lead.id}`)}
                className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
                <FileText className="h-4 w-4" /> {lead.quote_number ? 'Open Quote / Workflow' : 'Generate Quote'} <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => router.push(`/admin/group-bookings/${id}/tags`)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Tag className="h-4 w-4" /> Bag Tags
            </button>
            {booking?.is_test && (
              <button onClick={deleteTestBooking} disabled={deleting}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> {deleting ? 'Deleting…' : 'Delete Test Booking'}
              </button>
            )}
          </div>
        </div>
      </div>

      {booking?.is_test && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm font-semibold text-amber-800">
          <AlertTriangle className="h-4 w-4" /> TEST MODE — this booking does not count toward Dashboard totals or revenue reports. Delete it when you're done testing.
        </div>
      )}

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {/* Event summary */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <SummaryCard label="Primary Contact" value={group.primary_contact_name} sub={group.primary_contact_number} />
          <SummaryCard label="Route" value={group.pickup_city && group.delivery_city ? `${group.pickup_city} → ${group.delivery_city}` : '—'} sub={group.hotel_name ?? undefined} />
          <SummaryCard label="Pickup Window" value={group.pickup_window_start ? `${fmtDate(group.pickup_window_start)} – ${fmtDate(group.pickup_window_end)}` : '—'} sub={group.event_date ? `Event: ${fmtDate(group.event_date)}` : undefined} />
          <SummaryCard label="Quote" value={lead?.quote_total != null ? '₹' + Math.round(lead.quote_total).toLocaleString('en-IN') : '— not generated —'} sub={lead?.quote_number ?? undefined} />
        </div>

        {/* Manifest toolbar */}
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by Guest, Mobile, or Bag ID…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="all">All statuses</option>
              {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={() => openGuestModal(null)} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Guest
          </button>
          <button onClick={() => openBagModal(null)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <Luggage className="h-3.5 w-3.5" /> Add Bag
          </button>
          <button onClick={() => setImportModal({ open: true, step: 'pick', file: null, preview: null, result: null, busy: false, err: '' })}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <Upload className="h-3.5 w-3.5" /> Import Excel/CSV
          </button>
          <a href={`/api/admin/group-bookings/${id}/template?key=${adminKey}`}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <Download className="h-3.5 w-3.5" /> Template
          </a>
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Guests strip */}
        {guests.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {guests.map(g => {
              const count = bags.filter(b => b.guest_id === g.id).length
              return (
                <div key={g.id} className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-3 pr-1.5 text-xs shadow-sm">
                  <span className="font-semibold text-gray-800">{g.guest_name}</span>
                  <span className="text-gray-400">{count} bag{count !== 1 ? 's' : ''}</span>
                  <button onClick={() => openGuestModal(g)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-orange-600"><Pencil className="h-3 w-3" /></button>
                  <button onClick={() => deleteGuest(g)} className="rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                </div>
              )
            })}
          </div>
        )}

        {/* Bag manifest table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {bags.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No bags yet — add a guest with a bag count, add a bag manually, or import a manifest.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Bag ID', 'Guest Name', 'Mobile', 'Hotel', 'Room', 'Delivery Location', 'Status', 'Remarks', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredBags.map(b => {
                    const guest = b.guest_id ? guestById.get(b.guest_id) : null
                    const meta = STATUS_META[b.status] ?? { label: b.status, color: '#6b7280', bg: '#f3f4f6' }
                    return (
                      <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2 font-mono text-xs font-bold text-gray-700">{b.bag_number}</td>
                        <td className="px-4 py-2 text-sm text-gray-800">{guest?.guest_name ?? <span className="text-gray-400">Unassigned</span>}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{guest?.mobile_number ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{b.hotel_name ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{b.room_number ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{b.delivery_location ?? '—'}</td>
                        <td className="px-4 py-2"><span style={{ color: meta.color, background: meta.bg }} className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold">{meta.label}</span></td>
                        <td className="px-4 py-2 text-xs text-gray-400">{b.remarks ?? '—'}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openBagModal(b)} title="Edit" className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => deleteBag(b)} title="Remove" className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Guest modal ── */}
      {guestModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{guestModal.guest ? 'Edit Guest' : 'Add Guest'}</h2>
              <button onClick={() => setGuestModal({ open: false, guest: null })} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div><label className={labelCls}>Guest Name *</label><input className={inputCls} value={guestForm.guest_name} onChange={e => setGuestForm(f => ({ ...f, guest_name: e.target.value }))} /></div>
              <div><label className={labelCls}>Mobile Number</label><input className={inputCls} value={guestForm.mobile_number} onChange={e => setGuestForm(f => ({ ...f, mobile_number: e.target.value }))} /></div>
              <div><label className={labelCls}>Email (optional)</label><input className={inputCls} value={guestForm.email} onChange={e => setGuestForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Hotel</label><input className={inputCls} value={guestForm.hotel_name} onChange={e => setGuestForm(f => ({ ...f, hotel_name: e.target.value }))} /></div>
                <div><label className={labelCls}>Room Number</label><input className={inputCls} value={guestForm.room_number} onChange={e => setGuestForm(f => ({ ...f, room_number: e.target.value }))} /></div>
              </div>
              <div><label className={labelCls}>Delivery Address/Location</label><input className={inputCls} value={guestForm.delivery_location} onChange={e => setGuestForm(f => ({ ...f, delivery_location: e.target.value }))} /></div>
              {!guestModal.guest && (
                <div>
                  <label className={labelCls}>Number of Bags</label>
                  <input type="number" min={0} className={inputCls} value={guestForm.bags_count} onChange={e => setGuestForm(f => ({ ...f, bags_count: e.target.value }))} />
                  <p className="mt-1 text-[11px] text-gray-400">This many bags will be created automatically, each with its own unique Bag ID.</p>
                </div>
              )}
              <div><label className={labelCls}>Remarks</label><textarea rows={2} className={inputCls} value={guestForm.remarks} onChange={e => setGuestForm(f => ({ ...f, remarks: e.target.value }))} /></div>
            </div>
            {guestErr && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{guestErr}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setGuestModal({ open: false, guest: null })} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveGuest} disabled={guestSaving} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {guestSaving ? 'Saving…' : <><Save className="h-3.5 w-3.5" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bag modal ── */}
      {bagModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{bagModal.bag ? `Edit Bag ${bagModal.bag.bag_number}` : 'Add Bag'}</h2>
              <button onClick={() => setBagModal({ open: false, bag: null })} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Guest</label>
                <select className={inputCls} value={bagForm.guest_id} onChange={e => setBagForm(f => ({ ...f, guest_id: e.target.value }))}>
                  <option value="">— Unassigned —</option>
                  {guests.map(g => <option key={g.id} value={g.id}>{g.guest_name}</option>)}
                </select>
              </div>
              {bagModal.bag && (
                <div>
                  <label className={labelCls}>Status</label>
                  <select className={inputCls} value={bagForm.status} onChange={e => setBagForm(f => ({ ...f, status: e.target.value }))}>
                    {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Hotel</label><input className={inputCls} value={bagForm.hotel_name} onChange={e => setBagForm(f => ({ ...f, hotel_name: e.target.value }))} /></div>
                <div><label className={labelCls}>Room Number</label><input className={inputCls} value={bagForm.room_number} onChange={e => setBagForm(f => ({ ...f, room_number: e.target.value }))} /></div>
              </div>
              <div><label className={labelCls}>Pickup Location</label><input className={inputCls} value={bagForm.pickup_location} onChange={e => setBagForm(f => ({ ...f, pickup_location: e.target.value }))} /></div>
              <div><label className={labelCls}>Delivery Location</label><input className={inputCls} value={bagForm.delivery_location} onChange={e => setBagForm(f => ({ ...f, delivery_location: e.target.value }))} /></div>
              <div><label className={labelCls}>Remarks</label><textarea rows={2} className={inputCls} value={bagForm.remarks} onChange={e => setBagForm(f => ({ ...f, remarks: e.target.value }))} /></div>
            </div>
            {bagErr && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{bagErr}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setBagModal({ open: false, bag: null })} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveBag} disabled={bagSaving} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {bagSaving ? 'Saving…' : <><Save className="h-3.5 w-3.5" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import modal ── */}
      {importModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Import Guest & Bag Manifest</h2>
              <button onClick={() => setImportModal({ open: false, step: 'pick', file: null, preview: null, result: null, busy: false, err: '' })} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            {importModal.step === 'pick' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Download the template, fill in Guest Name, Mobile Number, Number of Bags (and optional Hotel/Room/Delivery/Remarks), then upload it here.</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={pickFile} className="block w-full text-sm text-gray-600" />
                {importModal.err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{importModal.err}</div>}
                <div className="flex justify-end gap-2">
                  <a href={`/api/admin/group-bookings/${id}/template?key=${adminKey}`} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Download Template</a>
                  <button onClick={previewImport} disabled={!importModal.file || importModal.busy} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                    {importModal.busy ? 'Reading…' : 'Preview →'}
                  </button>
                </div>
              </div>
            )}

            {importModal.step === 'preview' && importModal.preview && (
              <div className="space-y-4">
                <div className="flex gap-4 text-sm">
                  <span className="font-semibold text-gray-700">{importModal.preview.total} rows</span>
                  <span className="text-green-600">{importModal.preview.valid} valid</span>
                  <span className="text-amber-600">{importModal.preview.skipped} already imported</span>
                  <span className="text-red-600">{importModal.preview.errors} with errors</span>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50"><tr>{['Row', 'Guest', 'Mobile', 'Bags', 'Status'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {importModal.preview.rows.map((r: any) => (
                        <tr key={r.row} className={r.status === 'error' ? 'bg-red-50' : r.status === 'skipped_duplicate' ? 'bg-amber-50' : ''}>
                          <td className="px-3 py-1.5">{r.row}</td>
                          <td className="px-3 py-1.5">{r.guest_name}</td>
                          <td className="px-3 py-1.5">{r.mobile_number}</td>
                          <td className="px-3 py-1.5">{r.bags_count}</td>
                          <td className="px-3 py-1.5">{r.status === 'ok' ? 'Ready' : r.status === 'skipped_duplicate' ? 'Already on this booking' : r.errors.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importModal.err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{importModal.err}</div>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setImportModal(m => ({ ...m, step: 'pick' }))} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Back</button>
                  <button onClick={commitImport} disabled={importModal.preview.valid === 0 || importModal.busy}
                    className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                    {importModal.busy ? 'Importing…' : `Import ${importModal.preview.valid} Guest${importModal.preview.valid !== 1 ? 's' : ''} →`}
                  </button>
                </div>
              </div>
            )}

            {importModal.step === 'result' && importModal.result && (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  Created {importModal.result.created_guests} guest{importModal.result.created_guests !== 1 ? 's' : ''} and {importModal.result.created_bags} bag{importModal.result.created_bags !== 1 ? 's' : ''}.
                  {importModal.result.skipped > 0 && ` ${importModal.result.skipped} row(s) skipped (already on this booking).`}
                </div>
                {importModal.result.failed?.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
                    {importModal.result.failed.map((f: any, i: number) => <div key={i}>Row {f.row} ({f.guest_name}): {f.error}</div>)}
                  </div>
                )}
                <div className="flex justify-end">
                  <button onClick={() => setImportModal({ open: false, step: 'pick', file: null, preview: null, result: null, busy: false, err: '' })}
                    className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
