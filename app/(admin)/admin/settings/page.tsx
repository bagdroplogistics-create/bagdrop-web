'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, Building2, CreditCard, Bell, Shield, Save, CheckCircle } from 'lucide-react'
import { getRoleFromSession, can } from '@/lib/roles'
import type { AdminRole } from '@/lib/admin-auth'

type Tab = 'company' | 'payment' | 'notifications' | 'roles'

interface SettingsMap {
  company_name?:       string
  company_gst?:        string
  company_address?:    string
  company_phone?:      string
  company_email?:      string
  payment_upi?:        string
  payment_bank_name?:  string
  payment_account_no?: string
  payment_ifsc?:       string
  notif_email?:        string
  notif_whatsapp?:     string
  notif_sms?:          string
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'company',       label: 'Company',       icon: <Building2 className="h-4 w-4" /> },
  { id: 'payment',       label: 'Payment',        icon: <CreditCard className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications',  icon: <Bell className="h-4 w-4" /> },
  { id: 'roles',         label: 'User Roles',     icon: <Shield className="h-4 w-4" /> },
]

const inp = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'

export default function SettingsPage() {
  const router = useRouter()
  const [adminKey, setAdminKey]   = useState('')
  const [role,     setRole]       = useState<AdminRole>(null)
  const [authed,   setAuthed]     = useState(false)
  const [tab,      setTab]        = useState<Tab>('company')
  const [settings, setSettings]   = useState<SettingsMap>({})
  const [saving,   setSaving]     = useState(false)
  const [saved,    setSaved]      = useState(false)
  const [error,    setError]      = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key)
    const r = getRoleFromSession()
    setRole(r)
    if (!can('ACCESS_SETTINGS', r)) { router.replace('/admin'); return }
    setAuthed(true)
  }, [router])

  const fetchSettings = useCallback(async () => {
    if (!adminKey) return
    const res = await fetch(`/api/admin/settings?key=${adminKey}`)
    if (res.ok) setSettings((await res.json()).settings ?? {})
  }, [adminKey])

  useEffect(() => { if (authed) fetchSettings() }, [authed, fetchSettings])

  const set = (k: keyof SettingsMap) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings(s => ({ ...s, [k]: e.target.value }))

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(settings),
    })
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
    else { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Failed to save') }
    setSaving(false)
  }

  if (!authed) return null

  const isAdmin = role === 'admin'

  return (
    <>
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-orange-500" />
            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          </div>
          {isAdmin && (
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
              {saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-120px)]">
        {/* Sidebar tabs */}
        <aside className="w-52 shrink-0 border-r border-gray-100 bg-white px-3 py-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 px-8 py-6">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
          {!isAdmin && (
            <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <strong>Read-only.</strong> Only Admins can change settings.
            </div>
          )}

          {tab === 'company' && (
            <div className="max-w-xl space-y-4">
              <h2 className="text-base font-bold text-gray-900">Company Information</h2>
              <p className="text-xs text-gray-500">This information appears on invoices and customer communications.</p>
              {[
                { label: 'Company Name',  k: 'company_name' as const,    placeholder: 'Bagdrop Logistics Solutions Pvt. Ltd.' },
                { label: 'GST Number',    k: 'company_gst' as const,     placeholder: '27AABCB1234F1ZQ' },
                { label: 'Address',       k: 'company_address' as const,  placeholder: '123, Business Park, Mumbai - 400001' },
                { label: 'Phone',         k: 'company_phone' as const,    placeholder: '+91 98765 43210' },
                { label: 'Email',         k: 'company_email' as const,    placeholder: 'hello@bagdrop.co' },
              ].map(f => (
                <div key={f.k}>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">{f.label}</label>
                  <input type="text" value={settings[f.k] ?? ''} onChange={set(f.k)} disabled={!isAdmin}
                    placeholder={f.placeholder} className={inp + (!isAdmin ? ' bg-gray-50 text-gray-500 cursor-not-allowed' : '')} />
                </div>
              ))}
            </div>
          )}

          {tab === 'payment' && (
            <div className="max-w-xl space-y-4">
              <h2 className="text-base font-bold text-gray-900">Payment Settings</h2>
              <p className="text-xs text-gray-500">UPI ID and bank details shown to customers for payment.</p>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">UPI ID</label>
                <input type="text" value={settings.payment_upi ?? ''} onChange={set('payment_upi')} disabled={!isAdmin}
                  placeholder="bagdrop@upi" className={inp + (!isAdmin ? ' bg-gray-50' : '')} />
              </div>
              <div className="rounded-xl border border-gray-100 p-4">
                <h3 className="mb-3 text-xs font-bold text-gray-700">Bank Transfer Details</h3>
                {[
                  { label: 'Bank Name',      k: 'payment_bank_name' as const,  placeholder: 'HDFC Bank' },
                  { label: 'Account Number', k: 'payment_account_no' as const, placeholder: '12345678901234' },
                  { label: 'IFSC Code',      k: 'payment_ifsc' as const,       placeholder: 'HDFC0001234' },
                ].map(f => (
                  <div key={f.k} className="mb-3">
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600">{f.label}</label>
                    <input type="text" value={settings[f.k] ?? ''} onChange={set(f.k)} disabled={!isAdmin}
                      placeholder={f.placeholder} className={inp + (!isAdmin ? ' bg-gray-50' : '')} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="max-w-xl space-y-4">
              <h2 className="text-base font-bold text-gray-900">Notification Settings</h2>
              <p className="text-xs text-gray-500">Toggle which channels to use for customer notifications on booking status updates.</p>
              {[
                { label: 'Email Notifications',     k: 'notif_email' as const,     desc: 'Send email via Resend on every status change' },
                { label: 'WhatsApp Notifications',  k: 'notif_whatsapp' as const,  desc: 'Send WhatsApp message via Meta Cloud API' },
                { label: 'SMS Notifications',       k: 'notif_sms' as const,       desc: 'Send SMS via Fast2SMS for OTP and updates' },
              ].map(f => (
                <label key={f.k} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${settings[f.k] === 'true' ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={settings[f.k] === 'true'}
                    disabled={!isAdmin}
                    onChange={e => isAdmin && setSettings(s => ({ ...s, [f.k]: e.target.checked ? 'true' : 'false' }))}
                    className="mt-0.5 h-4 w-4 accent-orange-500" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{f.label}</p>
                    <p className="text-xs text-gray-500">{f.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {tab === 'roles' && (
            <div className="max-w-xl">
              <h2 className="mb-1 text-base font-bold text-gray-900">User Roles</h2>
              <p className="mb-5 text-xs text-gray-500">Role access is controlled via secret keys in environment variables.</p>
              <div className="space-y-3">
                {[
                  {
                    role: 'Admin',
                    env: 'ADMIN_SECRET_KEY',
                    color: '#dc2626',
                    bg: '#fee2e2',
                    perms: ['Full access to all modules', 'Approve bookings without payment', 'Delete quotes and leads', 'Access settings', 'Issue refunds', 'View all reports'],
                  },
                  {
                    role: 'Staff',
                    env: 'STAFF_SECRET_KEY',
                    color: '#2563eb',
                    bg: '#dbeafe',
                    perms: ['View and update bookings', 'Verify payments', 'Manage leads and quotes', 'Create invoices', 'Cannot delete or access settings', 'Cannot approve without payment'],
                  },
                ].map(r => (
                  <div key={r.role} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <span style={{ color: r.color, background: r.bg }} className="rounded-full px-2.5 py-0.5 text-xs font-bold">{r.role}</span>
                      <code className="text-xs text-gray-400">{r.env}</code>
                    </div>
                    <ul className="space-y-1">
                      {r.perms.map(p => (
                        <li key={p} className="flex items-start gap-1.5 text-xs text-gray-600">
                          <span className="mt-0.5 text-gray-300">→</span>{p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-gray-400">To change a role's access level, update the corresponding environment variable in your deployment settings (e.g. Vercel → Environment Variables).</p>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
