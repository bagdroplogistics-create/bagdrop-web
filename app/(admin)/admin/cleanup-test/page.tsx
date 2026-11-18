'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface BookingRow { id: string; customer_name: string; customer_phone: string; status: string; tracking_id: string | null }
interface LeadRow { id: string; name: string; phone: string; booking_id: string | null; lead_number: string | null }
interface PreviewResult { ok: boolean; bookingCount: number; leadCount: number; bookings: BookingRow[]; leads: LeadRow[] }
interface DeleteResult { ok: boolean; deletedBookings: number; deletedLeads: number; errors: string[] }

export default function CleanupTestPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<DeleteResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
  }, [router])

  async function loadPreview() {
    if (!adminKey) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await fetch('/api/admin/cleanup-test', { headers: { 'x-admin-key': adminKey } })
      const j = await r.json()
      if (!r.ok) setError(j.error ?? 'Failed to load preview')
      else setPreview(j)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  async function runDelete() {
    if (!preview || !window.confirm(`Delete ${preview.bookingCount} booking(s) and ${preview.leadCount} lead(s)? This cannot be undone.`)) return
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/admin/cleanup-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ confirm: true }),
      })
      const j = await r.json()
      if (!r.ok) setError(j.error ?? 'Delete failed')
      else { setResult(j); setPreview(null) }
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-xl font-semibold mb-1">Clean up test bookings &amp; leads</h1>
      <p className="text-sm text-gray-500 mb-6">
        Matches any booking or lead whose name contains &quot;test&quot; or &quot;claude&quot; (case-insensitive) —
        also removes their quotes, payments, invoices, trip sheets, and the matching lead rows.
      </p>

      <button
        onClick={loadPreview}
        disabled={loading}
        className="px-4 py-2 rounded bg-gray-800 text-white text-sm disabled:opacity-50"
      >
        {loading ? 'Loading…' : 'Preview matches'}
      </button>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {preview && (
        <div className="mt-6">
          <p className="text-sm font-medium mb-2">
            {preview.bookingCount} booking(s), {preview.leadCount} lead(s) matched
          </p>
          <ul className="text-sm border rounded divide-y mb-4 max-h-80 overflow-y-auto">
            {preview.bookings.map((b) => (
              <li key={b.id} className="p-2 flex justify-between">
                <span>{b.tracking_id ?? b.id} — {b.customer_name}</span>
                <span className="text-gray-400">{b.status}</span>
              </li>
            ))}
            {preview.leads.map((l) => (
              <li key={l.id} className="p-2 flex justify-between text-gray-500">
                <span>Lead {l.lead_number ?? l.id} — {l.name}</span>
                <span>{l.booking_id ? 'linked' : 'lead only'}</span>
              </li>
            ))}
          </ul>
          {preview.bookingCount + preview.leadCount === 0 ? (
            <p className="text-sm text-gray-400">Nothing to delete.</p>
          ) : (
            <button
              onClick={runDelete}
              disabled={loading}
              className="px-4 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-50"
            >
              {loading ? 'Deleting…' : `Delete all ${preview.bookingCount + preview.leadCount} record(s)`}
            </button>
          )}
        </div>
      )}

      {result && (
        <div className="mt-6 text-sm">
          <p className="text-green-700">
            Deleted {result.deletedBookings} booking(s) and {result.deletedLeads} lead(s).
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 text-red-600">
              {result.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
