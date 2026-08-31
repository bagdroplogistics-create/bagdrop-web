'use client'

// BAGDROP — components/admin/CancelBookingPanel.tsx
//
// "Cancel Booking" action for inquiries Admin has decided we cannot/will not
// fulfill (out of service area, route unsupported, customer declined the
// quote, etc.) — founder spec 2026-08-31: "Add a Cancel Booking button...
// for inquiries/bookings that are not yet confirmed... Do not automatically
// cancel an inquiry... Admin must manually choose to cancel it."
//
// Deliberately reuses the EXISTING status architecture instead of building
// a parallel cancellation system:
//   - Sets bookings.status = 'cancelled' (already a first-class status —
//     see STATUS_CONFIG in app/(admin)/admin/page.tsx and
//     BOOKING_STATUS_CONFIG in app/(admin)/admin/leads/page.tsx — both
//     already render it correctly).
//   - Goes through the existing PATCH /api/admin/bookings/[id] route, same
//     one every other status change uses. No new endpoint. That route
//     already: locks completed bookings, appends to status_history, skips
//     payment/invoice/confirmation logic entirely for a non-forward/
//     unlisted status like 'cancelled', and removes any Google Calendar
//     event for a cancelled booking (see its isCancelledOrRejected check).
//   - Reason + notes + who + when are packed into the same
//     status_history[].note / changed_by / timestamp fields every other
//     status change already writes to — bookings has no dedicated
//     cancellation_reason column (matches how 'rejected' partially works,
//     and exactly how app/api/admin/reports/detailed/route.ts's
//     lastHistoryEntryTo() already reads a cancelled booking's reason back
//     out for reporting, with zero code changes needed there).
//
// Defensive backstop: refuses to render for anything outside
// UNCONFIRMED_BOOKING_STATUSES, independent of whatever gate the caller
// uses — same pattern as ReviewPanel's completed-only guard — so this can
// never be used to casually cancel a confirmed/ongoing/completed booking.

import { useEffect, useState } from 'react'
import { Ban, X } from 'lucide-react'
import { UNCONFIRMED_BOOKING_STATUSES } from '@/lib/booking-status'

export interface CancelBookingTarget {
  bookingId: string
  bookingStatus: string
  /** Shown in the confirmation modal only — a booking's tracking_id. */
  trackingId: string
}

const CANCELLATION_REASONS: { value: string; label: string }[] = [
  { value: 'service_area',           label: 'Location not in our service area' },
  { value: 'route_unsupported',      label: 'Route not supported' },
  { value: 'service_unavailable',    label: 'Service unavailable' },
  { value: 'operational_limitation', label: 'Operational limitation' },
  { value: 'quotation_declined',     label: 'Customer declined quotation' },
  { value: 'no_longer_interested',   label: 'Customer no longer interested' },
  { value: 'cannot_provide_service', label: 'Unable to provide requested service' },
  { value: 'other',                  label: 'Other' },
]

export default function CancelBookingPanel({ target, adminKey, onCancelled }: {
  target: CancelBookingTarget; adminKey: string; onCancelled: () => void
}) {
  const [step, setStep]           = useState<'closed' | 'form' | 'confirm'>('closed')
  const [reason, setReason]       = useState('')
  const [notes, setNotes]         = useState('')
  const [cancelledBy, setCancelledBy] = useState('')
  // Matches the existing "Admin Approve (don't notify customer)" checkbox
  // already used by StatusSelect for every other status change — default
  // stays ON here because notifyBookingStatus already has a 'cancelled'
  // template (lib/notifications.ts) and sending it is the existing default
  // behavior for the one cancel path that already existed (StatusSelect's
  // pre-quote escape hatch).
  const [notifyCustomer, setNotifyCustomer] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr]             = useState('')

  useEffect(() => {
    setCancelledBy(typeof window !== 'undefined' ? (localStorage.getItem('bagdrop_admin_name') ?? '') : '')
  }, [])

  // Defensive backstop — see module comment. Must never render for a
  // confirmed/ongoing/completed/already-cancelled/rejected booking even if
  // a caller's own gate is ever loosened by mistake.
  if (!UNCONFIRMED_BOOKING_STATUSES.includes(target.bookingStatus)) return null

  const reasonLabel = CANCELLATION_REASONS.find(r => r.value === reason)?.label ?? ''
  const notesRequired = reason === 'other'

  function openForm() {
    setErr(''); setReason(''); setNotes(''); setStep('form')
  }

  function goToConfirm() {
    setErr('')
    if (!reason) { setErr('Please select a reason.'); return }
    if (notesRequired && !notes.trim()) { setErr('Please enter a reason — required when "Other" is selected.'); return }
    setStep('confirm')
  }

  async function confirmCancel() {
    setSubmitting(true); setErr('')
    if (typeof window !== 'undefined' && cancelledBy.trim()) {
      localStorage.setItem('bagdrop_admin_name', cancelledBy.trim())
    }
    // Single self-contained, human-readable string — matches the plain-text
    // `note` shape every other status_history entry already uses (see
    // `reason ?? notes ?? null` in the PATCH route), so no new parsing
    // logic is needed anywhere that already reads status_history back out.
    const note = `Reason: ${reasonLabel}`
      + (notes.trim() ? ` | Notes: ${notes.trim()}` : '')
      + (cancelledBy.trim() ? ` | Cancelled by: ${cancelledBy.trim()}` : '')

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
      setStep('closed')
      setSubmitting(false)
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
        <div onClick={e => { e.stopPropagation(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                {step === 'form' ? 'Cancel Booking' : 'Confirm Cancellation'}
              </h3>
              <button onClick={() => setStep('closed')} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>

            <p className="mb-3 text-xs text-gray-500">
              Inquiry: <span className="font-semibold text-gray-700">{target.trackingId}</span>
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
                <p className="mb-3 text-sm text-gray-700">Are you sure you want to cancel this booking/inquiry?</p>
                <div className="mb-4 space-y-1.5 rounded-lg bg-gray-50 p-3 text-xs">
                  <p><span className="font-semibold text-gray-500">Reason:</span> <span className="text-gray-800">{reasonLabel}</span></p>
                  <p><span className="font-semibold text-gray-500">Notes:</span> <span className="text-gray-800">{notes.trim() || '—'}</span></p>
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
