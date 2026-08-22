'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight, MapPin, Search, AlertCircle,
} from 'lucide-react'

interface Route {
  id:           string
  from_city:    string
  to_city:      string
  base_price:   number
  per_bag_rate: number
  is_active:    boolean
  created_at:   string
}

// ── Missing Routes (from real inquiries) ────────────────────────────────
// Backed by GET /api/admin/route-pricing/missing-routes — see that route's
// header comment for the full pricing-derivation logic. Nothing here is
// invented: suggested prices come only from leads.quote_subtotal, and are
// left blank when there isn't a real quote to derive them from.
interface MissingRoute {
  from_city:              string
  to_city:                string
  inquiry_count:          number
  suggested_base_price:   number | null
  suggested_per_bag_rate: number | null
  base_price_basis:       string
  per_bag_rate_basis:     string
  sample_points: Array<{ bags: number; listSubtotal: number; leadNumber: string | null; name: string; createdAt: string }>
}

interface RouteForm {
  from_city:    string
  to_city:      string
  base_price:   string
  per_bag_rate: string
}

const EMPTY_FORM: RouteForm = { from_city: '', to_city: '', base_price: '', per_bag_rate: '' }

const fmt = (n: number) => '₹' + Number(n).toLocaleString('en-IN')

// ── Inline edit row ───────────────────────────────────────────────
function EditRow({
  route, adminKey, onSaved, onCancel,
}: {
  route: Route; adminKey: string; onSaved: () => void; onCancel: () => void
}) {
  const [form, setForm] = useState<RouteForm>({
    from_city:    route.from_city,
    to_city:      route.to_city,
    base_price:   String(route.base_price),
    per_bag_rate: String(route.per_bag_rate),
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  async function save() {
    if (!form.from_city || !form.to_city || !form.base_price || !form.per_bag_rate) {
      setErr('All fields are required'); return
    }
    setSaving(true); setErr('')
    const res = await fetch(`/api/admin/route-pricing/${route.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        from_city:    form.from_city,
        to_city:      form.to_city,
        base_price:   Number(form.base_price),
        per_bag_rate: Number(form.per_bag_rate),
      }),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Save failed'); setSaving(false); return }
    onSaved()
  }

  const inp = 'w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'

  return (
    <tr className="bg-orange-50">
      <td className="px-4 py-2">
        <input value={form.from_city} onChange={e => setForm(f => ({ ...f, from_city: e.target.value }))}
          className={inp} placeholder="mumbai" />
      </td>
      <td className="px-4 py-2">
        <input value={form.to_city} onChange={e => setForm(f => ({ ...f, to_city: e.target.value }))}
          className={inp} placeholder="vadodara" />
      </td>
      <td className="px-4 py-2">
        <input type="number" min="0" value={form.base_price}
          onChange={e => setForm(f => ({ ...f, base_price: e.target.value }))}
          className={inp} placeholder="5000" />
        {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      </td>
      <td className="px-4 py-2">
        <input type="number" min="0" value={form.per_bag_rate}
          onChange={e => setForm(f => ({ ...f, per_bag_rate: e.target.value }))}
          className={inp} placeholder="1800" />
      </td>
      <td className="px-4 py-2" />
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Add row ───────────────────────────────────────────────────────
function AddRow({
  adminKey, onSaved, onCancel,
}: {
  adminKey: string; onSaved: () => void; onCancel: () => void
}) {
  const [form, setForm] = useState<RouteForm>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  async function save() {
    if (!form.from_city || !form.to_city || !form.base_price || !form.per_bag_rate) {
      setErr('All fields are required'); return
    }
    setSaving(true); setErr('')
    const res = await fetch('/api/admin/route-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        from_city:    form.from_city,
        to_city:      form.to_city,
        base_price:   Number(form.base_price),
        per_bag_rate: Number(form.per_bag_rate),
      }),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Save failed'); setSaving(false); return }
    onSaved()
  }

  const inp = 'w-full rounded border border-orange-200 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white'

  return (
    <tr className="bg-orange-50/60">
      <td className="px-4 py-2">
        <input value={form.from_city} onChange={e => setForm(f => ({ ...f, from_city: e.target.value }))}
          className={inp} placeholder="e.g. mumbai" autoFocus />
      </td>
      <td className="px-4 py-2">
        <input value={form.to_city} onChange={e => setForm(f => ({ ...f, to_city: e.target.value }))}
          className={inp} placeholder="e.g. vadodara" />
      </td>
      <td className="px-4 py-2">
        <input type="number" min="0" value={form.base_price}
          onChange={e => setForm(f => ({ ...f, base_price: e.target.value }))}
          className={inp} placeholder="5000" />
        {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      </td>
      <td className="px-4 py-2">
        <input type="number" min="0" value={form.per_bag_rate}
          onChange={e => setForm(f => ({ ...f, per_bag_rate: e.target.value }))}
          className={inp} placeholder="1800" />
      </td>
      <td className="px-4 py-2" />
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> {saving ? 'Adding…' : 'Add Route'}
          </button>
          <button onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Price preview component ───────────────────────────────────────
function PricePreview({ base, perBag }: { base: number; perBag: number }) {
  const rows = [1, 2, 3, 4, 5].map(bags => {
    const sub   = bags <= 2 ? base : base + (bags - 2) * perBag
    const total = parseFloat((sub * 1.05).toFixed(2))
    return { bags, sub, total }
  })
  return (
    <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/50 p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-500">Price Preview (incl. 5% GST)</p>
      <div className="grid grid-cols-5 gap-2">
        {rows.map(r => (
          <div key={r.bags} className="rounded-lg bg-white border border-orange-100 px-3 py-2 text-center">
            <p className="text-[10px] font-semibold text-gray-400">{r.bags} bag{r.bags > 1 ? 's' : ''}</p>
            <p className="text-sm font-bold text-gray-800">{fmt(r.total)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Missing route review row ──────────────────────────────────────
// One row per route found in real inquiries but not yet in route_pricing.
// Fields are pre-filled with the suggested price when derivable from a real
// quote on that route, and left blank (with a placeholder explaining why)
// otherwise — the founder must type in a real number before Add Route
// enables, same as the manual AddRow above. Nothing is written until the
// founder clicks Add Route.
function MissingRouteRow({
  route, adminKey, onAdded, onDismiss,
}: {
  route: MissingRoute; adminKey: string; onAdded: () => void; onDismiss: () => void
}) {
  const [basePrice, setBasePrice] = useState(route.suggested_base_price != null ? String(route.suggested_base_price) : '')
  const [perBagRate, setPerBagRate] = useState(route.suggested_per_bag_rate != null ? String(route.suggested_per_bag_rate) : '')
  const [showSamples, setShowSamples] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!basePrice || !perBagRate) { setErr('Both prices are required'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/admin/route-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        from_city:    route.from_city,
        to_city:      route.to_city,
        base_price:   Number(basePrice),
        per_bag_rate: Number(perBagRate),
      }),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Save failed'); setSaving(false); return }
    onAdded()
  }

  const inp = 'w-full rounded border border-orange-200 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white'

  return (
    <>
      <tr className="bg-amber-50/60">
        <td className="px-4 py-2 font-semibold text-gray-900 capitalize">{route.from_city}</td>
        <td className="px-4 py-2 font-semibold text-gray-900 capitalize">{route.to_city}</td>
        <td className="px-4 py-2">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{route.inquiry_count}</span>
        </td>
        <td className="px-4 py-2">
          <input type="number" min="0" value={basePrice} onChange={e => setBasePrice(e.target.value)}
            className={inp} placeholder={route.suggested_base_price == null ? 'Enter manually' : undefined} title={route.base_price_basis} />
        </td>
        <td className="px-4 py-2">
          <input type="number" min="0" value={perBagRate} onChange={e => setPerBagRate(e.target.value)}
            className={inp} placeholder={route.suggested_per_bag_rate == null ? 'Enter manually' : undefined} title={route.per_bag_rate_basis} />
          {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
        </td>
        <td className="px-4 py-2">
          <button onClick={() => setShowSamples(v => !v)} className="text-xs font-medium text-orange-600 hover:underline">
            {showSamples ? 'Hide' : 'View'} quotes
          </button>
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
              <Check className="h-3.5 w-3.5" /> {saving ? 'Adding…' : 'Add Route'}
            </button>
            <button onClick={onDismiss} title="Dismiss for this session"
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {showSamples && (
        <tr className="bg-amber-50/30">
          <td colSpan={7} className="px-4 py-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Real quotes behind this suggestion</p>
            <div className="flex flex-wrap gap-2">
              {route.sample_points.map((p, i) => (
                <span key={i} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs text-gray-600">
                  {p.leadNumber ?? p.name} · {p.bags} bag{p.bags > 1 ? 's' : ''} · ₹{p.listSubtotal.toLocaleString('en-IN')}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function RoutePricingPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [routes,   setRoutes]   = useState<Route[]>([])
  const [loading,  setLoading]  = useState(true)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [adding,   setAdding]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [preview,  setPreview]  = useState<Route | null>(null)
  const [err,      setErr]      = useState('')

  // ── Missing Routes (from real inquiries) ──────────────────────────
  const [missingRoutes,  setMissingRoutes]  = useState<MissingRoute[]>([])
  const [missingLoading, setMissingLoading] = useState(true)
  const [missingError,   setMissingError]   = useState('')
  const [leadsConsidered, setLeadsConsidered] = useState(0)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchRoutes = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const res = await fetch(`/api/admin/route-pricing?key=${adminKey}`)
    if (res.ok) setRoutes((await res.json()).routes ?? [])
    setLoading(false)
  }, [adminKey])

  useEffect(() => { if (authed) fetchRoutes() }, [authed, fetchRoutes])

  const fetchMissingRoutes = useCallback(async () => {
    if (!adminKey) return
    setMissingLoading(true)
    setMissingError('')
    try {
      const res = await fetch(`/api/admin/route-pricing/missing-routes?key=${adminKey}`)
      const d = await res.json()
      if (!res.ok) { setMissingError(d.error ?? 'Failed to load missing routes'); setMissingLoading(false); return }
      setMissingRoutes(d.missing_routes ?? [])
      setLeadsConsidered(d.leads_considered ?? 0)
    } catch {
      setMissingError('Network error while checking inquiries for missing routes.')
    }
    setMissingLoading(false)
  }, [adminKey])

  useEffect(() => { if (authed) fetchMissingRoutes() }, [authed, fetchMissingRoutes])

  async function toggleActive(route: Route) {
    await fetch(`/api/admin/route-pricing/${route.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ is_active: !route.is_active }),
    })
    fetchRoutes()
  }

  async function deleteRoute(id: string) {
    if (!confirm('Delete this route? This cannot be undone.')) return
    setDeleting(id)
    const res = await fetch(`/api/admin/route-pricing/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey },
    })
    if (!res.ok) {
      const d = await res.json()
      setErr(d.error ?? 'Delete failed')
    }
    setDeleting(null)
    fetchRoutes()
  }

  if (!authed) return null

  return (
    <>
      {/* Header */}
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Route Pricing</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage per-route pricing rules. Prices auto-apply when creating quotes.</p>
          </div>
          <button
            onClick={() => { setAdding(true); setEditId(null); setErr('') }}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
            <Plus className="h-4 w-4" /> Add Route
          </button>
        </div>
      </div>

      <main className="px-6 py-6">

        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {err}
          </div>
        )}

        {/* Pricing logic callout */}
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <span className="font-semibold">Pricing formula:</span> Base price for 1–2 bags.
          For 3+ bags: <span className="font-mono">base + (bags − 2) × per-bag rate</span> + 5% GST.
        </div>

        {/* ── Missing Routes (from real inquiries) ──────────────────────
             Compares every route actually quoted in leads.quote_subtotal
             against this table (alias/direction-aware), so a route can
             never be silently missing from auto-pricing without it showing
             up here first. Suggested prices come only from real quotes on
             that exact route — never invented — and are left blank when
             there isn't one, forcing manual entry before Add Route works. */}
        {missingError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{missingError}</div>
        )}
        {!missingLoading && missingRoutes.filter(r => !dismissed.has(`${r.from_city}|${r.to_city}`)).length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-bold text-amber-800">
                  Missing Routes — found in {leadsConsidered} quoted inquiries, not yet in this table
                </p>
              </div>
            </div>
            <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50/50 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Prices below are pulled from real quotes on that exact route (never invented). Where there isn&apos;t a real quote to derive a number from, the field is left blank — fill it in before adding. Review and edit before clicking Add Route.</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">From</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">To</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Inquiries</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Base (1–2 bags)</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Per extra bag</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {missingRoutes
                    .filter(r => !dismissed.has(`${r.from_city}|${r.to_city}`))
                    .map(r => (
                      <MissingRouteRow
                        key={`${r.from_city}|${r.to_city}`}
                        route={r}
                        adminKey={adminKey}
                        onAdded={() => { fetchRoutes(); fetchMissingRoutes() }}
                        onDismiss={() => setDismissed(prev => new Set(prev).add(`${r.from_city}|${r.to_city}`))}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">From</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">To</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Base (1–2 bags)</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Per extra bag</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {routes.length === 0 && !adding && (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-sm text-gray-400">
                        <MapPin className="mx-auto h-8 w-8 text-gray-200 mb-2" />
                        No routes configured yet. Click <strong>Add Route</strong> to start.
                      </td>
                    </tr>
                  )}

                  {routes.map(r => (
                    editId === r.id
                      ? <EditRow key={r.id} route={r} adminKey={adminKey}
                          onSaved={() => { setEditId(null); fetchRoutes() }}
                          onCancel={() => setEditId(null)} />
                      : (
                        <tr key={r.id} className={`transition-colors hover:bg-gray-50/60 ${!r.is_active ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3.5 font-semibold text-gray-900 capitalize">{r.from_city}</td>
                          <td className="px-4 py-3.5 font-semibold text-gray-900 capitalize">{r.to_city}</td>
                          <td className="px-4 py-3.5 font-bold text-orange-600">{fmt(r.base_price)}</td>
                          <td className="px-4 py-3.5 text-gray-600">{fmt(r.per_bag_rate)}</td>
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => toggleActive(r)}
                              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                                r.is_active
                                  ? 'bg-green-50 text-green-700 hover:bg-green-100'
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}>
                              {r.is_active
                                ? <><ToggleRight className="h-3.5 w-3.5" /> Active</>
                                : <><ToggleLeft  className="h-3.5 w-3.5" /> Inactive</>}
                            </button>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setPreview(preview?.id === r.id ? null : r)}
                                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                                Preview
                              </button>
                              <button
                                onClick={() => { setEditId(r.id); setAdding(false); setErr('') }}
                                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                              <button
                                onClick={() => deleteRoute(r.id)}
                                disabled={deleting === r.id}
                                className="flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-50 disabled:opacity-50 transition-colors">
                                {deleting === r.id
                                  ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                                  : <Trash2 className="h-3 w-3" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                  ))}

                  {/* Add new route row */}
                  {adding && (
                    <AddRow
                      adminKey={adminKey}
                      onSaved={() => { setAdding(false); fetchRoutes() }}
                      onCancel={() => setAdding(false)}
                    />
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Price preview panel */}
        {preview && (
          <div className="mt-5 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-gray-800 capitalize">
                {preview.from_city} → {preview.to_city} — Price Breakdown
              </h3>
              <button onClick={() => setPreview(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Base {fmt(preview.base_price)} for 1–2 bags · {fmt(preview.per_bag_rate)} per extra bag · 5% GST included
            </p>
            <PricePreview base={preview.base_price} perBag={preview.per_bag_rate} />
          </div>
        )}

      </main>
    </>
  )
}
