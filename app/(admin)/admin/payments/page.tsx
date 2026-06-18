'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CreditCard, Search, RefreshCw, ChevronDown,
  CheckCircle, XCircle, Clock, AlertCircle, Plus, X, Save,
} from 'lucide-react'
import { getRoleFromSession, can } from '@/lib/roles'
import type { AdminRole } from '@/lib/admin-auth'

interface Payment {
  id:                string
  payment_id:        string
  booking_id:        string | null
  customer_name:     string
  customer_phone:    string
  amount:            number
  payment_method:    string
  payment_status:    string
  payment_reference: string | null
  notes:             string | null
  verified_by:       string | null
  verified_at:       string | null
  refund_amount:     number | null
  created_at:        string
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:  { label: 'Pending',  color: '#d97706', bg: '#fef3c7', icon: <Clock className="h-3 w-3" /> },
  paid:     { label: 'Paid',     color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle className="h-3 w-3" /> },
  failed:   { label: 'Failed',   color: '#dc2626', bg: '#fee2e2', icon: <XCircle className="h-3 w-3" /> },
  refunded: { label: 'Refunded', color: '#7c3aed', bg: '#ede9fe', icon: <AlertCircle className="h-3 w-3" /> },
}

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI', qr: 'QR Code', bank: 'Bank Transfer', cash: 'Cash',
}

function Badge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', icon: null }
  return (
    <span style={{ color: c.color, background: c.bg }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold">
      {c.icon}{c.label}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtRs(n: number) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }) }

// ── Add Payment Modal ────────────────────────────────────────────
function AddPaymentModal({ adminKey, onSaved, onClose }: { adminKey: string; onSaved: () => void; onClose: () => void }) {
  const [form, setForm] = useState({
    booking_id: '', customer_name: '', customer_phone: '',
    amount: '', payment_method: 'upi', payment_status: 'pending', payment_reference: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.customer_name || !form.amount) { setErr('Customer name and amount are required'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/admin/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? 'Failed'); setSaving(false); return }
    onSaved()
  }

  const inp = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
  const sel = inp + ' bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Record Payment</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {[
            { label: 'Customer Name *', k: 'customer_name' as const, placeholder: 'Amit Shah' },
            { label: 'Phone',           k: 'customer_phone' as const, placeholder: '9876543210' },
            { label: 'Amount (₹) *',    k: 'amount' as const, placeholder: '1500', type: 'number' },
            { label: 'Booking ID',      k: 'booking_id' as const, placeholder: 'optional' },
            { label: 'Reference / UTR', k: 'payment_reference' as const, placeholder: 'UTR123456' },
          ].map(f => (
            <div key={f.k}>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">{f.label}</label>
              <input type={('type' in f ? f.type : 'text') as string} value={form[f.k]} onChange={set(f.k)}
                placeholder={f.placeholder} className={inp} />
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Payment Method</label>
            <select value={form.payment_method} onChange={set('payment_method')} className={sel}>
              {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Status</label>
            <select value={form.payment_status} onChange={set('payment_status')} className={sel}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={inp} placeholder="Any additional notes…" />
          </div>
        </div>
        {err && <p className="px-6 pb-2 text-xs text-red-500">{err}</p>}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function PaymentsPage() {
  const router = useRouter()
  const [adminKey,  setAdminKey]  = useState('')
  const [role,      setRole]      = useState<AdminRole>(null)
  const [authed,    setAuthed]    = useState(false)
  const [payments,  setPayments]  = useState<Payment[]>([])
  const [loading,   setLoading]   = useState(false)
  const [filter,    setFilter]    = useState('all')
  const [search,    setSearch]    = useState('')
  const [showModal, setShowModal] = useState(false)
  const [updating,  setUpdating]  = useState<string | null>(null)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    setRole(getRoleFromSession())
    setAuthed(true)
  }, [router])

  const fetchPayments = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    const qs = `?key=${adminKey}${filter !== 'all' ? '&status=' + filter : ''}${search ? '&search=' + encodeURIComponent(search) : ''}`
    const res = await fetch('/api/admin/payments' + qs)
    if (res.ok) setPayments((await res.json()).payments ?? [])
    setLoading(false)
  }, [adminKey, filter, search])

  useEffect(() => { if (authed) fetchPayments() }, [authed, fetchPayments])

  async function verifyPayment(id: string) {
    setUpdating(id)
    await fetch(`/api/admin/payments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ payment_status: 'paid' }),
    })
    setUpdating(null)
    fetchPayments()
  }

  async function refundPayment(id: string) {
    const reason = prompt('Reason for refund?')
    if (!reason) return
    setUpdating(id)
    await fetch(`/api/admin/payments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ payment_status: 'refunded', refund_reason: reason }),
    })
    setUpdating(null)
    fetchPayments()
  }

  const totalPaid    = payments.filter(p => p.payment_status === 'paid').reduce((s, p) => s + Number(p.amount), 0)
  const totalPending = payments.filter(p => p.payment_status === 'pending').reduce((s, p) => s + Number(p.amount), 0)

  if (!authed) return null

  return (
    <>
      {showModal && (
        <AddPaymentModal adminKey={adminKey} onSaved={() => { setShowModal(false); fetchPayments() }} onClose={() => setShowModal(false)} />
      )}

      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Payments</h1>
            <p className="mt-0.5 text-sm text-gray-400">{payments.length} transactions · {fmtRs(totalPaid)} collected</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
            <Plus className="h-4 w-4" /> Record Payment
          </button>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Summary */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total',         value: payments.length,                                             color: '#2563eb', bg: '#dbeafe' },
            { label: 'Collected',     value: fmtRs(totalPaid),                                           color: '#16a34a', bg: '#dcfce7' },
            { label: 'Pending',       value: fmtRs(totalPending),                                        color: '#d97706', bg: '#fef3c7' },
            { label: 'Refunded',      value: payments.filter(p => p.payment_status === 'refunded').length, color: '#7c3aed', bg: '#ede9fe' },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">{c.label}</p>
              <p className="mt-1.5 text-xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, or payment ID…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none">
              <option value="all">All</option>
              {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={fetchPayments} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading payments…</div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <CreditCard className="mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-400">No payments recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Payment ID', 'Customer', 'Amount', 'Method', 'Reference', 'Status', 'Date', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-orange-600">{p.payment_id}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{p.customer_name}</p>
                        <p className="text-xs text-gray-400">{p.customer_phone}</p>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">{fmtRs(p.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">{METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.payment_reference || '—'}</td>
                      <td className="px-4 py-3"><Badge status={p.payment_status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(p.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {p.payment_status === 'pending' && (
                            <button onClick={() => verifyPayment(p.id)} disabled={updating === p.id}
                              className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-600 hover:bg-green-100 disabled:opacity-40">
                              {updating === p.id ? '…' : 'Verify'}
                            </button>
                          )}
                          {p.payment_status === 'paid' && can('ISSUE_REFUND', role) && (
                            <button onClick={() => refundPayment(p.id)} disabled={updating === p.id}
                              className="rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-600 hover:bg-purple-100 disabled:opacity-40">
                              Refund
                            </button>
                          )}
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
