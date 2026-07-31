'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Check, ToggleLeft, ToggleRight, Map,
} from 'lucide-react'

interface LrRoute {
  id:                    string
  from_city:             string
  to_city:                string
  from_branch_code:       string | null
  to_branch_code:         string | null
  gst_type:               string
  default_vehicle_type:   string | null
  standard_transit_days:  number | null
  distance_km:            number | null
  notes:                  string | null
  is_active:              boolean
  created_at:             string
}

interface RouteForm {
  from_city: string; to_city: string
  from_branch_code: string; to_branch_code: string
  gst_type: string
  default_vehicle_type: string
  standard_transit_days: string
  distance_km: string
}

const EMPTY_FORM: RouteForm = {
  from_city: '', to_city: '', from_branch_code: '', to_branch_code: '',
  gst_type: 'intrastate', default_vehicle_type: '', standard_transit_days: '', distance_km: '',
}

function RouteFields({ form, setForm }: { form: RouteForm; setForm: (f: (prev: RouteForm) => RouteForm) => void }) {
  const inp = 'w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
  return (
    <>
      <td className="px-3 py-2"><input value={form.from_city} onChange={e => setForm(f => ({ ...f, from_city: e.target.value }))} className={inp} placeholder="Mumbai" /></td>
      <td className="px-3 py-2"><input value={form.to_city} onChange={e => setForm(f => ({ ...f, to_city: e.target.value }))} className={inp} placeholder="Vadodara" /></td>
      <td className="px-3 py-2"><input value={form.from_branch_code} onChange={e => setForm(f => ({ ...f, from_branch_code: e.target.value }))} className={inp} placeholder="MUMBAI T2" /></td>
      <td className="px-3 py-2"><input value={form.to_branch_code} onChange={e => setForm(f => ({ ...f, to_branch_code: e.target.value }))} className={inp} placeholder="VADODARA STATION" /></td>
      <td className="px-3 py-2">
        <select value={form.gst_type} onChange={e => setForm(f => ({ ...f, gst_type: e.target.value }))} className={inp}>
          <option value="intrastate">Intrastate (CGST+SGST)</option>
          <option value="interstate">Interstate (IGST)</option>
        </select>
      </td>
      <td className="px-3 py-2"><input value={form.default_vehicle_type} onChange={e => setForm(f => ({ ...f, default_vehicle_type: e.target.value }))} className={inp} placeholder="Tempo" /></td>
      <td className="px-3 py-2"><input type="number" min="0" value={form.standard_transit_days} onChange={e => setForm(f => ({ ...f, standard_transit_days: e.target.value }))} className={inp} placeholder="1" /></td>
    </>
  )
}

