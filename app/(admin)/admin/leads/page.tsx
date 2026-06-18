'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, Search, RefreshCw, ChevronDown,
  Phone, Mail, MapPin, Calendar, Pencil, Trash2, X, Save,
  ArrowRight,
} from 'lucide-react'

interface Lead {
  id:               string
  name:             string
  phone:            string
  email:            string | null
  source:           string
  service_interest: string | null
  service_type:     string | null   // same field, kept in sync
  from_city:        string | null
  to_city:          string | null
  travel_date:      string | null
  bags_count:       number
  status:           string
  notes:            string | null
  assigned_to:      string | null
  created_at:       string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'New',       color: '#2563eb', bg: '#dbeafe' },
  contacted: { label: 'Contacted', color: '#d97706', bg: '#fef3c7' },
  qualified: { label: 'Qualified', color: '#7c3aed', bg: '#ede9fe' },
  converted: { label: 'Converted', color: '#16a34a', bg: '#dcfce7' },
  lost:      { label: 'Lost',      color: '#dc2626', bg: '#fee2e2' },
}

const SOURCE_LABELS: Record<string, string> = {
  manual:   'Manual',
  website:  'Website',
  referral: 'Referral',
  b2b:      'B2B',
  'walk-in': 'Walk-in',
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{ color: cfg.color, background: cfg.bg }}
      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold">
      {cfg.label}
    </span>
  )
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Lead Form (create / edit) ────────────────────────────────────
interface LeadForm {
  name: string; phone: string; email: string; source: string
  service_interest: string; from_city: string; to_city: string
  travel_date: string; bags_count: string; status: string; notes: string
}

const EMPTY_FORM: LeadForm = {
  name: '', phone: '', email: '', source: 'manual',
  service_interest: '', from_city: '', to_city: '',
  travel_date: '', bags_count: '1', status: 'new', notes: '',
}

function LeadModal({
  lead, adminKey, onSaved, onClose,
}: {
  lead?: Lead | null
  adminKey: string
  onSaved: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState<LeadForm>(
    lead
      ? {
          name: lead.name, phone: lead.phone, email: lead.email ?? '',
          source: lead.source,
          service_interest: lead.service_interest ?? lead.service_type ?? '',
          from_city: lead.from_city ?? '', to_city: lead.to_city ?? '',
          travel_date: lead.travel_date ? lead.travel_date.split('T')[0] : '',
          bags_count: String(lead.bags_count),
          status: lead.status, notes: lead.notes ?? '',
        }
      : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k: keyof LeadForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) { setErr('Name and phone are required'); return }
    setSaving(true); setErr('')
    const url    = lead ? `/api/admin/leads/${lead.id}` : '/api/admin/leads'
    const method = lead ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ ...form, bags_count: Number(form.bags_count) || 1 }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? 'Save failed'); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">{lead ? 'Edit Lead' : 'New Lead'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          <Field label="Full Name *"   value={form.name}   onChange={set('name')}   placeholder="Amit Shah" />
          <Field label="Phone *"       value={form.phone}  onChange={set('phone')}  placeholder="9876543210" />
          <Field label="Email"         value={form.email}  onChange={set('email')}  placeholder="amit@email.com" />
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Source</label>
            <select value={form.source} onChange={set('source')} className={sel}>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Service Interest</label>
            <select value={form.service_interest} onChange={set('service_interest')} className={sel}>
              <option value="">— Select —</option>
              <option value="airport-to-door">Airport → Doorstep</option>
              <option value="door-to-airport">Doorstep → Airport</option>
              <option value="intercity">Intercity</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Status</label>
            <select value={form.status} onChange={set('status')} className={sel}>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
          </div>
          <Field label="From City"    value={form.from_city}   onChange={set('from_city')}   placeholder="Mumbai" />
          <Field label="To City"      value={form.to_city}     onChange={set('to_city')}     placeholder="Ahmedabad" />
          <Field label="Travel Date"  value={form.travel_date} onChange={set('travel_date')} type="date" />
          <Field label="Bags Count"   value={form.bags_count}  onChange={set('bags_count')}  type="number" placeholder="1" />
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              placeholder="Any additional notes..." />
          </div>
        </div>
        {err && <p className="px-6 pb-2 text-xs text-red-500">{err}</p>}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

const sel = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white'

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-gray-600">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function LeadsPage() {
  const router    = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed,   setAuthed]   = useState(false)
  const [leads,    setLeads]    = useState<Lead[]>([])
  const [loading,  setLoading]  = useState(false)
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [modal,    setModal]    = useState<'create' | Lead | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchLeads = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = `?key=${adminKey}${filter !== 'all' ? '&status=' + filter : ''}${search ? '&search=' + encodeURIComponent(search) : ''}`
    const res = await fetch('/api/admin/leads' + qs)
    if (res.ok) setLeads((await res.json()).leads ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  useEffect(() => { if (authed) fetchLeads() }, [authed, fetchLeads])

  async function deleteLead(id: string) {
    if (!confirm('Delete this lead? This cannot be undone.')) return
    setDeleting(id)
    await fetch(`/api/admin/leads/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
    setDeleting(null)
    fetchLeads()
  }

  if (!authed) return null

  return (
    <>
      {modal && (
        <LeadModal
          lead={modal === 'create' ? null : modal as Lead}
          adminKey={adminKey}
          onSaved={() => { setModal(null); fetchLeads() }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Page header */}
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Leads</h1>
            <p className="mt-0.5 text-sm text-gray-400">{leads.length} total leads</p>
          </div>
          <button
            onClick={() => setModal('create')}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Lead
          </button>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, phone, or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
          <div className="relative">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                <option key={v} value={v}>{c.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchLeads} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading leads…</div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Users className="mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-400">No leads yet. Add your first lead.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Name', 'Phone', 'Service', 'Route', 'Bags', 'Date', 'Source', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">{lead.name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-orange-500">
                          <Phone className="h-3 w-3" />{lead.phone}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {(() => {
                          const s = lead.service_type ?? lead.service_interest
                          if (!s) return '—'
                          return s.replace('airport-to-door','Arpt→Door').replace('door-to-airport','Door→Arpt').replace('intercity','Intercity')
                        })()}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {lead.from_city && lead.to_city ? `${lead.from_city} → ${lead.to_city}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 font-medium">{lead.bags_count}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(lead.travel_date)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{SOURCE_LABELS[lead.source] ?? lead.source}</td>
                      <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setModal(lead)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-orange-50 hover:text-orange-500 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteLead(lead.id)}
                            disabled={deleting === lead.id}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      </div>
    </>
  )
}
