'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, XCircle, AlertCircle, Loader2, FileText, ImageIcon } from 'lucide-react'

// Public (no admin login) payment-verification review page — reached from
// the "Review & Approve / Reject Payment" button in the Payment
// Verification Needed email. See app/api/payment-verification/[token]/
// route.ts for the backing API and lib/payment-verification-token.ts for
// the token model (same pattern as the indemnity bond signing link at
// app/indemnity/[token]/page.tsx, whose Shell wrapper this mirrors).

interface ReviewData {
  payment: {
    payment_id:     string
    customer_name:  string
    amount:         number
    payment_status: string
    proof_url:      string | null
    proof_type:     'image' | 'pdf' | null
    created_at:     string
  }
  booking: { tracking_id: string; route: string } | null
  inquiryId: string | null
  actionable: boolean
}

function fmtRs(n: number): string {
  return 'Rs. ' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDateTime(d: string): string {
  try {
    return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return d }
}

const STATUS_LABEL: Record<string, string> = {
  pending_verification: 'Pending Verification',
  paid:                 'Approved',
  rejected:              'Rejected',
}

export default function PaymentVerificationPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ''

  const [data,       setData]       = useState<ReviewData | null>(null)
  const [loading,     setLoading]   = useState(true)
  const [loadError,   setLoadError] = useState<string | null>(null)
  const [acting,      setActing]    = useState<'approve' | 'reject' | null>(null)
  const [actionMsg,   setActionMsg] = useState<string | null>(null)
  const [actionErr,   setActionErr] = useState<string | null>(null)
  const [confirmingReject, setConfirmingReject] = useState(false)

  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const r = await fetch(`/api/payment-verification/${token}`)
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setLoadError(d.error ?? 'This link is invalid.'); return }
        setData(d as ReviewData)
      } catch {
        setLoadError('Network error — please try again.')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  async function doAction(action: 'approve' | 'reject') {
    setActing(action); setActionErr(null)
    try {
      const r = await fetch(`/api/payment-verification/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setActionErr(d.error ?? 'Failed to update payment'); setActing(null); return }
      setActionMsg(d.message ?? 'Done.')
      setData(prev => prev ? {
        ...prev,
        actionable: false,
        payment: { ...prev.payment, payment_status: action === 'approve' ? 'paid' : 'rejected' },
      } : prev)
    } catch {
      setActionErr('Network error — please try again.')
    } finally {
      setActing(null)
      setConfirmingReject(false)
    }
  }

  return (
    <Shell>
      {loading && (
        <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
          <p className="text-sm text-gray-400">Loading payment details…</p>
        </div>
      )}

      {!loading && (loadError || !data) && (
        <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-base font-semibold text-gray-700">{loadError ?? 'This link is invalid.'}</p>
          <p className="text-sm text-gray-400">Please check the Booking Workflow in the admin dashboard instead, or contact the team at info@bagdrop.co.</p>
        </div>
      )}

      {!loading && data && (
        <>
          <div className="border-b border-gray-100 px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Payment Verification</p>
            <p className="text-lg font-bold text-gray-800">{data.booking?.tracking_id ?? data.payment.payment_id}</p>
            <p className="text-sm text-gray-400">{data.payment.payment_id}</p>
          </div>

          <div className="p-6 space-y-5">
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-1.5 pr-3 text-gray-500 align-top">Customer Name</td><td className="py-1.5 font-semibold text-gray-800">{data.payment.customer_name}</td></tr>
                {data.booking && <tr><td className="py-1.5 pr-3 text-gray-500 align-top">Booking ID</td><td className="py-1.5 font-semibold text-gray-800">{data.booking.tracking_id}</td></tr>}
                {data.inquiryId && <tr><td className="py-1.5 pr-3 text-gray-500 align-top">Inquiry ID</td><td className="py-1.5 font-semibold text-gray-800">{data.inquiryId}</td></tr>}
                {data.booking && <tr><td className="py-1.5 pr-3 text-gray-500 align-top">Route</td><td className="py-1.5 font-semibold text-gray-800">{data.booking.route}</td></tr>}
                <tr><td className="py-1.5 pr-3 text-gray-500 align-top">Payment Amount</td><td className="py-1.5 font-bold text-orange-600">{fmtRs(data.payment.amount)}</td></tr>
                <tr><td className="py-1.5 pr-3 text-gray-500 align-top">Uploaded</td><td className="py-1.5 font-semibold text-gray-800">{fmtDateTime(data.payment.created_at)}</td></tr>
                <tr><td className="py-1.5 pr-3 text-gray-500 align-top">Status</td><td className="py-1.5 font-semibold text-gray-800">{STATUS_LABEL[data.payment.payment_status] ?? data.payment.payment_status}</td></tr>
              </tbody>
            </table>

            {data.payment.proof_url && (
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-500">Uploaded Proof</p>
                {data.payment.proof_type === 'pdf' ? (
                  <a href={data.payment.proof_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                    <FileText className="h-4 w-4" /> View Payment Receipt (PDF)
                  </a>
                ) : (
                  <a href={data.payment.proof_url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={data.payment.proof_url} alt="Payment proof"
                      className="max-h-80 w-full rounded-lg border border-gray-200 object-contain bg-gray-50" />
                    <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-gray-500">
                      <ImageIcon className="h-3.5 w-3.5" /> Tap to view full size
                    </span>
                  </a>
                )}
              </div>
            )}

            {actionErr && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                {actionErr}
              </div>
            )}

            {actionMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> {actionMsg}
              </div>
            )}

            {!actionMsg && !data.actionable && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600">
                This payment is already marked <strong>{STATUS_LABEL[data.payment.payment_status] ?? data.payment.payment_status}</strong> — no further action needed here.
              </div>
            )}

            {!actionMsg && data.actionable && (
              <div className="space-y-2 border-t border-gray-100 pt-4">
                {!confirmingReject ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button onClick={() => doAction('approve')} disabled={!!acting}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-40">
                      {acting === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {acting === 'approve' ? 'Approving…' : 'Approve Payment'}
                    </button>
                    <button onClick={() => setConfirmingReject(true)} disabled={!!acting}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-40">
                      <XCircle className="h-4 w-4" /> Reject Payment
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-700">Reject this payment? The customer will need to re-submit proof.</p>
                    <div className="flex gap-2">
                      <button onClick={() => doAction('reject')} disabled={!!acting}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40">
                        {acting === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        {acting === 'reject' ? 'Rejecting…' : 'Yes, Reject'}
                      </button>
                      <button onClick={() => setConfirmingReject(false)} disabled={!!acting}
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400">Approving auto-confirms the booking and notifies the customer. Rejecting does not.</p>
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="bg-orange-500 px-6 py-4">
          <span className="text-lg font-black text-white">BAGDROP</span>
        </div>
        {children}
      </div>
    </div>
  )
}
