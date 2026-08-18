'use client'

// BAGDROP — New Invoice (Zoho Books parity)
//
// Every OTHER invoice in this app is generated from a completed booking
// (see the "Generate Invoice" flow on the Invoices tab, and
// app/api/admin/invoices/route.ts's booking-derived POST branch). This
// page is the one path that creates a fully standalone invoice — any
// customer, a hand-typed item table, discount/TDS/TCS/adjustment,
// attachments — matching Zoho's own New Invoice form field-for-field.
// Posts to the SAME endpoint with `manual: true`, which routes to
// createManualInvoice() in that file instead of the booking-derived logic.
//
// Known simplifications (flagged per project convention rather than
// silently deviating from the Zoho reference):
//   - Terms dropdown only meaningfully supports "Due on Receipt" (auto-
//     sets Due Date = Invoice Date) or "Custom" (Due Date becomes
//     editable) — this app's InvoicePDF has always hardcoded "Due on
//     Receipt" as its payment-terms label, so a full Net-15/Net-30 terms
//     library isn't wired into the PDF yet.
//   - Per-item Tax is a 3-way choice (GST 5% / IGST 5% / No Tax) rather
//     than a full tax-rate catalog — matches how every other invoice in
//     this app already computes GST (a single uniform 5% split, CGST+SGST
//     intrastate or IGST interstate), just applied per-row here so a
//     manual invoice can still mix a couple of differently-taxed lines.
//   - TDS/TCS is a flat percentage (no preset section codes like Zoho's
//     194C/194J list) — same simplification already used on the Payments
//     tab's Record Payment form.
//   - "Accounts Receivable" is shown as a fixed, non-editable value (this
//     app only has one AR account) — same treatment as "Deposit To" on
//     the Record Payment form.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Upload, Paperclip, Loader2, Save, X,
} from 'lucide-react'
import { searchItems, type BagdropItem } from '@/lib/bagdrop-items'

interface CustomerSearchResult {
  title: string | null; name: string; phone: string; email: string | null
  pickup_address?: string | null
  customer_type?: string | null; business_name?: string | null
  business_address?: string | null; gst_number?: string | null
}

type TaxMode = 'gst5' | 'igst5' | 'none'

interface ItemRow {
  name: string; description: string; hsn: string
  quantity: string; rate: string; taxMode: TaxMode
}

