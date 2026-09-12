'use client'

// BAGDROP — Vendor Master (founder spec BAGDROP-VENDOR-AUTOMATION-001,
// 2026-09-12). Deliberately basic, per spec: only the 8 fields below, no
// vendor type/rating/bank details/pricing. Vendor IDs (VND-00001, ...) are
// always server-generated — never editable here.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users2, Plus, Search, Pencil, Archive, RotateCcw, X, Save, Loader2, Mail, CheckCircle,
} from 'lucide-react'

interface Vendor {
  id:           string
  vendor_id:    string
  vendor_name:  string
  company_name: string | null
  mobile:       string
  email:        string | null
  address:      string | null
  city:         string | null
  gst_number:   string | null
  archived_at:  string | null
  created_at:   string
}

const EMPTY_FORM = {
  vendor_name: '', company_name: '', mobile: '', email: '', address: '', city: '', gst_number: '',
}

// Must match lib/vendor-notifications.ts's OperationCategory / CATEGORY_LABEL exactly.
const CATEGORY_LABEL: Record<string, string> = {
  pickup:           'Pickup',
  middle_mile:      'Middle Mile Movement',
  delivery:         'Delivery',
  handling:         'Handling',
  airport_delivery: 'Airport Delivery',
  other:            'Operation (Other)',
}
const CATEGORY_ORDER = ['pickup', 'middle_mile', 'delivery', 'handling', 'airport_delivery', 'other']

interface TemplateRow {
  category:      string
  email_subject: string
  email_body:    string
}

function Field({ label, value, onChange, placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500">{label}</label>
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
    </div>
  )
}

