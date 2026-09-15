'use client'

// BAGDROP — Route Master / Trip Sheet Templates (founder spec
// BAGDROP-TRIPSHEET-ROUTE-TEMPLATE-001, 2026-09-15).
//
// Lets an admin configure a route's standard operations (Pickup, Middle
// Mile, Delivery, Packing, Handling, Airport Delivery, ...) ONCE — vendor,
// from/to, rate (fixed or per-bag), which date it defaults to, whether it
// should auto-notify the vendor. The New Trip Sheet wizard then generates
// a full set of Trip Expenses from this with just "select route + enter
// bags" (see app/api/admin/trip-sheets/[id]/apply-route-template/route.ts).
//
// Editing a route here only ever affects FUTURE trip sheets — historical
// ones snapshot the values at creation time and are never recalculated
// from a changed template (see the schema migration's module comment).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { normalizeCity } from '@/lib/city-normalize'
import {
  Route as RouteIcon, Plus, Search, Pencil, Archive, RotateCcw, X, Save, Loader2,
  ChevronDown, ChevronUp, Trash2, GripVertical, Copy, DownloadCloud, Layers,
} from 'lucide-react'

// Must match lib/vendor-notifications.ts's OperationCategory / CATEGORY_LABEL
// exactly (same duplication convention already used by the New Trip Sheet
// wizard and the Trip Sheet detail page for this constant).
const CATEGORY_LABEL: Record<string, string> = {
  pickup:           'Pickup',
  middle_mile:      'Middle Mile',
  delivery:         'Delivery',
  handling:         'Handling',
  airport_delivery: 'Airport Delivery',
  other:            'Other',
}
const CATEGORY_ORDER = ['pickup', 'middle_mile', 'delivery', 'handling', 'airport_delivery', 'other']

const DATE_RULE_LABEL: Record<string, string> = {
  pickup_date:   'Booking Pickup Date',
  delivery_date: 'Booking Delivery Date',
  none:          '— (blank, fill in per trip)',
}

interface VendorLite { id: string; vendor_id: string; vendor_name: string }

interface RouteOperation {
  id?:                    string   // absent = not yet saved to the server
  sequence:               number
  expense_type:           string
  mode:                   string
  operation_category:     string
  vendor_id:              string | null
  from_location:          string
  to_location:            string
  rate_type:              'fixed' | 'per_bag'
  rate:                   string   // kept as string while editing, parsed on save
  date_rule:               'pickup_date' | 'delivery_date' | 'none'
  notification_required:  boolean
  description:            string
}

interface RouteTemplate {
  id:          string
  route_name:  string
  from_city:   string
  to_city:     string
  status:      'active' | 'inactive'
  notes:       string | null
  created_at:  string
  route_template_operations?: (RouteOperation & { id: string; vendors?: { vendor_name: string; vendor_id: string } | null })[]
}

// A brand-new operation row previously always defaulted to Category
// "Other" (regardless of position), which is why the very first row — even
// though its label was typed as "Pickup" — silently stayed filed under
// Other unless the admin remembered to change the dropdown by hand. A
// route's operations are overwhelmingly built in the same real-world
// order (Pickup, then Middle Mile, then Delivery, then Handling, then
// Airport Delivery), so each new row now guesses the next category in that
// sequence instead — 6th and later rows fall back to Other, which is
// exactly where a one-off extra like Packing Charges belongs. Category
// auto-fills the Expense Label too (same rule as changing the dropdown by
// hand), so a fresh route with the standard 5 operations needs zero manual
// category selection at all.
function emptyOperation(sequence: number): RouteOperation {
  const category = CATEGORY_ORDER[Math.min(sequence, CATEGORY_ORDER.length - 1)]
  return {
    sequence, expense_type: CATEGORY_LABEL[category], mode: '', operation_category: category,
    vendor_id: null, from_location: '', to_location: '',
    rate_type: 'fixed', rate: '0', date_rule: 'none',
    notification_required: true, description: '',
  }
}

function Field({ label, value, onChange, placeholder = '', className = '' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-gray-500">{label}</label>
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
    </div>
  )
}

