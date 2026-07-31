'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Download, Loader2, Save, Truck, Package, User, MapPin,
  IndianRupee, FileText, CheckCircle,
} from 'lucide-react'
import { LR_STATUS_LABELS, LR_CHARGE_FIELDS, LR_TYPE_OPTIONS, PAYMENT_TERMS_OPTIONS, GST_PAYABLE_BY_OPTIONS, MODE_OPTIONS } from '@/lib/lr-constants'

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
  sub_total: number; igst_amount: number; cgst_amount: number; sgst_amount: number; total_amount: number
  insurance_by_customer: boolean; gst_payable_by: string | null; payment_terms: string | null
  lr_type: string | null; delivery_at: string | null; remarks: string | null; prepared_by: string | null
  driver_name: string | null; driver_mobile: string | null; vehicle_type: string | null
  created_at: string
  [key: string]: unknown
}

function fmtRs(n: number | null | undefined) {
  return '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

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
  const [err, setErr] = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key') ?? ''
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  const fetchLr = useCallback(async () => {
    if (!adminKey || !params.id) return
    setLoading(true)
    const res = await fetch(`/api/admin/lrs/${params.id}?key=${adminKey}`)
    if (res.ok) {
      const d = await res.json()
      setLr(d.lr)
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
          sizeL: lr.size_l, sizeW: lr.size_w, sizeH: lr.size_h, privateMark: lr.private_mark,
          charges, subTotal: lr.sub_total, igstAmount: lr.igst_amount,
          cgstAmount: lr.cgst_amount, sgstAmount: lr.sgst_amount, totalAmount: lr.total_amount,
          insuranceByCustomer: lr.insurance_by_customer, gstPayableBy: lr.gst_payable_by,
          paymentTerms: lr.payment_terms, lrType: lr.lr_type, deliveryAt: lr.delivery_at,
          remarks: lr.remarks, preparedBy: lr.prepared_by,
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
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Generated {fmtDate(lr.created_at)}
                {lr.booking_id ? <> · <Link href={`/admin`} className="text-orange-500 hover:underline">Linked booking</Link></> : ' · Manual entry'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={lr.status} onChange={e => updateStatus(e.target.value)} disabled={saving}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none">
              {Object.entries(LR_STATUS_LABELS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
            <button onClick={downloadPdf} disabled={downloading}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors disabled:opacity-50">
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 space-y-4">
        {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{err}</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card title="Route & Vehicle" icon={<Truck className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="From" value={lr.from_city} />
              <Field label="To" value={lr.to_city} />
              <Field label="Booking Office" value={lr.booking_office} />
              <Field label="Vehicle No." value={lr.vehicle_number} />
              <Field label="Mode" value={lr.mode} />
              <Field label="LR Date" value={fmtDate(lr.lr_date)} />
              <Field label="Driver" value={lr.driver_name} />
              <Field label="Driver Mobile" value={lr.driver_mobile} />
            </div>
          </Card>

          <Card title="Packages" icon={<Package className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="Total Bags (Pkgs)" value={lr.total_bags} />
              <Field label="Content" value={lr.content_description} />
              <Field label="Actual Weight" value={lr.actual_weight != null ? `${lr.actual_weight} kg` : null} />
              <Field label="Chargeable Weight" value={lr.chargeable_weight != null ? `${lr.chargeable_weight} kg` : null} />
              <Field label="Size (L×W×H)" value={lr.size_l != null ? `${lr.size_l} × ${lr.size_w} × ${lr.size_h}` : null} />
              <Field label="Private Mark" value={lr.private_mark} />
            </div>
          </Card>

          <Card title="Consignor" icon={<User className="h-4 w-4" />}>
            <Field label="Name" value={lr.consignor_name} />
            <Field label="Address" value={lr.consignor_address} />
            <Field label="Mobile" value={lr.consignor_mobile} />
            <Field label="GSTIN" value={lr.consignor_gstin} />
          </Card>

          <Card title="Consignee" icon={<User className="h-4 w-4" />}>
            <Field label="Name" value={lr.consignee_name} />
            <Field label="Address" value={lr.consignee_address} />
            <Field label="Mobile" value={lr.consignee_mobile} />
            <Field label="GSTIN" value={lr.consignee_gstin} />
          </Card>

          <Card title="Billed To / Delivery" icon={<MapPin className="h-4 w-4" />}>
            <Field label="Billed To" value={lr.billed_to_name} />
            <Field label="Billed To GSTIN" value={lr.billed_to_gstin} />
            <Field label="Delivery Address" value={lr.delivery_address} />
          </Card>

          <Card title="Invoice / E-way" icon={<FileText className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="Invoice No." value={lr.invoice_number} />
              <Field label="Invoice Value" value={lr.invoice_value != null ? fmtRs(lr.invoice_value) : null} />
              <Field label="E-way Bill No." value={lr.eway_bill_number} />
              <Field label="Insurance by Customer" value={lr.insurance_by_customer ? 'Yes' : 'No'} />
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
            <Field label="GST Payable By" value={lr.gst_payable_by} />
            <Field label="Payment Terms" value={lr.payment_terms} />
            <Field label="LR Type" value={lr.lr_type} />
            <Field label="Delivery At" value={lr.delivery_at} />
          </div>
          <Field label="Remarks" value={lr.remarks} />
          <p className="mt-1 text-[10px] text-gray-300">
            Valid options — LR Type: {LR_TYPE_OPTIONS.join(', ')} · Payment Terms: {PAYMENT_TERMS_OPTIONS.join(', ')} · GST Payable By: {GST_PAYABLE_BY_OPTIONS.join(', ')} · Mode: {MODE_OPTIONS.join(', ')}
          </p>
        </Card>
      </main>
    </>
  )
}
