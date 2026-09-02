'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Download, Loader2, Save, Truck, Package, User, MapPin,
  IndianRupee, FileText, CheckCircle, Pencil, X,
} from 'lucide-react'
import { LR_STATUS_LABELS, LR_CHARGE_FIELDS, LR_TYPE_OPTIONS, PAYMENT_TERMS_OPTIONS, GST_PAYABLE_BY_OPTIONS, MODE_OPTIONS, isValidTiTag } from '@/lib/lr-constants'

interface LR {
  id: string; lr_number: string; lr_date: string | null; booking_id: string | null
  status: string
  booking_office: string | null; vehicle_number: string | null
  from_city: string | null; to_city: string | null; mode: string | null
  consignor_name: string | null; consignor_address: string | null; consignor_mobile: string | null; consignor_email: string | null; consignor_gstin: string | null
  consignee_name: string | null; consignee_address: string | null; consignee_mobile: string | null; consignee_gstin: string | null
  billed_to_name: string | null; billed_to_gstin: string | null; delivery_address: string | null
  invoice_number: string | null; invoice_value: number | null; eway_bill_number: string | null
  total_bags: number | null; content_description: string | null
  actual_weight: number | null; chargeable_weight: number | null
  size_l: number | null; size_w: number | null; size_h: number | null; private_mark: string | null
  ti_tag: string | null
  sub_total: number; igst_amount: number; cgst_amount: number; sgst_amount: number; total_amount: number
  insurance_by_customer: boolean; gst_payable_by: string | null; payment_terms: string | null
  lr_type: string | null; delivery_at: string | null; remarks: string | null; prepared_by: string | null
  driver_name: string | null; driver_mobile: string | null; vehicle_type: string | null
  created_at: string
  branch_id: string | null; branch_code: string | null; branch_name: string | null
  branch_address: string | null; branch_gst_number: string | null
  branch_contact_number: string | null; branch_email: string | null
  financial_year: string | null
  [key: string]: unknown
}

// Every field the "Edit LR" mode below can change, in one place — used
// both to seed the form from a freshly-fetched LR and to build the PATCH
// payload on Save. Keys match the lrs table columns 1:1 (see LR_MIGRATION.sql
// and the `allowed` list in PATCH /api/admin/lrs/[id]).
const EDITABLE_TEXT_FIELDS = [
  'booking_office', 'vehicle_number', 'from_city', 'to_city',
  'consignor_name', 'consignor_address', 'consignor_mobile', 'consignor_email', 'consignor_gstin',
  'consignee_name', 'consignee_address', 'consignee_mobile', 'consignee_gstin',
  'billed_to_name', 'billed_to_gstin', 'delivery_address',
  'invoice_number', 'eway_bill_number',
  'content_description', 'private_mark', 'ti_tag',
  'delivery_at', 'remarks', 'prepared_by',
  'driver_name', 'driver_mobile', 'vehicle_type',
] as const
const EDITABLE_NUMBER_FIELDS = [
  'invoice_value', 'total_bags', 'actual_weight', 'chargeable_weight', 'size_l', 'size_w', 'size_h',
] as const
const EDITABLE_SELECT_FIELDS = ['mode', 'gst_payable_by', 'payment_terms', 'lr_type'] as const
const EDITABLE_DATE_FIELDS = ['lr_date'] as const

function fmtRs(n: number | null | undefined) {
  return '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const inp = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200'

const Card = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-500">{icon}</span>
      <h3 className="text-sm font-bold text-gray-800">{title}</h3>
    </div>
    {children}
  </div>
)
const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="mb-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    <p className="text-sm text-gray-900">{value ?? '—'}</p>
  </div>
)

