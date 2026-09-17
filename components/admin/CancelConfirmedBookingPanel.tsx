'use client'

// BAGDROP — components/admin/CancelConfirmedBookingPanel.tsx
//
// "Cancel Booking" for a CONFIRMED/paid booking, with a refund step —
// founder spec 2026-09-17 (BDA-2026-0163, Mr. Rakesh Patel): "i want to
// cancel this confirmed booking because client has some medical issue so
// we have already refund to that client and that refund should show in
// dashboard analytics current month card refund."
//
// components/admin/CancelBookingPanel.tsx deliberately refuses to render
// outside UNCONFIRMED_BOOKING_STATUSES (founder spec 2026-08-31: "be
// careful with confirmed bookings... focus this functionality on
// unconfirmed inquiries/bookings") — that panel is left completely
// untouched. This is a SEPARATE, parallel panel for the higher-stakes case
// that spec explicitly deferred: a confirmed/paid booking the admin needs
// to cancel after money has already moved, most often because it's being
// refunded.
//
// What it does, in order:
//   1. Fetches this booking's own payments (GET /api/admin/payments?
//      booking_id=...) to find real 'paid' rows and total the amount
//      actually collected — used only to default/guide the refund-amount
//      field, editable by the admin for a partial refund.
//   2. On confirm: PATCHes the booking to status='cancelled' (same route,
//      same status_history convention CancelBookingPanel already uses —
//      'cancelled' isn't in STATUS_ORDER so isForwardMove treats it as
//      always allowed, and the bookings PATCH route already skips payment/
//      invoice/confirmation logic for it).
//   3. If a refund amount was entered AND real paid payment rows exist,
//      walks them oldest-first and PATCHes each to payment_status:
//      'refunded' + refund_amount (+ refund_reason), same shape
//      app/(admin)/admin/payments/page.tsx's own refundPayment() sends —
//      this is what makes the refund appear in Dashboard Analytics'
//      Refunds card (lib/dashboard-analytics-v2.ts's refundsInRange filters
//      on payments.refund_amount > 0). A row with payment_status='refunded'
//      stops counting toward totalPaid entirely (lib/payment-status.ts) —
//      correct for a full refund of that row; entering less than the full
//      paid total still zeroes the LAST row's contribution rather than
//      leaving a precise partial balance, matching the exact same
//      limitation the standalone Payments-page Refund button already has
//      (nothing new introduced here).
//   4. If no real paid payment row exists for this booking (e.g. it was
//      marked paid via an admin bypass with no logged payment — see
//      lib/dashboard-analytics-v2.ts's synthetic-payments handling), the
//      booking still cancels but the admin is told plainly that no refund
//      could be recorded automatically, so they can log it manually.

import { useEffect, useState } from 'react'
import { Ban, X, Loader2 } from 'lucide-react'
import { ACTIVE_BOOKING_STATUSES } from '@/lib/booking-status'

export interface CancelConfirmedBookingTarget {
  bookingId: string
  bookingStatus: string
  trackingId: string
}

const CANCELLATION_REASONS: { value: string; label: string }[] = [
  { value: 'medical_emergency',   label: 'Customer medical emergency / health issue' },
  { value: 'customer_requested',  label: 'Customer requested cancellation' },
  { value: 'flight_change',       label: 'Flight/travel plan changed' },
  { value: 'service_issue',       label: 'Service issue on our side' },
  { value: 'other',               label: 'Other' },
]

type PaidPaymentRow = { id: string; amount: number; created_at: string }