export default function RouteTemplatesPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)

  const [routes,   setRoutes]   = useState<RouteTemplate[]>([])
  const [vendors,  setVendors]  = useState<VendorLite[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  // Founder request, 2026-09-15: "show my all basic frequent routes
  // first" — real inquiry counts per route (direction/alias-agnostic),
  // from GET /api/admin/route-templates/frequency. Empty until loaded;
  // routes with no matching count just sort to the bottom (0), same as
  // a freshly Imported-from-Route-Pricing route that has no real
  // inquiries yet.
  const [routeFrequency, setRouteFrequency] = useState<Record<string, number>>({})

  // Create/edit form — null routeId means "creating a new route"
  const [editingRouteId, setEditingRouteId] = useState<string | null | 'new'>(null)
  const [routeName, setRouteName] = useState('')
  const [fromCity,  setFromCity]  = useState('')
  const [toCity,    setToCity]    = useState('')
  const [notes,     setNotes]     = useState('')
  // Route Name defaults to "From City → To City" as you type them — that
  // was the exact duplicate typing the founder flagged (typing "Vadodara →
  // Mumbai" by hand right after typing Vadodara/Mumbai into the two fields
  // next to it). Still a real, editable field — set routeNameTouched once
  // the admin types something into it directly, so a genuinely custom name
  // (e.g. "Vadodara Express — Premium") never gets silently overwritten.
  const [routeNameTouched, setRouteNameTouched] = useState(false)
  // Set only when the current draft came from "Duplicate" — drives the
  // reminder banner below the From/To City fields (per-operation From/To
  // isn't auto-updated just because the route-level cities changed).
  const [duplicatedFromName, setDuplicatedFromName] = useState<string | null>(null)
  const [operations, setOperations] = useState<RouteOperation[]>([])
  const [removedOperationIds, setRemovedOperationIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchRoutes = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = `?key=${adminKey}&include_operations=true&status=${showInactive ? 'all' : 'active'}${search ? '&search=' + encodeURIComponent(search) : ''}`
    const res = await fetch('/api/admin/route-templates' + qs)
    if (res.ok) setRoutes((await res.json()).route_templates ?? [])
    setLoading(false)
  }, [adminKey, search, showInactive])

  useEffect(() => { if (authed) fetchRoutes() }, [authed, fetchRoutes])

  useEffect(() => {
    if (!authed || !adminKey) return
    fetch(`/api/admin/route-templates/frequency?key=${adminKey}`)
      .then(r => r.ok ? r.json() : { counts: {} })
      .then(d => setRouteFrequency(d.counts ?? {}))
      .catch(() => {})
  }, [authed, adminKey])

  // Real inquiry count for a route, direction/alias-agnostic — same
  // normalized key the frequency endpoint groups leads by.
  const frequencyFor = useCallback((r: RouteTemplate) => {
    const key = [normalizeCity(r.from_city), normalizeCity(r.to_city)].sort().join('|')
    return routeFrequency[key] ?? 0
  }, [routeFrequency])

  // Busiest routes first; ties broken alphabetically so the order stays
  // stable and predictable rather than shuffling on every reload.
  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => {
      const diff = frequencyFor(b) - frequencyFor(a)
      return diff !== 0 ? diff : a.route_name.localeCompare(b.route_name)
    })
  }, [routes, frequencyFor])

  // Founder request, 2026-09-15: bulk-create a Route Template shell for
  // every from/to city pair Bagdrop already prices in Route Pricing,
  // instead of retyping city names one route at a time. Safe to click
  // again later after adding new Route Pricing rows — already-covered
  // pairs are skipped, not duplicated.
  async function importFromPricing() {
    setImporting(true); setImportMsg('')
    try {
      const res = await fetch('/api/admin/route-templates/import-from-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ active_only: true }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setImportMsg('Error: ' + (d.error ?? 'Import failed')); return }
      setImportMsg(
        d.created > 0
          ? `Created ${d.created} new route${d.created !== 1 ? 's' : ''} (${d.skipped} already existed) — fill in vendor operations for each below.`
          : `No new routes to import — all ${d.skipped} Route Pricing routes already have a template.`
      )
      fetchRoutes()
    } catch {
      setImportMsg('Error: network error, please try again')
    } finally {
      setImporting(false)
    }
  }

  // Founder request, 2026-09-15: "add all 6 operation with specific
  // location according to all operation just like vadodara-to-mumbai
  // route template with 6 operations" — bulk-adds the same 6-operation
  // skeleton (Pickup/Middle Mile/Delivery/Handling/Airport Delivery/
  // Other) to every route template that has none yet, with From/To
  // already set to that route's own cities. Vendor and Rate are left
  // blank/₹0 — those are real facts specific to each corridor that only
  // the founder can supply, not something to invent from the Vadodara→
  // Mumbai example. Never touches a route that already has operations.
  async function addStandardOperations() {
    if (!confirm('Add the standard 6 operations (Pickup, Middle Mile, Delivery, Handling, Airport Delivery, Other) to every route template that has none yet? Vendor and Rate will need to be filled in per route afterward.')) return
    setImporting(true); setImportMsg('')
    try {
      const res = await fetch('/api/admin/route-templates/add-standard-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({}),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setImportMsg('Error: ' + (d.error ?? 'Failed to add operations')); return }
      setImportMsg(
        d.routes_updated > 0
          ? `Added 6 operations each to ${d.routes_updated} route${d.routes_updated !== 1 ? 's' : ''} (${d.operations_created} total) — fill in the real Vendor and Rate for each below.`
          : 'No routes needed operations — every route template already has some.'
      )
      fetchRoutes()
    } catch {
      setImportMsg('Error: network error, please try again')
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    if (!authed || !adminKey) return
    fetch(`/api/admin/vendors?key=${adminKey}`).then(r => r.json()).then(d => setVendors(d.vendors ?? [])).catch(() => {})
  }, [authed, adminKey])

  function startCreate() {
    setEditingRouteId('new')
    setRouteName(''); setFromCity(''); setToCity(''); setNotes('')
    setRouteNameTouched(false)
    setDuplicatedFromName(null)
    setOperations([emptyOperation(0)])
    setRemovedOperationIds([])
    setSaveErr('')
  }

  function startEdit(r: RouteTemplate) {
    setEditingRouteId(r.id)
    setRouteName(r.route_name); setFromCity(r.from_city); setToCity(r.to_city); setNotes(r.notes ?? '')
    setDuplicatedFromName(null)
    // Treat an existing route's saved name as intentional — never let
    // further From/To City edits during this session silently overwrite it.
    setRouteNameTouched(true)
    setOperations(
      (r.route_template_operations ?? []).map(op => ({
        id: op.id, sequence: op.sequence, expense_type: op.expense_type, mode: op.mode ?? '',
        operation_category: op.operation_category, vendor_id: op.vendor_id,
        from_location: op.from_location ?? '', to_location: op.to_location ?? '',
        rate_type: op.rate_type, rate: String(op.rate), date_rule: op.date_rule,
        notification_required: op.notification_required, description: op.description ?? '',
      }))
    )
    setRemovedOperationIds([])
    setSaveErr('')
  }

  // Duplicate an existing route as the starting point for a new one —
  // founder request, 2026-09-15: build out the busiest corridors first
  // (e.g. clone "Vadodara → Mumbai" as the base for "Ahmedabad → Mumbai")
  // without retyping all 6 operations, vendors and rates from scratch.
  // Copies every operation across (minus its id, so Save creates brand-new
  // rows — this never touches the source route or any trip sheet already
  // generated from it). From/To City start out matching the source route
  // so you can see exactly what's being copied; change them to the new
  // corridor, then double-check each operation's own From/To (Pickup/
  // Delivery legs especially) since those don't auto-update just because
  // the route-level cities changed.
  function duplicateRoute(r: RouteTemplate) {
    setEditingRouteId('new')
    setRouteName(`${r.from_city} → ${r.to_city}`)
    setFromCity(r.from_city)
    setToCity(r.to_city)
    setRouteNameTouched(false)
    setDuplicatedFromName(r.route_name)
    setNotes(r.notes ?? '')
    setOperations(
      (r.route_template_operations ?? []).map(op => ({
        sequence: op.sequence, expense_type: op.expense_type, mode: op.mode ?? '',
        operation_category: op.operation_category, vendor_id: op.vendor_id,
        from_location: op.from_location ?? '', to_location: op.to_location ?? '',
        rate_type: op.rate_type, rate: String(op.rate), date_rule: op.date_rule,
        notification_required: op.notification_required, description: op.description ?? '',
      }))
    )
    setRemovedOperationIds([])
    setSaveErr('')
  }

  function cancelEdit() {
    setEditingRouteId(null)
    setDuplicatedFromName(null)
  }

  function addOperationRow() {
    setOperations(ops => [
      ...ops,
      // Prefill From/To from the route's own From City/To City — most
      // operations on a route just move between those same two points, so
      // this saves retyping the same city names on every row; still fully
      // editable per operation for the rare leg that differs (e.g. a
      // Pickup that starts somewhere other than the route's From City).
      { ...emptyOperation(ops.length), from_location: fromCity, to_location: toCity },
    ])
  }

  function removeOperationRow(index: number) {
    setOperations(ops => {
      const target = ops[index]
      if (target.id) setRemovedOperationIds(ids => [...ids, target.id!])
      return ops.filter((_, i) => i !== index)
    })
  }

  function moveOperationRow(index: number, dir: -1 | 1) {
    setOperations(ops => {
      const next = [...ops]
      const j = index + dir
      if (j < 0 || j >= next.length) return ops
      ;[next[index], next[j]] = [next[j], next[index]]
      return next.map((op, i) => ({ ...op, sequence: i }))
    })
  }

  function updateOperation(index: number, patch: Partial<RouteOperation>) {
    setOperations(ops => ops.map((op, i) => i === index ? { ...op, ...patch } : op))
  }

  async function saveRoute() {
    if (!routeName.trim() || !fromCity.trim() || !toCity.trim()) {
      setSaveErr('Route Name, From City and To City are required.')
      return
    }
    setSaving(true); setSaveErr('')
    try {
      if (editingRouteId === 'new') {
        const res = await fetch('/api/admin/route-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({
            route_name: routeName.trim(), from_city: fromCity.trim(), to_city: toCity.trim(),
            notes: notes.trim() || undefined,
            operations: operations
              .filter(op => op.expense_type.trim())
              .map(op => ({ ...op, rate: Number(op.rate) || 0 })),
          }),
        })
        if (!res.ok) { const d = await res.json().catch(() => ({})); setSaveErr(d.error ?? 'Failed to create route'); setSaving(false); return }
      } else if (editingRouteId) {
        // Edit existing route: PATCH the route's own fields, then diff
        // operations — existing rows (have an id) PATCH, new rows (no id)
        // POST, rows the admin deleted from the local list DELETE.
        const res = await fetch(`/api/admin/route-templates/${editingRouteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ route_name: routeName.trim(), from_city: fromCity.trim(), to_city: toCity.trim(), notes: notes.trim() || null }),
        })
        if (!res.ok) { const d = await res.json().catch(() => ({})); setSaveErr(d.error ?? 'Failed to save route'); setSaving(false); return }

        await Promise.allSettled([
          ...operations.filter(op => op.expense_type.trim()).map(op => {
            const payload = { ...op, rate: Number(op.rate) || 0 }
            return op.id
              ? fetch(`/api/admin/route-templates/${editingRouteId}/operations/${op.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify(payload),
                })
              : fetch(`/api/admin/route-templates/${editingRouteId}/operations`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify(payload),
                })
          }),
          ...removedOperationIds.map(opId =>
            fetch(`/api/admin/route-templates/${editingRouteId}/operations/${opId}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
          ),
        ])
      }
      setEditingRouteId(null)
      setDuplicatedFromName(null)
      fetchRoutes()
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(r: RouteTemplate) {
    await fetch(`/api/admin/route-templates/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ status: r.status === 'active' ? 'inactive' : 'active' }),
    })
    fetchRoutes()
  }

  if (!authed) return null

  const isEditing = editingRouteId !== null

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <RouteIcon className="h-5 w-5 text-orange-500" /> Route Templates
          </h1>
          <p className="mt-0.5 text-sm text-gray-400">Configure a route&apos;s standard operations once — New Trip Sheet then just needs a route + bag count.</p>
        </div>
        {!isEditing && (
          <div className="flex items-center gap-2">
            <button onClick={importFromPricing} disabled={importing}
              title="Create a route template shell for every route already priced in Route Pricing"
              className="flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
              Import from Route Pricing
            </button>
            <button onClick={addStandardOperations} disabled={importing}
              title="Add the standard 6 operations (Pickup, Middle Mile, Delivery, Handling, Airport Delivery, Other) to every route that doesn't have any yet"
              className="flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              Add Standard 6 Operations
            </button>
            <button onClick={startCreate}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
              <Plus className="h-4 w-4" /> New Route Template
            </button>
          </div>
        )}
      </div>

      {importMsg && !isEditing && (
        <div className={`mb-4 rounded-xl border px-4 py-2.5 text-sm font-medium ${
          importMsg.startsWith('Error') ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
        }`}>
          {importMsg}
        </div>
      )}

      {isEditing ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <h4 className="mb-1 text-sm font-bold text-orange-700">
            {duplicatedFromName ? `Duplicate of "${duplicatedFromName}"` : editingRouteId === 'new' ? 'New Route Template' : 'Edit Route Template'}
          </h4>

          {duplicatedFromName && (
            <p className="mb-4 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs text-orange-700">
              All {operations.length} operations were copied from <strong>{duplicatedFromName}</strong>, including vendors and rates.
              Update the From/To City below for the new corridor, then check each operation&apos;s own From/To fields —
              those don&apos;t change automatically just because the route-level cities did.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="From City *"  value={fromCity}
              onChange={v => {
                setFromCity(v)
                if (!routeNameTouched) setRouteName(v || toCity ? `${v}${v && toCity ? ' → ' : ''}${toCity}` : '')
              }}
              placeholder="Vadodara" />
            <Field label="To City *"    value={toCity}
              onChange={v => {
                setToCity(v)
                if (!routeNameTouched) setRouteName(fromCity || v ? `${fromCity}${fromCity && v ? ' → ' : ''}${v}` : '')
              }}
              placeholder="Mumbai" />
            <Field label="Route Name" value={routeName}
              onChange={v => { setRouteName(v); setRouteNameTouched(true) }}
              placeholder="auto: From City → To City" />
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Route Name fills in automatically from From/To City — edit it only if you want something more specific (e.g. distinguishing two routes with the same cities).</p>
          <div className="mt-3">
            <Field label="Notes" value={notes} onChange={setNotes} placeholder="optional" />
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Operations</p>
              <button onClick={addOperationRow}
                className="flex items-center gap-1 rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-100">
                <Plus className="h-3.5 w-3.5" /> Add Operation
              </button>
            </div>

            <div className="space-y-3">
              {operations.map((op, i) => (
                <div key={op.id ?? `new-${i}`} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-gray-400">
                      <GripVertical className="h-3.5 w-3.5" />
                      <span className="text-xs font-semibold">#{i + 1}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveOperationRow(i, -1)} disabled={i === 0} title="Move up" className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => moveOperationRow(i, 1)} disabled={i === operations.length - 1} title="Move down" className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removeOperationRow(i)} title="Remove" className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>

                  {/* Simplified to the fields that actually drive something:
                      Category picks the operation bucket (also used by the
                      vendor-notification engine and the Operational Date
                      default below) and auto-fills the Expense Label so you
                      don't have to type "Pickup" twice — rename the label
                      afterwards only if you want something more specific,
                      like "Packing Charges" for a Handling-category row.
                      Mode and per-operation Description were dropped — mode
                      isn't shown anywhere in the Trip Sheet views, and notes
                      belong on the trip sheet's own Notes field instead. */}
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Category</label>
                      <select value={op.operation_category}
                        onChange={e => {
                          const newCat = e.target.value
                          const prevDefaultLabel = CATEGORY_LABEL[op.operation_category]
                          const shouldAutoFill = !op.expense_type.trim() || op.expense_type === prevDefaultLabel
                          updateOperation(i, {
                            operation_category: newCat,
                            ...(shouldAutoFill ? { expense_type: CATEGORY_LABEL[newCat] } : {}),
                          })
                        }}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
                        {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                      </select>
                    </div>
                    <Field label="Expense Label *" value={op.expense_type} onChange={v => updateOperation(i, { expense_type: v })} placeholder="e.g. Packing Charges" />
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Vendor</label>
                      <select value={op.vendor_id ?? ''} onChange={e => updateOperation(i, { vendor_id: e.target.value || null })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
                        <option value="">— In-house / none —</option>
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_id} — {v.vendor_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Operational Date Rule</label>
                      <select value={op.date_rule} onChange={e => updateOperation(i, { date_rule: e.target.value as RouteOperation['date_rule'] })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
                        {Object.entries(DATE_RULE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <Field label="From" value={op.from_location} onChange={v => updateOperation(i, { from_location: v })} />
                    <Field label="To"   value={op.to_location}   onChange={v => updateOperation(i, { to_location: v })} />
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Rate Type</label>
                      <select value={op.rate_type} onChange={e => updateOperation(i, { rate_type: e.target.value as 'fixed' | 'per_bag' })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400">
                        <option value="fixed">Fixed</option>
                        <option value="per_bag">Per Bag</option>
                      </select>
                    </div>
                    <Field label={op.rate_type === 'per_bag' ? 'Rate (₹ / bag)' : 'Rate (₹, fixed)'} value={op.rate} onChange={v => updateOperation(i, { rate: v.replace(/[^0-9.]/g, '') })} />
                  </div>

                  <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-600">
                    <input type="checkbox" checked={op.notification_required} onChange={e => updateOperation(i, { notification_required: e.target.checked })} />
                    Notify vendor automatically
                  </label>

                  {op.rate_type === 'per_bag' && (
                    <p className="mt-2 text-[11px] text-gray-400">
                      For 6 bags: 6 × ₹{op.rate || 0} = ₹{(6 * (Number(op.rate) || 0)).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {saveErr && <p className="mt-3 text-sm font-medium text-red-600">{saveErr}</p>}

          <div className="mt-5 flex gap-2">
            <button onClick={saveRoute} disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Route Template'}
            </button>
            <button onClick={cancelEdit} disabled={saving}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search route name or city…"
                className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive
            </label>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
          ) : routes.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
              <RouteIcon className="mx-auto h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No route templates yet — create your first one above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Busiest routes first (founder request, 2026-09-15) — ranked
                  by real inquiry count from GET /api/admin/route-templates/
                  frequency, direction/alias-agnostic (Vadodara = Baroda,
                  Mumbai→Baroda = Baroda→Mumbai). A route with no real
                  inquiries yet (e.g. one just bulk-imported from Route
                  Pricing) simply sorts to the bottom, not hidden. */}
              {sortedRoutes.map(r => {
                const freq = frequencyFor(r)
                return (
                <div key={r.id} className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${r.status === 'inactive' ? 'opacity-50' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-800">{r.route_name}</p>
                        {freq > 0 && (
                          <span title={`${freq} real inquir${freq === 1 ? 'y' : 'ies'} on this route`}
                            className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600">
                            {freq} inquir{freq === 1 ? 'y' : 'ies'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{r.from_city} → {r.to_city} · {(r.route_template_operations ?? []).length} operation{(r.route_template_operations ?? []).length === 1 ? '' : 's'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.status}</span>
                      <button onClick={() => startEdit(r)} title="Edit" className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-200 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => duplicateRoute(r)} title="Duplicate this route for a different location" className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-orange-50 hover:text-orange-500 hover:border-orange-200 transition-colors"><Copy className="h-3.5 w-3.5" /></button>
                      {r.status === 'active' ? (
                        <button onClick={() => toggleStatus(r)} title="Deactivate" className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"><Archive className="h-3.5 w-3.5" /></button>
                      ) : (
                        <button onClick={() => toggleStatus(r)} title="Activate" className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-green-50 hover:text-green-500 hover:border-green-200 transition-colors"><RotateCcw className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </div>
                  {(r.route_template_operations ?? []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(r.route_template_operations ?? []).map(op => (
                        <span key={op.id} className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
                          {op.expense_type} · {op.vendors?.vendor_name ?? 'In-house'} · {op.rate_type === 'per_bag' ? `₹${op.rate}/bag` : `₹${op.rate}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </main>
  )
}
