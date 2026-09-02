'use client'

// BAGDROP — Branch Management (2026-09-02)
//
// Super-admin-only CRUD for the branches table (supabase/migrations/
// 20260902_branch_wise_lr.sql). Each branch's access_key powers
// lib/branch-auth.ts's backend-enforced branch-scoped permissions — a
// Branch Admin/Manager uses this key (in place of the shared admin/staff
// key) and can then only ever see/create LRs for that one branch, exactly
// per spec section 11. The key is shown in full exactly once, right after
// it's generated (on create, or via Rotate Key) — this page never
// displays an existing key again, same "shown once" convention as any
// other secret-token flow in this app.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, ToggleLeft, ToggleRight, Building2, X, Copy, Check, RefreshCw, KeyRound,
  FileText, Package, Clock, CheckCircle2, MapPinned, Loader2,
} from 'lucide-react'

interface BranchLrSummary {
  branch_id:        string
  total_lrs:        number
  total_bags:       number
  pending_count:    number
  delivered_count:  number
  cancelled_count:  number
  current_fy_count: number
}

interface Branch {
  id:                string
  branch_code:       string
  branch_name:       string
  city:              string
  state:             string | null
  address:           string | null
  pincode:           string | null
  gst_number:        string | null
  contact_number:    string | null
  email:             string | null
  branch_manager:    string | null
  is_active:         boolean
  lr_series_prefix:  string
  lr_include_fy:     boolean
  lr_start_number:   number
  lr_padding:        number
  has_access_key:    boolean
}

interface BranchForm {
  branch_code: string; branch_name: string; city: string; state: string
  address: string; pincode: string; gst_number: string
  contact_number: string; email: string; branch_manager: string
  lr_series_prefix: string; lr_include_fy: boolean
  lr_start_number: string; lr_padding: string
}

const EMPTY_FORM: BranchForm = {
  branch_code: '', branch_name: '', city: '', state: '',
  address: '', pincode: '', gst_number: '',
  contact_number: '', email: '', branch_manager: '',
  lr_series_prefix: '', lr_include_fy: true,
  lr_start_number: '1', lr_padding: '6',
}