function EditRow({ route, adminKey, onSaved, onCancel }: { route: LrRoute; adminKey: string; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<RouteForm>({
    from_city: route.from_city, to_city: route.to_city,
    from_branch_code: route.from_branch_code ?? '', to_branch_code: route.to_branch_code ?? '',
    gst_type: route.gst_type, default_vehicle_type: route.default_vehicle_type ?? '',
    standard_transit_days: route.standard_transit_days != null ? String(route.standard_transit_days) : '',
    distance_km: route.distance_km != null ? String(route.distance_km) : '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!form.from_city || !form.to_city) { setErr('From/To city are required'); return }
    setSaving(true); setErr('')
    const res = await fetch(`/api/admin/lr-routes/${route.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        from_city: form.from_city, to_city: form.to_city,
        from_branch_code: form.from_branch_code || null, to_branch_code: form.to_branch_code || null,
        gst_type: form.gst_type, default_vehicle_type: form.default_vehicle_type || null,
        standard_transit_days: form.standard_transit_days ? Number(form.standard_transit_days) : null,
        distance_km: form.distance_km ? Number(form.distance_km) : null,
      }),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Save failed'); setSaving(false); return }
    onSaved()
  }

  return (
    <tr className="bg-orange-50">
      <RouteFields form={form} setForm={setForm} />
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onCancel} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
        {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      </td>
    </tr>
  )
}

function AddRow({ adminKey, onSaved, onCancel }: { adminKey: string; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<RouteForm>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!form.from_city || !form.to_city) { setErr('From/To city are required'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/admin/lr-routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        from_city: form.from_city, to_city: form.to_city,
        from_branch_code: form.from_branch_code || null, to_branch_code: form.to_branch_code || null,
        gst_type: form.gst_type, default_vehicle_type: form.default_vehicle_type || null,
        standard_transit_days: form.standard_transit_days ? Number(form.standard_transit_days) : null,
        distance_km: form.distance_km ? Number(form.distance_km) : null,
      }),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Save failed'); setSaving(false); return }
    onSaved()
  }

  return (
    <tr className="bg-orange-50/60">
      <RouteFields form={form} setForm={setForm} />
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> {saving ? 'Adding…' : 'Add Route'}
          </button>
          <button onClick={onCancel} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
        {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      </td>
    </tr>
  )
}

export default function LrRoutesPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [routes,   setRoutes]   = useState<LrRoute[]>([])
  const [loading,  setLoading]  = useState(true)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [adding,   setAdding]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [err,      setErr]      = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchRoutes = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const res = await fetch(`/api/admin/lr-routes?key=${adminKey}`)
    if (res.ok) setRoutes((await res.json()).routes ?? [])
    setLoading(false)
  }, [adminKey])

  useEffect(() => { if (authed) fetchRoutes() }, [authed, fetchRoutes])

  async function toggleActive(route: LrRoute) {
    await fetch(`/api/admin/lr-routes/${route.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ is_active: !route.is_active }),
    })
    fetchRoutes()
  }

  async function deleteRoute(id: string) {
    if (!confirm('Delete this route? This cannot be undone.')) return
    setDeleting(id)
    const res = await fetch(`/api/admin/lr-routes/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
    if (!res.ok) { const d = await res.json(); setErr(d.error ?? 'Delete failed') }
    setDeleting(null)
    fetchRoutes()
  }

  if (!authed) return null

  return (
    <>
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">LR Route Master</h1>
            <p className="text-xs text-gray-400 mt-0.5">Configure Origin↔Destination pairs used when generating an LR — branch codes, default vehicle type, and GST treatment (CGST+SGST vs IGST).</p>
          </div>
          <button onClick={() => { setAdding(true); setEditId(null); setErr('') }}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
            <Plus className="h-4 w-4" /> Add Route
          </button>
        </div>
      </div>

      <main className="px-6 py-6">
        {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{err}</div>}

        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <span className="font-semibold">GST logic:</span> Intrastate routes (consignor/consignee in the same state) split tax as CGST 2.5% + SGST 2.5%. Interstate routes charge IGST 5% instead — same 5% total rate used across the app, applied automatically to any LR matched against this route.
        </div>

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
                    {['From', 'To', 'From Branch', 'To Branch', 'GST Type', 'Default Vehicle', 'Transit Days', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {routes.length === 0 && !adding && (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-sm text-gray-400">
                        <Map className="mx-auto h-8 w-8 text-gray-200 mb-2" />
                        No routes configured yet. Click <strong>Add Route</strong> to start.
                      </td>
                    </tr>
                  )}

                  {routes.map(r => (
                    editId === r.id
                      ? <EditRow key={r.id} route={r} adminKey={adminKey} onSaved={() => { setEditId(null); fetchRoutes() }} onCancel={() => setEditId(null)} />
                      : (
                        <tr key={r.id} className={`transition-colors hover:bg-gray-50/60 ${!r.is_active ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-3.5 font-semibold text-gray-900">{r.from_city}</td>
                          <td className="px-3 py-3.5 font-semibold text-gray-900">{r.to_city}</td>
                          <td className="px-3 py-3.5 text-gray-600 text-xs">{r.from_branch_code ?? '—'}</td>
                          <td className="px-3 py-3.5 text-gray-600 text-xs">{r.to_branch_code ?? '—'}</td>
                          <td className="px-3 py-3.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.gst_type === 'interstate' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                              {r.gst_type === 'interstate' ? 'IGST 5%' : 'CGST+SGST'}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-gray-600">{r.default_vehicle_type ?? '—'}</td>
                          <td className="px-3 py-3.5 text-gray-600">{r.standard_transit_days != null ? `${r.standard_transit_days}d` : '—'}</td>
                          <td className="px-3 py-3.5">
                            <button onClick={() => toggleActive(r)}
                              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${r.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                              {r.is_active ? <><ToggleRight className="h-3.5 w-3.5" /> Active</> : <><ToggleLeft className="h-3.5 w-3.5" /> Inactive</>}
                            </button>
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => { setEditId(r.id); setAdding(false); setErr('') }}
                                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                              <button onClick={() => deleteRoute(r.id)} disabled={deleting === r.id}
                                className="flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-50 disabled:opacity-50 transition-colors">
                                {deleting === r.id ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" /> : <Trash2 className="h-3 w-3" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                  ))}

                  {adding && <AddRow adminKey={adminKey} onSaved={() => { setAdding(false); fetchRoutes() }} onCancel={() => setAdding(false)} />}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