export default function VendorsPage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [vendors,  setVendors]  = useState<Vendor[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm,     setAddForm]     = useState(EMPTY_FORM)
  const [saving,       setSaving]     = useState(false)
  const [saveErr,      setSaveErr]    = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm,  setEditForm]  = useState(EMPTY_FORM)

  // Notification Templates sub-tab (email wording only — see route file comment)
  const [page,      setPage]      = useState<'vendors' | 'templates'>('vendors')
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [tplLoading, setTplLoading] = useState(false)
  const [savingCategory, setSavingCategory] = useState<string | null>(null)
  const [savedCategory,  setSavedCategory]  = useState<string | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchVendors = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = `?key=${adminKey}${search ? '&search=' + encodeURIComponent(search) : ''}${showArchived ? '&include_archived=true' : ''}`
    const res = await fetch('/api/admin/vendors' + qs)
    if (res.ok) setVendors((await res.json()).vendors ?? [])
    setLoading(false)
  }, [adminKey, search, showArchived])

  useEffect(() => { if (authed) fetchVendors() }, [authed, fetchVendors])

  const fetchTemplates = useCallback(async () => {
    if (!adminKey) return
    setTplLoading(true)
    const res = await fetch(`/api/admin/vendor-notification-templates?key=${adminKey}`)
    if (res.ok) setTemplates((await res.json()).templates ?? [])
    setTplLoading(false)
  }, [adminKey])

  useEffect(() => { if (authed && page === 'templates' && templates.length === 0) fetchTemplates() }, [authed, page, templates.length, fetchTemplates])

  function updateTemplateField(category: string, field: 'email_subject' | 'email_body', value: string) {
    setTemplates(ts => ts.map(t => t.category === category ? { ...t, [field]: value } : t))
  }

  async function saveTemplate(t: TemplateRow) {
    setSavingCategory(t.category); setSavedCategory(null)
    const res = await fetch('/api/admin/vendor-notification-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(t),
    })
    if (res.ok) { setSavedCategory(t.category); setTimeout(() => setSavedCategory(null), 2500) }
    setSavingCategory(null)
  }

  async function addVendor() {
    setSaving(true); setSaveErr('')
    const res = await fetch('/api/admin/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(addForm),
    })
    if (res.ok) {
      setAddForm(EMPTY_FORM); setShowAddForm(false)
      fetchVendors()
    } else {
      const d = await res.json().catch(() => ({}))
      setSaveErr(d.error ?? 'Failed to add vendor')
    }
    setSaving(false)
  }

  function startEdit(v: Vendor) {
    setEditingId(v.id)
    setEditForm({
      vendor_name: v.vendor_name, company_name: v.company_name ?? '', mobile: v.mobile,
      email: v.email ?? '', address: v.address ?? '', city: v.city ?? '', gst_number: v.gst_number ?? '',
    })
  }

  async function saveEdit(id: string) {
    setSaving(true)
    await fetch(`/api/admin/vendors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(editForm),
    })
    setEditingId(null); setSaving(false)
    fetchVendors()
  }

  async function archiveVendor(id: string) {
    if (!confirm('Archive this vendor? Past trip expenses and notification history stay linked to it — it just stops showing up as a pickable vendor going forward.')) return
    await fetch(`/api/admin/vendors/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
    fetchVendors()
  }

  async function restoreVendor(id: string) {
    await fetch(`/api/admin/vendors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ restore: true }),
    })
    fetchVendors()
  }

  if (!authed) return null

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Users2 className="h-5 w-5 text-orange-500" /> Vendor Master
          </h1>
          <p className="mt-0.5 text-sm text-gray-400">Pickup, middle-mile, delivery, handling &amp; airport vendors — assigned to Trip Expenses for automatic notifications.</p>
        </div>
        {page === 'vendors' && (
          <button onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddForm ? 'Cancel' : 'Add Vendor'}
          </button>
        )}
      </div>

      <div className="mb-5 flex gap-1 rounded-xl bg-gray-100 p-1 max-w-sm">
        <button onClick={() => setPage('vendors')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${page === 'vendors' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Users2 className="h-3.5 w-3.5" /> Vendors
        </button>
        <button onClick={() => setPage('templates')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${page === 'templates' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Mail className="h-3.5 w-3.5" /> Notification Templates
        </button>
      </div>

      {page === 'templates' ? (
        <div>
          <p className="mb-4 text-xs text-gray-400">
            Email wording sent to vendors, per operation type. WhatsApp uses one fixed, Meta-approved template shared across
            all operations (no wording edits here — a template change needs fresh Meta approval), so only email is editable.
            Available variables: <code className="rounded bg-gray-100 px-1 py-0.5">{'{{vendor_name}}'}</code>{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5">{'{{customer_name}}'}</code>{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5">{'{{tracking_id}}'}</code>{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5">{'{{bags}}'}</code>{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5">{'{{from}}'}</code>{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5">{'{{to}}'}</code>{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5">{'{{operational_date}}'}</code>{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5">{'{{operational_time}}'}</code>
          </p>
          {tplLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
          ) : (
            <div className="space-y-4">
              {CATEGORY_ORDER.map(cat => {
                const t = templates.find(x => x.category === cat) ?? { category: cat, email_subject: '', email_body: '' }
                return (
                  <div key={cat} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-gray-800">{CATEGORY_LABEL[cat]}</h4>
                      <div className="flex items-center gap-2">
                        {savedCategory === cat && <span className="flex items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle className="h-3.5 w-3.5" /> Saved</span>}
                        <button onClick={() => saveTemplate(t)} disabled={savingCategory === cat}
                          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                          <Save className="h-3.5 w-3.5" /> {savingCategory === cat ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Email Subject</label>
                      <input value={t.email_subject} onChange={e => updateTemplateField(cat, 'email_subject', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Email Body</label>
                      <textarea value={t.email_body} rows={6} onChange={e => updateTemplateField(cat, 'email_body', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
      <>

      {showAddForm && (
        <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <h4 className="mb-4 text-sm font-bold text-orange-700">New Vendor</h4>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Vendor Name *"  value={addForm.vendor_name}  onChange={v => setAddForm(f => ({ ...f, vendor_name: v }))} placeholder="e.g. Vinod" />
            <Field label="Company Name"   value={addForm.company_name} onChange={v => setAddForm(f => ({ ...f, company_name: v }))} placeholder="e.g. Metro Express" />
            <Field label="Mobile Number *" value={addForm.mobile}      onChange={v => setAddForm(f => ({ ...f, mobile: v }))} placeholder="+91…" />
            <Field label="Email"          value={addForm.email}        onChange={v => setAddForm(f => ({ ...f, email: v }))} placeholder="optional" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Field label="Address"    value={addForm.address}    onChange={v => setAddForm(f => ({ ...f, address: v }))} />
            <Field label="City"       value={addForm.city}       onChange={v => setAddForm(f => ({ ...f, city: v }))} />
            <Field label="GST Number" value={addForm.gst_number} onChange={v => setAddForm(f => ({ ...f, gst_number: v }))} placeholder="optional" />
            <div className="flex items-end">
              <button onClick={addVendor} disabled={saving || !addForm.vendor_name.trim() || !addForm.mobile.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                <Plus className="h-4 w-4" /> {saving ? 'Adding…' : 'Add Vendor'}
              </button>
            </div>
          </div>
          {saveErr && <p className="mt-2 text-sm font-medium text-red-600">{saveErr}</p>}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor, company, ID, mobile, city…"
            className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
      ) : vendors.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <Users2 className="mx-auto h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No vendors yet — add your first one above.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Vendor ID', 'Vendor Name', 'Company', 'Mobile', 'Email', 'City', 'GST Number', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendors.map((v, i) => {
                  const isEditing = editingId === v.id
                  return isEditing ? (
                    <tr key={v.id} className="bg-orange-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{v.vendor_id}</td>
                      <td className="px-2 py-2"><input value={editForm.vendor_name} onChange={e => setEditForm(f => ({ ...f, vendor_name: e.target.value }))} className="w-full rounded-lg border border-orange-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" /></td>
                      <td className="px-2 py-2"><input value={editForm.company_name} onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" /></td>
                      <td className="px-2 py-2"><input value={editForm.mobile} onChange={e => setEditForm(f => ({ ...f, mobile: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" /></td>
                      <td className="px-2 py-2"><input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" /></td>
                      <td className="px-2 py-2"><input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" /></td>
                      <td className="px-2 py-2"><input value={editForm.gst_number} onChange={e => setEditForm(f => ({ ...f, gst_number: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" /></td>
                      <td className="px-2 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(v.id)} disabled={saving} title="Save" className="rounded-lg bg-orange-500 p-1.5 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"><Save className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingId(null)} title="Cancel" className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={v.id} className={`hover:bg-orange-50/30 transition-colors ${v.archived_at ? 'opacity-50' : ''} ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-orange-600">{v.vendor_id}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{v.vendor_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{v.company_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{v.mobile}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{v.email || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{v.city || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{v.gst_number || <span className="text-gray-300">—</span>}</td>
                      <td className="px-2 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(v)} title="Edit" className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-200 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                          {v.archived_at ? (
                            <button onClick={() => restoreVendor(v.id)} title="Restore" className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-green-50 hover:text-green-500 hover:border-green-200 transition-colors"><RotateCcw className="h-3.5 w-3.5" /></button>
                          ) : (
                            <button onClick={() => archiveVendor(v.id)} title="Archive" className="rounded-lg border border-gray-100 p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"><Archive className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}
    </main>
  )
}