// Live example of the LR number format this config produces — helps the
// founder see exactly what MUM/2026-27/LR/000001 vs MUM-LR-000001 means
// before saving, rather than guessing from the raw field names.
function formatExample(prefix: string, includeFy: boolean, padding: string, startNumber: string) {
  const p = (prefix || 'XXX').toUpperCase()
  const pad = Math.max(4, Math.min(10, parseInt(padding, 10) || 6))
  const seq = String(parseInt(startNumber, 10) || 1).padStart(pad, '0')
  const now = new Date()
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const fyLabel = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`
  return includeFy ? `${p}/${fyLabel}/LR/${seq}` : `${p}-LR-${seq}`
}

// ── Add/Edit modal ────────────────────────────────────────────────
function BranchModal({
  branch, adminKey, onClose, onSaved, onCreatedKey,
}: {
  branch: Branch | null; adminKey: string; onClose: () => void
  onSaved: () => void; onCreatedKey: (branchName: string, key: string) => void
}) {
  const isEdit = !!branch
  const [form, setForm] = useState<BranchForm>(branch ? {
    branch_code: branch.branch_code, branch_name: branch.branch_name, city: branch.city,
    state: branch.state ?? '', address: branch.address ?? '', pincode: branch.pincode ?? '',
    gst_number: branch.gst_number ?? '', contact_number: branch.contact_number ?? '', email: branch.email ?? '',
    branch_manager: branch.branch_manager ?? '',
    lr_series_prefix: branch.lr_series_prefix, lr_include_fy: branch.lr_include_fy,
    lr_start_number: String(branch.lr_start_number), lr_padding: String(branch.lr_padding),
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = <K extends keyof BranchForm>(key: K, value: BranchForm[K]) => setForm(f => ({ ...f, [key]: value }))

  async function save() {
    if (!form.branch_code.trim() || !form.branch_name.trim() || !form.city.trim()) {
      setErr('Branch Code, Branch Name, and City are required'); return
    }
    setSaving(true); setErr('')

    const payload = {
      branch_code: form.branch_code.trim(), branch_name: form.branch_name.trim(), city: form.city.trim(),
      state: form.state.trim(), address: form.address.trim(), pincode: form.pincode.trim(),
      gst_number: form.gst_number.trim(), contact_number: form.contact_number.trim(), email: form.email.trim(),
      branch_manager: form.branch_manager.trim(),
      lr_series_prefix: form.lr_series_prefix.trim() || form.branch_code.trim(),
      lr_include_fy: form.lr_include_fy,
      lr_start_number: Number(form.lr_start_number) || 1,
      lr_padding: Number(form.lr_padding) || 6,
    }

    const res = await fetch(isEdit ? `/api/admin/branches/${branch!.id}` : '/api/admin/branches', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Save failed'); setSaving(false); return }

    if (!isEdit && d.branch?.access_key) {
      onCreatedKey(d.branch.branch_name, d.branch.access_key)
    }
    onSaved()
  }

  const inp = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
  const lbl = 'mb-1 block text-xs font-semibold text-gray-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{isEdit ? `Edit ${branch!.branch_name}` : 'Add Branch'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{err}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Branch Code *</label>
            <input className={inp} value={form.branch_code} onChange={e => set('branch_code', e.target.value.toUpperCase())} placeholder="MUM" maxLength={10} />
          </div>
          <div>
            <label className={lbl}>Branch Name *</label>
            <input className={inp} value={form.branch_name} onChange={e => set('branch_name', e.target.value)} placeholder="Mumbai Branch" />
          </div>
          <div>
            <label className={lbl}>City *</label>
            <input className={inp} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Mumbai" />
          </div>
          <div>
            <label className={lbl}>State</label>
            <input className={inp} value={form.state} onChange={e => set('state', e.target.value)} placeholder="Maharashtra" />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Address</label>
            <input className={inp} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Branch address" />
          </div>
          <div>
            <label className={lbl}>Pincode</label>
            <input className={inp} value={form.pincode} onChange={e => set('pincode', e.target.value)} />
          </div>
          <div>
            <label className={lbl}>GST Number</label>
            <input className={inp} value={form.gst_number} onChange={e => set('gst_number', e.target.value.toUpperCase())} placeholder="If applicable" />
          </div>
          <div>
            <label className={lbl}>Contact Number</label>
            <input className={inp} value={form.contact_number} onChange={e => set('contact_number', e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input className={inp} value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Branch Manager</label>
            <input className={inp} value={form.branch_manager} onChange={e => set('branch_manager', e.target.value)} />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50/40 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-orange-500">LR Numbering</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>LR Prefix</label>
              <input className={inp} value={form.lr_series_prefix} onChange={e => set('lr_series_prefix', e.target.value.toUpperCase())} placeholder={form.branch_code || 'MUM'} />
            </div>
            <div>
              <label className={lbl}>Padding (digits)</label>
              <input className={inp} type="number" min={4} max={10} value={form.lr_padding} onChange={e => set('lr_padding', e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <button type="button" onClick={() => set('lr_include_fy', !form.lr_include_fy)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                {form.lr_include_fy ? <ToggleRight className="h-5 w-5 text-orange-500" /> : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                Include Financial Year
              </button>
            </div>
            {!isEdit && (
              <div>
                <label className={lbl}>Starting Number</label>
                <input className={inp} type="number" min={1} value={form.lr_start_number} onChange={e => set('lr_start_number', e.target.value)} />
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            First LR will look like: <span className="font-mono font-semibold text-gray-800">{formatExample(form.lr_series_prefix || form.branch_code, form.lr_include_fy, form.lr_padding, form.lr_start_number)}</span>
          </p>
          {isEdit && <p className="mt-1 text-[11px] text-gray-400">Starting Number only applies when a branch is first created — the running sequence carries over automatically if you rename the prefix later.</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Branch'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── "Copy this key now" callout — shown once after create/rotate ──
function KeyRevealModal({ branchName, accessKey, onClose }: { branchName: string; accessKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-orange-500" />
          <h3 className="text-base font-bold text-gray-900">{branchName} — Access Key</h3>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Give this key to the branch's staff to use in place of the shared admin key — it only grants access to <strong>{branchName}</strong>'s own LRs. It won't be shown again after you close this — copy it now.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <code className="flex-1 truncate text-xs text-gray-800">{accessKey}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(accessKey); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="shrink-0 rounded-md border border-gray-200 bg-white p-1.5 hover:bg-gray-50">
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
          </button>
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-600">
          I've copied it — Done
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function BranchesPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading,  setLoading]  = useState(true)
  const [modalBranch, setModalBranch] = useState<Branch | null | 'new'>(null)
  const [keyReveal, setKeyReveal] = useState<{ branchName: string; key: string } | null>(null)
  const [err, setErr] = useState('')

  // Branch-Wise LR summary (v1, lightweight) — spec section 10: Total LRs,
  // Bag Count, Pending vs Delivered per branch. Fetched separately from the
  // branch list itself so a slow/failed aggregate never blocks the core
  // CRUD table from rendering.
  const [lrSummary, setLrSummary] = useState<Record<string, BranchLrSummary>>({})
  const [summaryFy, setSummaryFy] = useState('')
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchBranches = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const res = await fetch(`/api/admin/branches?key=${adminKey}`)
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Failed to load branches'); setLoading(false); return }
    setBranches(d.branches ?? [])
    setLoading(false)
  }, [adminKey])

  const fetchLrSummary = useCallback(async () => {
    if (!adminKey) return
    try {
      const res = await fetch(`/api/admin/branches/lr-summary?key=${adminKey}`)
      if (!res.ok) return
      const d = await res.json()
      setSummaryFy(d.financial_year ?? '')
      const map: Record<string, BranchLrSummary> = {}
      for (const row of d.summary ?? []) map[row.branch_id] = row
      setLrSummary(map)
    } catch { /* non-fatal — summary column just shows dashes */ }
  }, [adminKey])

  useEffect(() => { if (authed) { fetchBranches(); fetchLrSummary() } }, [authed, fetchBranches, fetchLrSummary])

  async function toggleActive(branch: Branch) {
    await fetch(`/api/admin/branches/${branch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ is_active: !branch.is_active }),
    })
    fetchBranches()
  }

  // "Add all branch location as per our all inquiry" (2026-09-02) — scans
  // leads.from_city for every pickup city ever used across all inquiries
  // (not just confirmed bookings) and creates a branch for each one that
  // doesn't already have a match, so the LR form's branch dropdown covers
  // every city Bagdrop has actually taken inquiries from. Preview-then-
  // confirm, same convention as the Payments tab's Fix Duplicate Payments.
  async function seedFromInquiries() {
    setSeeding(true)
    try {
      const previewRes = await fetch(`/api/admin/branches/seed-from-inquiries?key=${adminKey}`, {
        headers: { 'x-admin-key': adminKey },
      })
      const preview = await previewRes.json().catch(() => ({}))
      if (!previewRes.ok) { alert(preview.error ?? 'Scan failed'); return }

      type PreviewGroup = { key: string; label: string; count: number }
      const groups = (preview.branches ?? []) as PreviewGroup[]
      if (groups.length === 0) {
        alert('Every city seen across your inquiries already has a matching branch — nothing to add.')
        return
      }

      const summary = groups.map(g => `• ${g.label} (${g.count} inquir${g.count === 1 ? 'y' : 'ies'})`).join('\n')
      const confirmed = window.confirm(
        `Found ${groups.length} branch location(s) used in inquiries with no branch yet:\n\n${summary}\n\n` +
        `Each will be added as an active branch (code + name + city only — address/GST/contact stay blank until you fill them in). Proceed?`
      )
      if (!confirmed) return

      const res = await fetch('/api/admin/branches/seed-from-inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({}),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) { alert(result.error ?? 'Add failed'); return }

      type CreatedRow = { branch_name: string }
      type FailedRow  = { key: string; error: string }
      const createdList = (result.created ?? []) as CreatedRow[]
      const failedList  = (result.failed  ?? []) as FailedRow[]
      alert(
        `Added ${createdList.length} branch(es).` +
        (failedList.length ? ` ${failedList.length} failed — check server logs.` : '')
      )
      fetchBranches()
      fetchLrSummary()
    } catch {
      alert('Network error — please try again')
    } finally {
      setSeeding(false)
    }
  }

  async function rotateKey(branch: Branch) {
    if (!confirm(`Generate a new access key for ${branch.branch_name}? The old key will stop working immediately.`)) return
    const res = await fetch(`/api/admin/branches/${branch.id}/rotate-key`, {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Rotate failed'); return }
    setKeyReveal({ branchName: branch.branch_name, key: d.access_key })
    fetchBranches()
  }

  if (!authed) return null

  return (
    <>
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Branch Management</h1>
            <p className="mt-0.5 text-xs text-gray-400">Each branch gets its own independent LR numbering sequence and a scoped access key.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={seedFromInquiries} disabled={seeding}
              title="Scans every inquiry's pickup city and adds a branch for any city that doesn't have one yet"
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-60">
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinned className="h-4 w-4" />}
              Add Locations from Inquiries
            </button>
            <button onClick={() => setModalBranch('new')}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors">
              <Plus className="h-4 w-4" /> Add Branch
            </button>
          </div>
        </div>
      </div>

      <main className="px-6 py-6">
        {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{err}</div>}

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            </div>
          ) : branches.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              <Building2 className="mx-auto mb-2 h-8 w-8 text-gray-200" />
              No branches yet. Click <strong>Add Branch</strong> to create your first one — LRs will keep using the shared global series until a branch's city matches a booking's pickup city.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Branch</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">City</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Manager</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">LR Format</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">LR Activity{summaryFy ? ` (FY ${summaryFy})` : ''}</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {branches.map(b => (
                    <tr key={b.id} className={`transition-colors hover:bg-gray-50/60 ${!b.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3.5 font-mono font-bold text-orange-600">{b.branch_code}</td>
                      <td className="px-4 py-3.5 font-semibold text-gray-900">{b.branch_name}</td>
                      <td className="px-4 py-3.5 text-gray-600">{b.city}</td>
                      <td className="px-4 py-3.5 text-gray-600">{b.branch_manager || '—'}</td>
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-500">{formatExample(b.lr_series_prefix, b.lr_include_fy, String(b.lr_padding), String(b.lr_start_number))}</td>
                      <td className="px-4 py-3.5">
                        {lrSummary[b.id] ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                            <span className="flex items-center gap-1" title="Total LRs">
                              <FileText className="h-3 w-3 text-gray-400" /> {lrSummary[b.id].total_lrs}
                            </span>
                            <span className="flex items-center gap-1" title="Total bags">
                              <Package className="h-3 w-3 text-gray-400" /> {lrSummary[b.id].total_bags}
                            </span>
                            <span className="flex items-center gap-1 text-amber-600" title="Pending (generated/dispatched/in transit)">
                              <Clock className="h-3 w-3" /> {lrSummary[b.id].pending_count}
                            </span>
                            <span className="flex items-center gap-1 text-green-600" title="Delivered">
                              <CheckCircle2 className="h-3 w-3" /> {lrSummary[b.id].delivered_count}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => toggleActive(b)}
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                            b.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>
                          {b.is_active ? <><ToggleRight className="h-3.5 w-3.5" /> Active</> : <><ToggleLeft className="h-3.5 w-3.5" /> Inactive</>}
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setModalBranch(b)}
                            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50">
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                          <button onClick={() => rotateKey(b)} title="Generate a new access key for this branch"
                            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50">
                            <RefreshCw className="h-3 w-3" /> {b.has_access_key ? 'Rotate Key' : 'Generate Key'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {modalBranch && (
        <BranchModal
          branch={modalBranch === 'new' ? null : modalBranch}
          adminKey={adminKey}
          onClose={() => setModalBranch(null)}
          onSaved={() => { setModalBranch(null); fetchBranches() }}
          onCreatedKey={(branchName, key) => setKeyReveal({ branchName, key })}
        />
      )}

      {keyReveal && (
        <KeyRevealModal branchName={keyReveal.branchName} accessKey={keyReveal.key} onClose={() => setKeyReveal(null)} />
      )}
    </>
  )
}