function blankItem(): ItemRow {
  return { name: '', description: '', hsn: '', quantity: '1', rate: '', taxMode: 'gst5' }
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

function fmtRs(n: number) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── ItemSearchLocal ──────────────────────────────────────────────────
// Same item-catalog autocomplete used in the New Quote form's item table
// (app/(admin)/admin/quotes/new/page.tsx) — typing filters BAGDROP_ITEMS
// via searchItems(), picking a suggestion fills name/description/rate.
// Reimplemented here (not imported) to match this codebase's convention
// of small duplication over cross-page component sharing.
function ItemSearchLocal({ value, onTextChange, onSelect }: {
  value: string
  onTextChange: (v: string) => void
  onSelect: (item: BagdropItem) => void
}) {
  const [open, setOpen] = useState(false)
  const results = searchItems(value)

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onTextChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder="Type or click to select an item"
        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 top-full z-50 max-h-52 w-[360px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {results.map(item => (
            <button
              key={item.id}
              onMouseDown={() => { onSelect(item); setOpen(false) }}
              className="w-full border-b border-gray-50 px-3 py-2 text-left last:border-0 hover:bg-orange-50"
            >
              <p className="text-xs font-semibold leading-tight text-gray-800">{item.name}</p>
              <p className="mt-0.5 text-xs font-bold text-orange-600">₹{item.rate.toLocaleString('en-IN')}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NewInvoicePage() {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { router.replace('/admin/login'); return }
    setAdminKey(key); setAuthed(true)
  }, [router])

  // ── Customer ─────────────────────────────────────────────────────
  const [customerName, setCustomerName]   = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerType, setCustomerType] = useState<'individual' | 'business'>('individual')
  const [businessName, setBusinessName] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [gstNumber, setGstNumber] = useState('')

  const [custQ, setCustQ] = useState('')
  const [custResults, setCustResults] = useState<CustomerSearchResult[]>([])
  const [custOpen, setCustOpen] = useState(false)
  const [custLoading, setCustLoading] = useState(false)

  useEffect(() => {
    if (!custOpen || !adminKey) return
    setCustLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers/search?key=${adminKey}&q=${encodeURIComponent(custQ.trim())}`)
        const j   = await res.json()
        setCustResults(res.ok ? (j.customers ?? []) : [])
      } catch { setCustResults([]) }
      setCustLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [custQ, custOpen, adminKey])

  function pickCustomer(c: CustomerSearchResult) {
    setCustomerName(c.name); setCustomerPhone(c.phone); setCustomerEmail(c.email ?? '')
    setCustomerAddress(c.pickup_address ?? '')
    if (c.customer_type === 'business') {
      setCustomerType('business')
      setBusinessName(c.business_name ?? '')
      setBusinessAddress(c.business_address ?? '')
    }
    setGstNumber(c.gst_number ?? '')
    setCustQ(''); setCustResults([]); setCustOpen(false)
  }

  // ── Header fields ────────────────────────────────────────────────
  const [orderNumber, setOrderNumber]   = useState('')
  const [invoiceDate, setInvoiceDate]   = useState(todayStr())
  const [terms, setTerms]               = useState<'due_on_receipt' | 'custom'>('due_on_receipt')
  const [dueDate, setDueDate]           = useState(todayStr())
  const [salesperson, setSalesperson]   = useState('')
  const [consignmentNo, setConsignmentNo] = useState('')
  const [totalBags, setTotalBags]       = useState('')
  const [pickupDate, setPickupDate]     = useState('')
  const [pickupTime, setPickupTime]     = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTime, setDeliveryTime] = useState('')
  const [pickupAddress, setPickupAddress]   = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [subject, setSubject]           = useState('')
  const [fromCity, setFromCity]         = useState('')
  const [toCity, setToCity]             = useState('')

  useEffect(() => {
    if (terms === 'due_on_receipt') setDueDate(invoiceDate)
  }, [terms, invoiceDate])

  // ── Item table ───────────────────────────────────────────────────
  const [items, setItems] = useState<ItemRow[]>([blankItem()])

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }
  function selectCatalogItem(idx: number, item: BagdropItem) {
    updateItem(idx, { name: item.name, description: item.description ?? '', rate: String(item.rate) })
  }
  function addRow() { setItems(rows => [...rows, blankItem()]) }
  function removeRow(idx: number) { setItems(rows => rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows) }

  function rowAmount(r: ItemRow) { return (Number(r.quantity) || 0) * (Number(r.rate) || 0) }
  function rowTax(r: ItemRow) {
    const amt = rowAmount(r)
    if (r.taxMode === 'gst5') return { cgst: amt * 0.025, sgst: amt * 0.025, igst: 0 }
    if (r.taxMode === 'igst5') return { cgst: 0, sgst: 0, igst: amt * 0.05 }
    return { cgst: 0, sgst: 0, igst: 0 }
  }

  // ── Discount / TDS-TCS / Adjustment ─────────────────────────────
  const [discountPercent, setDiscountPercent] = useState('')
  const [tdsTcsType, setTdsTcsType]     = useState<'none' | 'tds' | 'tcs'>('none')
  const [tdsTcsPercent, setTdsTcsPercent] = useState('')
  const [adjustmentLabel, setAdjustmentLabel]   = useState('Adjustment')
  const [adjustmentAmount, setAdjustmentAmount] = useState('')

  // ── Notes / Terms & Conditions / Attachments ────────────────────
  const [notes, setNotes] = useState('Thanks for your business.')
  const [termsConditions, setTermsConditions] = useState('')

  const MAX_ATTACHMENTS = 10
  const MAX_ATTACH_BYTES = 10 * 1024 * 1024
  const ALLOWED_ATTACH_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)

  function addFiles(files: FileList | null) {
    if (!files) return
    setErr('')
    const next = [...pendingFiles]
    for (const f of Array.from(files)) {
      if (next.length >= MAX_ATTACHMENTS) { setErr(`Maximum ${MAX_ATTACHMENTS} attachments per invoice.`); break }
      if (!ALLOWED_ATTACH_TYPES.has(f.type)) { setErr(`${f.name}: unsupported file type (use JPG/PNG/WEBP/HEIC or PDF).`); continue }
      if (f.size > MAX_ATTACH_BYTES) { setErr(`${f.name}: file too large (max 10MB).`); continue }
      next.push(f)
    }
    setPendingFiles(next)
  }
  function removeFile(idx: number) { setPendingFiles(fs => fs.filter((_, i) => i !== idx)) }
  function fmtBytes(n: number) { return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB` }

  // ── Live totals (mirrors createManualInvoice()'s server-side calc) ──
  const subtotal   = items.reduce((s, r) => s + rowAmount(r), 0)
  const cgstTotal  = items.reduce((s, r) => s + rowTax(r).cgst, 0)
  const sgstTotal  = items.reduce((s, r) => s + rowTax(r).sgst, 0)
  const igstTotal  = items.reduce((s, r) => s + rowTax(r).igst, 0)
  const discountAmt = subtotal * (Number(discountPercent) || 0) / 100
  const beforeAdjustment = subtotal - discountAmt + cgstTotal + sgstTotal + igstTotal
  const tdsTcsAmt = tdsTcsType !== 'none' ? beforeAdjustment * (Number(tdsTcsPercent) || 0) / 100 : 0
  const total = beforeAdjustment
    + (tdsTcsType === 'tcs' ? tdsTcsAmt : 0)
    - (tdsTcsType === 'tds' ? tdsTcsAmt : 0)
    + (Number(adjustmentAmount) || 0)

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save(sendEmail: boolean) {
    if (!customerName.trim()) { setErr('Customer Name is required.'); return }
    if (!pickupDate) { setErr('Pickup Date is required.'); return }
    const validItems = items.filter(i => i.name.trim() && Number(i.rate) > 0)
    if (validItems.length === 0) { setErr('At least one item with a name and rate is required.'); return }

    setSaving(true); setErr('')

    const res = await fetch('/api/admin/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        manual: true,
        customer_name: customerName.trim(), customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || null, customer_address: customerAddress.trim() || null,
        customer_type: customerType, business_name: businessName.trim() || null,
        business_address: businessAddress.trim() || null, gst_number: gstNumber.trim() || null,
        order_number: orderNumber.trim() || null,
        invoice_date: invoiceDate, due_date: dueDate,
        salesperson: salesperson.trim() || null,
        consignment_no: consignmentNo.trim() || null, total_bags: totalBags ? Number(totalBags) : null,
        pickup_date: pickupDate, pickup_time: pickupTime.trim() || null,
        delivery_date: deliveryDate || null, delivery_time: deliveryTime.trim() || null,
        pickup_address: pickupAddress.trim() || null, delivery_address: deliveryAddress.trim() || null,
        from_city: fromCity.trim() || null, to_city: toCity.trim() || null,
        subject: subject.trim() || null,
        line_items: validItems.map(i => ({
          name: i.name.trim(), description: i.description.trim() || null, hsn: i.hsn.trim() || null,
          quantity: Number(i.quantity) || 1, rate: Number(i.rate) || 0, taxMode: i.taxMode,
        })),
        discount_percent: Number(discountPercent) || 0,
        tds_tcs_type: tdsTcsType === 'none' ? null : tdsTcsType,
        tds_tcs_percent: Number(tdsTcsPercent) || 0,
        adjustment_label: adjustmentLabel.trim() || null,
        adjustment_amount: Number(adjustmentAmount) || 0,
        notes: notes.trim() || null,
        terms_conditions: termsConditions.trim() || null,
        send_email: sendEmail,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(d.error ?? 'Failed to save invoice'); setSaving(false); return }

    const invoiceId = d.invoice?.id
    if (pendingFiles.length > 0 && invoiceId) {
      setUploadingAttachments(true)
      for (const f of pendingFiles) {
        const fd = new FormData()
        fd.append('file', f)
        try {
          const upRes = await fetch(`/api/admin/invoices/${invoiceId}/attachments`, {
            method: 'POST', headers: { 'x-admin-key': adminKey }, body: fd,
          })
          if (!upRes.ok) console.error('[NewInvoicePage] attachment upload failed:', await upRes.text())
        } catch (e) {
          console.error('[NewInvoicePage] attachment upload error:', e)
        }
      }
      setUploadingAttachments(false)
    }

    router.push('/admin/invoices')
  }

  if (!authed) return null

  const inp    = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400'
  const sel    = inp + ' bg-white'
  const lbl    = 'mb-1.5 block text-xs font-semibold text-gray-600'
  const reqLbl = lbl + ' after:ml-0.5 after:text-red-400 after:content-["*"]'

  return (
    <>
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">New Invoice</h1>
          <button onClick={() => router.push('/admin/invoices')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Customer */}
        <div className="relative mb-5">
          <label className={reqLbl}>Customer Name</label>
          <input
            value={customerName}
            onChange={e => { setCustomerName(e.target.value); setCustQ(e.target.value) }}
            onFocus={() => setCustOpen(true)}
            onBlur={() => setTimeout(() => setCustOpen(false), 160)}
            placeholder="Select or add a customer" className={inp} />
          {custOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
              {custLoading ? (
                <div className="px-3 py-3 text-xs text-gray-400">Searching…</div>
              ) : custResults.length === 0 ? (
                <div className="px-3 py-3 text-xs text-gray-400">No customers found — type a new name and phone below to add one.</div>
              ) : custResults.map(c => (
                <button key={c.phone} onMouseDown={() => pickCustomer(c)}
                  className="block w-full border-b border-gray-50 px-3 py-2 text-left last:border-0 hover:bg-orange-50">
                  <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <label className={lbl}>Phone</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="9876543210" className={inp} />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" className={inp} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Billing Address</label>
            <textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} rows={2} className={inp} />
          </div>
          <div>
            <label className={lbl}>GST Number (optional)</label>
            <input value={gstNumber} onChange={e => setGstNumber(e.target.value)} placeholder="24AAACC9320N2ZL" className={inp} />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-100 pt-5">
          <div>
            <label className={lbl}>Order Number</label>
            <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Salesperson</label>
            <input value={salesperson} onChange={e => setSalesperson(e.target.value)} placeholder="e.g. Lata Parmar" className={inp} />
          </div>

          <div>
            <label className={reqLbl}>Invoice Date</label>
            <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Terms</label>
              <select value={terms} onChange={e => setTerms(e.target.value as 'due_on_receipt' | 'custom')} className={sel}>
                <option value="due_on_receipt">Due on Receipt</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={terms === 'due_on_receipt'}
                className={inp + (terms === 'due_on_receipt' ? ' cursor-not-allowed bg-gray-50 text-gray-400' : '')} />
            </div>
          </div>

          <div>
            <label className={lbl}>Consignment No</label>
            <input value={consignmentNo} onChange={e => setConsignmentNo(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>No Of Bags</label>
            <input type="number" value={totalBags} onChange={e => setTotalBags(e.target.value)} className={inp} />
          </div>

          <div>
            <label className={reqLbl}>Pickup Date</label>
            <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Pickup Time</label>
            <input value={pickupTime} onChange={e => setPickupTime(e.target.value)} placeholder="10:00 AM" className={inp} />
          </div>

          <div>
            <label className={lbl}>Delivery Date</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Delivery Time</label>
            <input value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} placeholder="2:00 PM" className={inp} />
          </div>

          <div>
            <label className={lbl}>Pickup Address</label>
            <textarea value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} rows={2} className={inp} />
          </div>
          <div>
            <label className={lbl}>Delivery Address</label>
            <textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} rows={2} className={inp} />
          </div>

          <div>
            <label className={lbl}>From City</label>
            <input value={fromCity} onChange={e => setFromCity(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>To City</label>
            <input value={toCity} onChange={e => setToCity(e.target.value)} className={inp} />
          </div>

          <div className="col-span-2">
            <label className={lbl}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Let your customer know what this invoice is for" className={inp} />
          </div>
        </div>

        {/* Item Table */}
        <div className="mb-4">
          <p className="mb-2 text-sm font-bold text-gray-800">Item Table</p>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-semibold">Item Details</th>
                  <th className="w-20 px-3 py-2 text-right font-semibold">Qty</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Rate</th>
                  <th className="w-36 px-3 py-2 font-semibold">Tax</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="mb-1">
                        <ItemSearchLocal
                          value={r.name}
                          onTextChange={v => updateItem(i, { name: v })}
                          onSelect={item => selectCatalogItem(i, item)}
                        />
                      </div>
                      <input value={r.description} onChange={e => updateItem(i, { description: e.target.value })}
                        placeholder="Description" className="w-full rounded border border-gray-100 px-2 py-1 text-[11px] text-gray-500" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={r.quantity} onChange={e => updateItem(i, { quantity: e.target.value })}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-right text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={r.rate} onChange={e => updateItem(i, { rate: e.target.value })}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-right text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={r.taxMode} onChange={e => updateItem(i, { taxMode: e.target.value as TaxMode })}
                        className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs">
                        <option value="gst5">GST5 (2.5% CGST + 2.5% SGST)</option>
                        <option value="igst5">IGST5 (5%)</option>
                        <option value="none">No Tax</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmtRs(rowAmount(r))}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addRow} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700">
            <Plus className="h-3.5 w-3.5" /> Add New Row
          </button>
        </div>

        {/* Totals */}
        <div className="mb-6 flex justify-end">
          <div className="w-80 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Sub Total</span><span className="font-semibold text-gray-800">{fmtRs(subtotal)}</span></div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Discount</span>
              <div className="flex items-center gap-2">
                <input type="number" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)}
                  className="w-16 rounded border border-gray-200 px-2 py-1 text-right text-xs" placeholder="0" />
                <span className="text-xs text-gray-400">%</span>
                <span className="w-20 text-right font-medium text-gray-700">{fmtRs(discountAmt)}</span>
              </div>
            </div>
            {cgstTotal > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span className="text-gray-700">{fmtRs(cgstTotal)}</span></div>}
            {sgstTotal > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span className="text-gray-700">{fmtRs(sgstTotal)}</span></div>}
            {igstTotal > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><span className="text-gray-700">{fmtRs(igstTotal)}</span></div>}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <label className="flex items-center gap-1"><input type="radio" checked={tdsTcsType === 'none'} onChange={() => setTdsTcsType('none')} /> No Tax deducted</label>
                <label className="flex items-center gap-1"><input type="radio" checked={tdsTcsType === 'tds'} onChange={() => setTdsTcsType('tds')} /> TDS</label>
                <label className="flex items-center gap-1"><input type="radio" checked={tdsTcsType === 'tcs'} onChange={() => setTdsTcsType('tcs')} /> TCS</label>
              </div>
              {tdsTcsType !== 'none' && (
                <div className="flex items-center gap-2">
                  <input type="number" value={tdsTcsPercent} onChange={e => setTdsTcsPercent(e.target.value)}
                    className="w-16 rounded border border-gray-200 px-2 py-1 text-right text-xs" placeholder="0" />
                  <span className="text-xs text-gray-400">%</span>
                  <span className="w-20 text-right font-medium text-gray-700">{tdsTcsType === 'tds' ? '-' : '+'}{fmtRs(tdsTcsAmt)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <input value={adjustmentLabel} onChange={e => setAdjustmentLabel(e.target.value)}
                className="w-32 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600" />
              <input type="number" value={adjustmentAmount} onChange={e => setAdjustmentAmount(e.target.value)}
                className="w-20 rounded border border-gray-200 px-2 py-1 text-right text-xs" placeholder="0" />
            </div>

            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
              <span>Total</span><span>{fmtRs(total)}</span>
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <label className={lbl}>Customer Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inp} />
          </div>
          <div>
            <label className={lbl}>Terms &amp; Conditions</label>
            <textarea value={termsConditions} onChange={e => setTermsConditions(e.target.value)} rows={3} className={inp}
              placeholder="Enter the terms and conditions of your business…" />
          </div>
        </div>

        {/* Attachments */}
        <div className="mb-8">
          <label className={lbl}>Attach File(s) to Invoice</label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 py-4 text-sm text-gray-500 hover:border-orange-300 hover:bg-orange-50/50">
            <Upload className="h-4 w-4" />
            Upload File
            <span className="text-xs text-gray-400">(JPG, PNG, PDF · max 10MB · up to {MAX_ATTACHMENTS})</span>
            <input type="file" className="hidden" multiple
              accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,application/pdf"
              onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          </label>
          {pendingFiles.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {pendingFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                  <span className="flex items-center gap-2 truncate text-gray-700">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-gray-400">{fmtBytes(f.size)}</span>
                  </span>
                  <button onClick={() => removeFile(i)} className="shrink-0 text-gray-400 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {err && <p className="mb-4 text-sm text-red-500">{err}</p>}

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
          <button onClick={() => router.push('/admin/invoices')} className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => save(false)} disabled={saving || uploadingAttachments}
            className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Save as Draft
          </button>
          <button onClick={() => save(true)} disabled={saving || uploadingAttachments}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            <Save className="h-4 w-4" />
            {uploadingAttachments ? 'Uploading attachments…' : saving ? 'Saving…' : 'Save and Send'}
          </button>
        </div>
      </div>
    </>
  )
}