export default function CancelConfirmedBookingPanel({ target, adminKey, onCancelled }: {
  target: CancelConfirmedBookingTarget; adminKey: string; onCancelled: () => void
}) {
  const [step, setStep]         = useState<'closed' | 'form' | 'confirm'>('closed')
  const [reason, setReason]     = useState('')
  const [notes, setNotes]       = useState('')
  const [cancelledBy, setCancelledBy] = useState('')
  const [notifyCustomer, setNotifyCustomer] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr]           = useState('')

  const [loadingPayments, setLoadingPayments] = useState(false)
  const [paidRows, setPaidRows]   = useState<PaidPaymentRow[]>([])
  const [refundAmount, setRefundAmount] = useState('')

  useEffect(() => {
    setCancelledBy(typeof window !== 'undefined' ? (localStorage.getItem('bagdrop_admin_name') ?? '') : '')
  }, [])

  // Defensive backstop, mirroring CancelBookingPanel's own — never renders
  // for a not-yet-confirmed booking (that's CancelBookingPanel's job) or a
  // completed/already-cancelled/rejected one.
  if (!ACTIVE_BOOKING_STATUSES.includes(target.bookingStatus)) return null

  const reasonLabel = CANCELLATION_REASONS.find(r => r.value === reason)?.label ?? ''
  const notesRequired = reason === 'other'
  const totalPaid = paidRows.reduce((s, p) => s + p.amount, 0)

  async function openForm() {
    setErr(''); setReason(''); setNotes(''); setStep('form')
    setLoadingPayments(true)
    try {
      const res = await fetch(`/api/admin/payments?booking_id=${encodeURIComponent(target.bookingId)}&limit=50`, {
        headers: { 'x-admin-key': adminKey },
      })
      const d = await res.json().catch(() => ({}))
      const rows: PaidPaymentRow[] = (d.payments ?? [])
        .filter((p: { payment_status: string; is_synthetic?: boolean }) => p.payment_status === 'paid' && !p.is_synthetic)
        .map((p: { id: string; amount: number; created_at: string }) => ({ id: p.id, amount: Number(p.amount) || 0, created_at: p.created_at }))
        .sort((a: PaidPaymentRow, b: PaidPaymentRow) => a.created_at.localeCompare(b.created_at))
      setPaidRows(rows)
      const sum = rows.reduce((s, p) => s + p.amount, 0)
      setRefundAmount(sum > 0 ? String(sum) : '')
    } finally {
      setLoadingPayments(false)
    }
  }

  function goToConfirm() {
    setErr('')
    if (!reason) { setErr('Please select a reason.'); return }
    if (notesRequired && !notes.trim()) { setErr('Please enter a reason — required when "Other" is selected.'); return }
    if (refundAmount.trim()) {
      const n = Number(refundAmount)
      if (!Number.isFinite(n) || n < 0) { setErr('Refund amount must be a valid non-negative number.'); return }
    }
    setStep('confirm')
  }

  async function confirmCancel() {
    setSubmitting(true); setErr('')
    if (typeof window !== 'undefined' && cancelledBy.trim()) {
      localStorage.setItem('bagdrop_admin_name', cancelledBy.trim())
    }
    const note = `Reason: ${reasonLabel}`
      + (notes.trim() ? ` | Notes: ${notes.trim()}` : '')
      + (cancelledBy.trim() ? ` | Cancelled by: ${cancelledBy.trim()}` : '')
      + (Number(refundAmount) > 0 ? ` | Refunded: ₹${Number(refundAmount).toLocaleString('en-IN')}` : '')

    try {
      const res = await fetch('/api/admin/bookings/' + target.bookingId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          status: 'cancelled',
          reason: note,
          ...(notifyCustomer ? {} : { admin_approve: true }),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErr(d.error ?? 'Failed to cancel booking.')
        setSubmitting(false)
        return
      }

      // ── Refund the linked payment(s), oldest first, up to the entered
      // amount — see module comment for why this mirrors the Payments
      // page's own refundPayment() exactly. Best-effort per row: a failure
      // partway is surfaced, not swallowed, since the booking is already
      // cancelled at this point and the admin needs to know what still
      // needs manual attention on the Payments page.
      let remaining = Number(refundAmount) || 0
      const failedRows: string[] = []
      if (remaining > 0 && paidRows.length > 0) {
        for (const row of paidRows) {
          if (remaining <= 0) break
          const applyAmt = Math.min(remaining, row.amount)
          const rRes = await fetch(`/api/admin/payments/${row.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
            body: JSON.stringify({ payment_status: 'refunded', refund_reason: note, refund_amount: applyAmt }),
          })
          if (!rRes.ok) failedRows.push(row.id)
          else remaining -= applyAmt
        }
      }

      setStep('closed')
      setSubmitting(false)
      if (failedRows.length > 0) {
        alert(`Booking was cancelled, but ${failedRows.length} payment record(s) could not be marked refunded automatically. Please mark them refunded manually on the Payments page.`)
      } else if (remaining > 0 && Number(refundAmount) > 0) {
        alert(`Booking was cancelled. ₹${remaining.toLocaleString('en-IN')} of the entered refund amount couldn't be applied — no matching paid payment record was found for the remainder. Log it manually on the Payments page if needed.`)
      }
      onCancelled()
    } catch {
      setErr('Failed to cancel booking — please try again.')
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); openForm() }}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 hover:border-red-400 transition-colors">
        <Ban className="h-3.5 w-3.5" />
        Cancel Booking
      </button>

      {step !== 'closed' && (
        <div onClick={e => { e.stopPropagation() }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                {step === 'form' ? 'Cancel Confirmed Booking' : 'Confirm Cancellation'}
              </h3>
              <button onClick={() => setStep('closed')} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>

            <p className="mb-3 text-xs text-gray-500">
              Booking: <span className="font-semibold text-gray-700">{target.trackingId}</span> — payment has already
              been collected on this booking. Cancelling it will not touch the payment records unless you enter a
              refund amount below.
            </p>

            {step === 'form' ? (
              <>
                <div className="mb-3 space-y-1">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Please select a reason</label>
                  <select value={reason} onChange={e => setReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400">
                    <option value="">Select a reason…</option>
                    {CANCELLATION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>

                <div className="mb-3 space-y-1">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Additional Notes / Reason {notesRequired ? '(required)' : '(optional)'}
                  </label>
                  <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder={notesRequired ? 'Please describe the reason…' : 'Any extra detail for the record (optional)'}
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400" />
                </div>

                <div className="mb-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Refund Amount (₹) — leave blank if nothing is being refunded
                  </label>
                  {loadingPayments ? (
                    <p className="flex items-center gap-1.5 text-xs text-amber-700"><Loader2 className="h-3 w-3 animate-spin" /> Loading payment records…</p>
                  ) : (
                    <>
                      <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
                      <p className="text-[11px] text-amber-700/80">
                        {paidRows.length > 0
                          ? `₹${totalPaid.toLocaleString('en-IN')} was collected on this booking — pre-filled as a full refund. Edit for a partial refund.`
                          : 'No paid payment record was found for this booking — the amount entered here will not be applied automatically. Log it manually on the Payments page.'}
                      </p>
                      <p className="text-[11px] text-amber-700/80">
                        A non-zero amount here marks the linked payment(s) as Refunded so it shows in the Dashboard&apos;s Refunds card for this month.
                      </p>
                    </>
                  )}
                </div>

                <div className="mb-3 space-y-1">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Your name (for the record)</label>
                  <input value={cancelledBy} onChange={e => setCancelledBy(e.target.value)} placeholder="e.g. Aditya"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400" />
                </div>

                <label className="mb-4 flex items-center gap-1.5 text-xs font-medium text-gray-500 cursor-pointer select-none">
                  <input type="checkbox" checked={notifyCustomer} onChange={e => setNotifyCustomer(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-red-500 focus:ring-red-400" />
                  Notify customer that their booking was cancelled
                </label>

                {err && <p className="mb-3 text-xs text-red-500">{err}</p>}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button onClick={goToConfirm}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-colors">
                    Continue
                  </button>
                  <button onClick={() => setStep('closed')}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-gray-700">Are you sure you want to cancel this confirmed booking?</p>
                <div className="mb-4 space-y-1.5 rounded-lg bg-gray-50 p-3 text-xs">
                  <p><span className="font-semibold text-gray-500">Reason:</span> <span className="text-gray-800">{reasonLabel}</span></p>
                  <p><span className="font-semibold text-gray-500">Notes:</span> <span className="text-gray-800">{notes.trim() || '—'}</span></p>
                  <p><span className="font-semibold text-gray-500">Refund amount:</span> <span className="text-gray-800">{Number(refundAmount) > 0 ? `₹${Number(refundAmount).toLocaleString('en-IN')}` : 'None'}</span></p>
                  <p><span className="font-semibold text-gray-500">Notify customer:</span> <span className="text-gray-800">{notifyCustomer ? 'Yes' : 'No'}</span></p>
                </div>

                {err && <p className="mb-3 text-xs text-red-500">{err}</p>}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button onClick={confirmCancel} disabled={submitting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors">
                    {submitting ? 'Cancelling…' : 'Confirm Cancellation'}
                  </button>
                  <button onClick={() => setStep('form')} disabled={submitting}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