export default function LRDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [lr, setLr] = useState<LR | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingCharges, setEditingCharges] = useState(false)
  const [chargeForm, setChargeForm] = useState<Record<string, string>>({})
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [insuranceByCustomer, setInsuranceByCustomer] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  function seedForm(data: LR) {
    const next: Record<string, string> = {}
    for (const k of EDITABLE_TEXT_FIELDS)   next[k] = (data[k] as string) ?? ''
    for (const k of EDITABLE_NUMBER_FIELDS) next[k] = data[k] != null ? String(data[k]) : ''
    for (const k of EDITABLE_SELECT_FIELDS) next[k] = (data[k] as string) ?? ''
    for (const k of EDITABLE_DATE_FIELDS)   next[k] = (data[k] as string) ?? ''
    setForm(next)
    setInsuranceByCustomer(!!data.insurance_by_customer)
  }

  const fetchLr = useCallback(async () => {
    if (!adminKey || !params.id) return
    setLoading(true)
    const res = await fetch(`/api/admin/lrs/${params.id}?key=${adminKey}`)
    if (res.ok) {
      const d = await res.json()
      setLr(d.lr)
      seedForm(d.lr)
      const cf: Record<string, string> = {}
      for (const f of LR_CHARGE_FIELDS) cf[f.key] = String(d.lr[f.key] ?? 0)
      setChargeForm(cf)
    } else {
      setErr('LR not found')
    }
    setLoading(false)
  }, [adminKey, params.id])

  useEffect(() => { if (authed) fetchLr() }, [authed, fetchLr])

  async function updateStatus(status: string) {
    if (!lr) return
    setSaving(true)
    const res = await fetch(`/api/admin/lrs/${lr.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ status }),
    })
    if (res.ok) fetchLr()
    setSaving(false)
  }

  async function saveCharges() {
    if (!lr) return
    setSaving(true)
    const payload: Record<string, number> = {}
    for (const f of LR_CHARGE_FIELDS) payload[f.key] = Number(chargeForm[f.key]) || 0
    const res = await fetch(`/api/admin/lrs/${lr.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    })
    if (res.ok) { setEditingCharges(false); fetchLr() } else { const d = await res.json(); setErr(d.error ?? 'Save failed') }
    setSaving(false)
  }

  function startEdit() {
    if (lr) seedForm(lr)
    setErr('')
    setEditMode(true)
  }

  function cancelEdit() {
    if (lr) seedForm(lr)
    setEditMode(false)
  }

  async function saveLr() {
    if (!lr) return
    // Ti-Tag stays optional — only validated if the admin actually typed
    // something into it.
    const tiTagVal = form.ti_tag?.trim()
    if (tiTagVal && !isValidTiTag(tiTagVal)) {
      setErr('Ti-Tag must be alphanumeric (letters and numbers only)'); return
    }
    setSaving(true); setErr('')
    const payload: Record<string, unknown> = { insurance_by_customer: insuranceByCustomer }
    for (const k of EDITABLE_TEXT_FIELDS)   payload[k] = form[k]?.trim() || null
    for (const k of EDITABLE_NUMBER_FIELDS) payload[k] = form[k] !== '' ? Number(form[k]) : null
    for (const k of EDITABLE_SELECT_FIELDS) payload[k] = form[k] || null
    for (const k of EDITABLE_DATE_FIELDS)   payload[k] = form[k] || null

    const res = await fetch(`/api/admin/lrs/${lr.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    })
    if (res.ok) { setEditMode(false); fetchLr() } else { const d = await res.json(); setErr(d.error ?? 'Save failed') }
    setSaving(false)
  }

  async function downloadPdf() {
    if (!lr) return
    setDownloading(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { default: LRPDF } = await import('@/components/admin/LRPDF')
      const charges: Record<string, number> = {}
      for (const f of LR_CHARGE_FIELDS) charges[f.key] = Number(lr[f.key]) || 0

      const blob = await pdf(
        LRPDF({
          lrNumber: lr.lr_number, lrDate: lr.lr_date, status: lr.status,
          bookingOffice: lr.booking_office, vehicleNumber: lr.vehicle_number,
          fromCity: lr.from_city, toCity: lr.to_city, mode: lr.mode,
          consignorName: lr.consignor_name, consignorAddress: lr.consignor_address,
          consignorMobile: lr.consignor_mobile, consignorGstin: lr.consignor_gstin,
          consigneeName: lr.consignee_name, consigneeAddress: lr.consignee_address,
          consigneeMobile: lr.consignee_mobile, consigneeGstin: lr.consignee_gstin,
          billedToName: lr.billed_to_name, billedToGstin: lr.billed_to_gstin,
          deliveryAddress: lr.delivery_address,
          invoiceNumber: lr.invoice_number, invoiceValue: lr.invoice_value, ewayBillNumber: lr.eway_bill_number,
          totalBags: lr.total_bags, contentDescription: lr.content_description,
          actualWeight: lr.actual_weight, chargeableWeight: lr.chargeable_weight,
          sizeL: lr.size_l, sizeW: lr.size_w, sizeH: lr.size_h, privateMark: lr.private_mark, tiTag: lr.ti_tag,
          charges, subTotal: lr.sub_total, igstAmount: lr.igst_amount,
          cgstAmount: lr.cgst_amount, sgstAmount: lr.sgst_amount, totalAmount: lr.total_amount,
          insuranceByCustomer: lr.insurance_by_customer, gstPayableBy: lr.gst_payable_by,
          paymentTerms: lr.payment_terms, lrType: lr.lr_type, deliveryAt: lr.delivery_at,
          remarks: lr.remarks, preparedBy: lr.prepared_by,
          branchName: lr.branch_name, branchAddress: lr.branch_address,
          branchGstNumber: lr.branch_gst_number, branchContactNumber: lr.branch_contact_number,
          branchEmail: lr.branch_email,
        })
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = `${lr.lr_number}.pdf`
      document.body.appendChild(link); link.click(); document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e); alert('Could not generate the LR PDF.')
    } finally { setDownloading(false) }
  }

  if (!authed) return null
  if (loading) return <div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" /></div>
  if (!lr) return <div className="p-8 text-center text-sm text-gray-500">{err || 'LR not found'}</div>

  const st = LR_STATUS_LABELS[lr.status] ?? { label: lr.status, color: '#6b7280', bg: '#f3f4f6' }

  // Renders either the read-only value or the matching input, depending on
  // editMode — a single small helper keeps every card below to one line
  // per field instead of duplicating the whole card twice.
  function EField({ label, k, display, type = 'text' }: {
    label: string; k: string; display?: React.ReactNode; type?: 'text' | 'number' | 'date'
  }) {
    if (!editMode) return <Field label={label} value={display !== undefined ? display : (lr![k] as React.ReactNode)} />
    return (
      <div className="mb-2.5">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</label>
        <input type={type} value={form[k] ?? ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className={inp} />
      </div>
    )
  }
  function ESelect({ label, k, options }: { label: string; k: string; options: readonly string[] }) {
    if (!editMode) return <Field label={label} value={lr![k] as React.ReactNode} />
    return (
      <div className="mb-2.5">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</label>
        <select value={form[k] ?? ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className={inp}>
          <option value="">Select…</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    )
  }

  return (
    <>
      <div className="border-b border-orange-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/lrs" className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 font-mono">{lr.lr_number}</h1>
                <span style={{ color: st.color, background: st.bg }} className="rounded-full px-2.5 py-1 text-xs font-semibold">{st.label}</span>
                {editMode && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Editing</span>}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Generated {fmtDate(lr.created_at)}
                {lr.booking_id ? <> · <Link href={`/admin`} className="text-orange-500 hover:underline">Linked booking</Link></> : ' · Manual entry'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editMode ? (
              <>
                <select value={lr.status} onChange={e => updateStatus(e.target.value)} disabled={saving}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none">
                  {Object.entries(LR_STATUS_LABELS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                </select>
                <button onClick={startEdit}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
                  <Pencil className="h-4 w-4" /> Edit LR
                </button>
                <button onClick={downloadPdf} disabled={downloading}
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors disabled:opacity-50">
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
                </button>
              </>
            ) : (
              <>
                <button onClick={cancelEdit} disabled={saving}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
                  <X className="h-4 w-4" /> Cancel
                </button>
                <button onClick={saveLr} disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 space-y-4">
        {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{err}</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card title="Route & Vehicle" icon={<Truck className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-3">
              <EField label="From" k="from_city" />
              <EField label="To" k="to_city" />
              <EField label="Booking Office" k="booking_office" />
              <EField label="Vehicle No." k="vehicle_number" />
              <ESelect label="Mode" k="mode" options={MODE_OPTIONS} />
              <EField label="LR Date" k="lr_date" type="date" display={fmtDate(lr.lr_date)} />
              <EField label="Driver" k="driver_name" />
              <EField label="Driver Mobile" k="driver_mobile" />
              {/* Read-only, not part of EDITABLE_TEXT_FIELDS — branch
                  assignment is permanent once set (spec section 15: changing
                  it after LR creation must not silently change the LR
                  number, so it isn't exposed as a plain edit field here). */}
              <div>
                <p className="text-xs font-semibold text-gray-400">Issuing Branch</p>
                <p className="mt-0.5 text-sm text-gray-800">
                  {lr.branch_code ? `${lr.branch_name} (${lr.branch_code})` : '— (global series)'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400">Financial Year</p>
                <p className="mt-0.5 text-sm text-gray-800">{lr.financial_year ?? '—'}</p>
              </div>
            </div>
          </Card>

          <Card title="Packages" icon={<Package className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-3">
              <EField label="Total Bags (Pkgs)" k="total_bags" type="number" />
              <EField label="Content" k="content_description" />
              <EField label="Actual Weight (kg)" k="actual_weight" type="number" display={lr.actual_weight != null ? `${lr.actual_weight} kg` : null} />
              <EField label="Chargeable Weight (kg)" k="chargeable_weight" type="number" display={lr.chargeable_weight != null ? `${lr.chargeable_weight} kg` : null} />
              <EField label="Size L (cm)" k="size_l" type="number" />
              <EField label="Size W (cm)" k="size_w" type="number" />
              <EField label="Size H (cm)" k="size_h" type="number" />
              <EField label="Private Mark" k="private_mark" />
              <EField label="Ti-Tag" k="ti_tag" />
            </div>
          </Card>

          <Card title="Consignor" icon={<User className="h-4 w-4" />}>
            <EField label="Name" k="consignor_name" />
            <EField label="Address" k="consignor_address" />
            <EField label="Mobile" k="consignor_mobile" />
            <EField label="Email" k="consignor_email" />
            <EField label="GSTIN" k="consignor_gstin" />
          </Card>

          <Card title="Consignee" icon={<User className="h-4 w-4" />}>
            <EField label="Name" k="consignee_name" />
            <EField label="Address" k="consignee_address" />
            <EField label="Mobile" k="consignee_mobile" />
            <EField label="GSTIN" k="consignee_gstin" />
          </Card>

          <Card title="Billed To / Delivery" icon={<MapPin className="h-4 w-4" />}>
            <EField label="Billed To" k="billed_to_name" />
            <EField label="Billed To GSTIN" k="billed_to_gstin" />
            <EField label="Delivery Address" k="delivery_address" />
          </Card>

          <Card title="Invoice / E-way" icon={<FileText className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-3">
              <EField label="Invoice No." k="invoice_number" />
              <EField label="Invoice Value" k="invoice_value" type="number" display={lr.invoice_value != null ? fmtRs(lr.invoice_value) : null} />
              <EField label="E-way Bill No." k="eway_bill_number" />
              {!editMode ? (
                <Field label="Insurance by Customer" value={lr.insurance_by_customer ? 'Yes' : 'No'} />
              ) : (
                <div className="mb-2.5">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Insurance by Customer</label>
                  <select value={insuranceByCustomer ? 'yes' : 'no'}
                    onChange={e => setInsuranceByCustomer(e.target.value === 'yes')}
                    className={inp}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Charges ledger */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-500"><IndianRupee className="h-4 w-4" /></span>
              <h3 className="text-sm font-bold text-gray-800">Charges Ledger</h3>
            </div>
            {!editingCharges ? (
              <button onClick={() => setEditingCharges(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Edit Charges</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={saveCharges} disabled={saving} className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                  <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingCharges(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            {LR_CHARGE_FIELDS.map(f => (
              <div key={f.key} className="flex items-center justify-between border-b border-gray-50 py-1.5">
                <span className="text-xs text-gray-500">{f.label}</span>
                {editingCharges ? (
                  <input type="number" min="0" value={chargeForm[f.key] ?? '0'}
                    onChange={e => setChargeForm(c => ({ ...c, [f.key]: e.target.value }))}
                    className="w-20 rounded border border-gray-200 px-1.5 py-1 text-right text-xs focus:border-orange-400 focus:outline-none" />
                ) : (
                  <span className="text-xs font-semibold text-gray-800">{fmtRs(Number(lr[f.key]))}</span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-6 border-t border-gray-100 pt-3">
            <div className="text-right"><p className="text-[10px] uppercase text-gray-400">Sub Total</p><p className="text-sm font-semibold text-gray-800">{fmtRs(lr.sub_total)}</p></div>
            {lr.igst_amount > 0 ? (
              <div className="text-right"><p className="text-[10px] uppercase text-gray-400">IGST @ 5%</p><p className="text-sm font-semibold text-gray-800">{fmtRs(lr.igst_amount)}</p></div>
            ) : (
              <>
                <div className="text-right"><p className="text-[10px] uppercase text-gray-400">CGST @ 2.5%</p><p className="text-sm font-semibold text-gray-800">{fmtRs(lr.cgst_amount)}</p></div>
                <div className="text-right"><p className="text-[10px] uppercase text-gray-400">SGST @ 2.5%</p><p className="text-sm font-semibold text-gray-800">{fmtRs(lr.sgst_amount)}</p></div>
              </>
            )}
            <div className="text-right"><p className="text-[10px] uppercase text-orange-500 font-semibold">Total Amount</p><p className="text-lg font-bold text-orange-600">{fmtRs(lr.total_amount)}</p></div>
          </div>
        </div>

        {/* Footer info */}
        <Card title="Terms & Remarks" icon={<CheckCircle className="h-4 w-4" />}>
          <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
            <ESelect label="GST Payable By" k="gst_payable_by" options={GST_PAYABLE_BY_OPTIONS} />
            <ESelect label="Payment Terms" k="payment_terms" options={PAYMENT_TERMS_OPTIONS} />
            <ESelect label="LR Type" k="lr_type" options={LR_TYPE_OPTIONS} />
            <EField label="Delivery At" k="delivery_at" />
          </div>
          <EField label="Remarks" k="remarks" />
          <EField label="Prepared By" k="prepared_by" />
        </Card>
      </main>
    </>
  )
}
