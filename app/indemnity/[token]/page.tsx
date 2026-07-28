'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, AlertCircle, PenLine, Upload, ShieldCheck, RotateCcw } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────

interface BondData {
  booking: {
    tracking_id: string
    customer_name: string | null
    customer_email_masked: string | null
    customer_phone_masked: string | null
    service_label: string | null
    is_airport_delivery: boolean
  }
  bond: {
    otp_verified: boolean
    aadhaar_number: string | null
    passport_number: string | null
    licence_number: string | null
    bond_date: string | null
    bond_place: string | null
    token_expires_at: string
  }
}

const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200'
const labelCls = 'mb-1 block text-xs font-semibold text-gray-500'

// ── Signature Pad ──────────────────────────────────────────────────────

function SignaturePad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const hasDrawnRef = useRef(false)

  // Keep the canvas's internal bitmap resolution in sync with its actual
  // rendered CSS size (scaled by devicePixelRatio for crisp lines).
  // Previously the canvas had fixed width/height attributes (500x160) but
  // was stretched to 100% of its container via CSS (`w-full`) — on any
  // screen narrower than 500px (i.e. basically every phone), the on-screen
  // size and the internal drawing coordinate space didn't match, so
  // pointer position and where the ink actually landed drifted apart as
  // you drew. That's what made the signature look wrong/garbled and land
  // oddly once embedded in the PDF. Sizing the bitmap to match the
  // rendered box (via ResizeObserver, since it can change on rotation/
  // resize) keeps getBoundingClientRect() and the canvas coordinate space
  // 1:1 at all times.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      const ctx = canvas.getContext('2d')
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
      hasDrawnRef.current = false
      onChange(null)
    })
    observer.observe(canvas)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    drawingRef.current = true
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(e)
    ctx?.beginPath()
    ctx?.moveTo(x, y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111827'
    ctx.lineTo(x, y)
    ctx.stroke()
    hasDrawnRef.current = true
  }

  function end() {
    drawingRef.current = false
    emit()
  }

  function emit() {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawnRef.current) { onChange(null); return }
    canvas.toBlob(blob => onChange(blob), 'image/png')
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Clear in raw device-pixel space regardless of the DPR transform
      // set up above, so this always clears the full bitmap exactly.
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
    }
    hasDrawnRef.current = false
    onChange(null)
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50">
        <canvas
          ref={canvasRef}
          className="block aspect-[25/8] w-full touch-none bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-gray-300">Draw your signature here</p>
      </div>
      <button type="button" onClick={clear}
        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700">
        <RotateCcw className="h-3 w-3" /> Clear signature
      </button>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────

export default function IndemnityBondPage() {
  const { token } = useParams<{ token: string }>()

  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadErr] = useState<string | null>(null)
  const [data, setData]         = useState<BondData | null>(null)

  // OTP state
  const [otpVerified, setOtpVerified] = useState(false)
  const [otpChannel,  setOtpChannel]  = useState<'email' | 'phone' | null>(null)
  const [otpSent,     setOtpSent]     = useState(false)
  const [otpCode,     setOtpCode]     = useState('')
  const [otpSending,  setOtpSending]  = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpError,    setOtpError]    = useState<string | null>(null)
  const [otpSentTo,   setOtpSentTo]   = useState<string | null>(null)

  // Form state
  const [aadhaarNumber,  setAadhaarNumber]  = useState('')
  const [passportNumber, setPassportNumber] = useState('')
  const [licenceNumber,  setLicenceNumber]  = useState('')
  const [bondDate,       setBondDate]       = useState(() => new Date().toISOString().slice(0, 10))
  const [bondPlace,      setBondPlace]      = useState('')
  const [signatureBlob,  setSignatureBlob]  = useState<Blob | null>(null)
  const [alcoholSignatureBlob, setAlcoholSignatureBlob] = useState<Blob | null>(null)
  const [aadhaarDoc,     setAadhaarDoc]     = useState<File | null>(null)
  const [passportDoc,    setPassportDoc]    = useState<File | null>(null)
  const [flightDoc,      setFlightDoc]      = useState<File | null>(null)
  const [extraDoc,       setExtraDoc]       = useState<File | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/indemnity/${token}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load this link')
        return d as BondData
      })
      .then(d => {
        setData(d)
        setOtpVerified(d.bond.otp_verified)
        setAadhaarNumber(d.bond.aadhaar_number ?? '')
        setPassportNumber(d.bond.passport_number ?? '')
        setLicenceNumber(d.bond.licence_number ?? '')
        if (d.bond.bond_date) setBondDate(d.bond.bond_date)
        setBondPlace(d.bond.bond_place ?? '')
      })
      .catch(err => setLoadErr(err.message))
      .finally(() => setLoading(false))
  }, [token])

  async function sendOtp(channel: 'email' | 'phone') {
    setOtpChannel(channel); setOtpSending(true); setOtpError(null)
    try {
      const r = await fetch(`/api/indemnity/${token}/otp/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: channel }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not send code')
      setOtpSent(true)
      setOtpSentTo(d.sent_to ?? null)
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Could not send code')
    } finally {
      setOtpSending(false)
    }
  }

  async function verifyOtp() {
    if (!otpChannel || !otpCode.trim()) return
    setOtpVerifying(true); setOtpError(null)
    try {
      const r = await fetch(`/api/indemnity/${token}/otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: otpChannel, otp: otpCode.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Incorrect code')
      setOtpVerified(true)
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Incorrect code')
    } finally {
      setOtpVerifying(false)
    }
  }

  async function submit() {
    if (!data) return
    setSubmitError(null)

    if (!aadhaarNumber.trim() && !passportNumber.trim() && !licenceNumber.trim()) {
      setSubmitError('Please provide at least one of Aadhaar, Passport, or Driving Licence number.'); return
    }
    if (!bondDate || !bondPlace.trim()) { setSubmitError('Date and Place are required.'); return }
    if (!signatureBlob) { setSubmitError('Please draw your signature.'); return }
    if (!alcoholSignatureBlob) { setSubmitError('Please sign the alcohol declaration below your signature.'); return }
    if (!aadhaarDoc) { setSubmitError('Please upload your Aadhaar Card.'); return }
    if (data.booking.is_airport_delivery && !flightDoc) {
      setSubmitError('Please upload your Flight Ticket / Boarding Pass.'); return
    }
    if (!otpVerified) { setSubmitError('Please verify your identity with the OTP before submitting.'); return }

    setSubmitting(true)
    try {
      const form = new FormData()
      form.set('aadhaar_number', aadhaarNumber.trim())
      form.set('passport_number', passportNumber.trim())
      form.set('licence_number', licenceNumber.trim())
      form.set('bond_date', bondDate)
      form.set('bond_place', bondPlace.trim())
      form.set('signature', signatureBlob, 'signature.png')
      form.set('alcohol_signature', alcoholSignatureBlob, 'alcohol-signature.png')
      form.set('aadhaar_doc', aadhaarDoc)
      if (passportDoc) form.set('passport_doc', passportDoc)
      if (flightDoc) form.set('flight_ticket_doc', flightDoc)
      if (extraDoc) form.set('extra_doc', extraDoc)

      const r = await fetch(`/api/indemnity/${token}/submit`, { method: 'POST', body: form })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Submission failed')
      setSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Mirrors the checks inside submit() — used to proactively disable the
  // button and show a checklist, instead of only erroring after a click.
  const canSubmit = !!data
    && otpVerified
    && (!!aadhaarNumber.trim() || !!passportNumber.trim() || !!licenceNumber.trim())
    && !!bondDate && !!bondPlace.trim()
    && !!signatureBlob
    && !!alcoholSignatureBlob
    && !!aadhaarDoc
    && (!data.booking.is_airport_delivery || !!flightDoc)

  // ── Render states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          <p className="text-sm text-gray-400">Loading your indemnity bond…</p>
        </div>
      </Shell>
    )
  }

  if (loadError || !data) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-base font-semibold text-gray-700">{loadError ?? 'This link is invalid.'}</p>
          <p className="text-sm text-gray-400">Please contact Bagdrop support at info@bagdrop.co or WhatsApp us for a new link.</p>
        </div>
      </Shell>
    )
  }

  if (submitted) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-lg font-bold text-gray-800">Indemnity Bond Submitted</p>
          <p className="text-sm text-gray-500 max-w-sm">
            Thank you, {data.booking.customer_name}. We've received your signed bond and documents for booking{' '}
            <span className="font-mono font-semibold text-orange-600">{data.booking.tracking_id}</span>.
            Our team will review them shortly and notify you once approved.
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="border-b border-gray-100 px-6 py-4">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Indemnity Bond</p>
        <p className="text-lg font-bold text-gray-800">Booking {data.booking.tracking_id}</p>
        <p className="text-sm text-gray-400">{data.booking.service_label ?? 'Baggage Delivery'}</p>
      </div>

      {!otpVerified ? (
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            First, let's verify it's really you.
          </div>

          {!otpSent ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Send a verification code to:</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {data.booking.customer_email_masked && (
                  <button onClick={() => sendOtp('email')} disabled={otpSending}
                    className="flex-1 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50">
                    {otpSending && otpChannel === 'email' ? 'Sending…' : `Email: ${data.booking.customer_email_masked}`}
                  </button>
                )}
                {data.booking.customer_phone_masked && (
                  <button onClick={() => sendOtp('phone')} disabled={otpSending}
                    className="flex-1 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50">
                    {otpSending && otpChannel === 'phone' ? 'Sending…' : `Mobile: ${data.booking.customer_phone_masked}`}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Enter the 6-digit code sent to {otpSentTo ?? 'your ' + otpChannel}.
              </p>
              <input type="text" inputMode="numeric" maxLength={6} value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000" className={inputCls + ' text-center text-lg tracking-[0.4em] font-mono'} />
              <button onClick={verifyOtp} disabled={otpVerifying || otpCode.trim().length < 4}
                className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40">
                {otpVerifying ? 'Verifying…' : 'Verify Code'}
              </button>
              <button onClick={() => otpChannel && sendOtp(otpChannel)} disabled={otpSending}
                className="w-full text-xs font-semibold text-gray-500 hover:text-gray-700">
                Resend code
              </button>
            </div>
          )}
          {otpError && <p className="text-xs font-semibold text-red-600">{otpError}</p>}
        </div>
      ) : (
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-4 py-2.5 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Identity verified
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600 leading-relaxed">
            I, <strong>{data.booking.customer_name}</strong>, hereby confirm that I hold the identity document(s) below,
            and I have engaged Bagdrop Logistics Solutions for the purpose of moving my baggage / household goods.
            I declare the goods are used, not new, not for sale, and contain no valuables, cash, jewelry, illegal, or
            hazardous items. I understand Bagdrop will take utmost care, though loss or breakage during transportation
            will not be Bagdrop's responsibility. I agree to indemnify and hold Bagdrop Logistics Solutions harmless
            from any claims, losses, damages, liabilities, costs, and expenses arising from the transportation of my
            goods, and confirm I have read and understood this undertaking and agree to be bound by it.
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">Identity Details</p>
            <p className="mb-3 text-xs text-gray-400">Provide at least one of the following.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Aadhaar Number</label>
                <input value={aadhaarNumber} onChange={e => setAadhaarNumber(e.target.value)} className={inputCls} placeholder="XXXX XXXX XXXX" />
              </div>
              <div>
                <label className={labelCls}>Passport Number</label>
                <input value={passportNumber} onChange={e => setPassportNumber(e.target.value)} className={inputCls} placeholder="Optional" />
              </div>
              <div>
                <label className={labelCls}>Driving Licence Number</label>
                <input value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)} className={inputCls} placeholder="Optional" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={bondDate} onChange={e => setBondDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Place</label>
              <input value={bondPlace} onChange={e => setBondPlace(e.target.value)} className={inputCls} placeholder="e.g. Vadodara" />
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-500">
              <PenLine className="h-3.5 w-3.5" /> Signature
            </p>
            <SignaturePad onChange={setSignatureBlob} />
          </div>

          <div>
            <div className="mb-3 rounded-xl border-2 border-red-200 bg-red-50 p-3.5">
              <p className="text-sm font-bold text-red-700">⚠ Alcohol is strictly prohibited in your baggage.</p>
              <p className="mt-1 text-xs text-red-600">
                By signing below, you separately confirm your baggage does not contain any alcohol.
              </p>
            </div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-500">
              <PenLine className="h-3.5 w-3.5" /> Alcohol Declaration Signature <span className="text-red-500">*</span>
            </p>
            <SignaturePad onChange={setAlcoholSignatureBlob} />
          </div>

          <div>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-500">
              <Upload className="h-3.5 w-3.5" /> Documents
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FileField label="Aadhaar Card *" file={aadhaarDoc} onChange={setAadhaarDoc} />
              <FileField label="Passport (optional)" file={passportDoc} onChange={setPassportDoc} />
              {data.booking.is_airport_delivery && (
                <FileField label="Flight Ticket / Boarding Pass *" file={flightDoc} onChange={setFlightDoc} />
              )}
              <FileField label="Additional Document (optional)" file={extraDoc} onChange={setExtraDoc} />
            </div>
            <p className="mt-2 text-xs text-gray-400">Accepted formats: PDF, JPG, PNG. Max 10 MB each.</p>
          </div>

          {submitError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {submitError}
            </div>
          )}

          {!canSubmit && !submitError && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              {!otpVerified && <li>• Verify your identity with the OTP.</li>}
              {!(aadhaarNumber.trim() || passportNumber.trim() || licenceNumber.trim()) && <li>• Provide Aadhaar, Passport, or Licence number.</li>}
              {(!bondDate || !bondPlace.trim()) && <li>• Fill in Date and Place.</li>}
              {!signatureBlob && <li>• Draw your signature.</li>}
              {!alcoholSignatureBlob && <li>• Sign the alcohol declaration.</li>}
              {!aadhaarDoc && <li>• Upload your Aadhaar Card.</li>}
              {data.booking.is_airport_delivery && !flightDoc && <li>• Upload your Flight Ticket / Boarding Pass.</li>}
            </ul>
          )}

          <button onClick={submit} disabled={submitting || !canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Submit Indemnity Bond'}
          </button>
        </div>
      )}
    </Shell>
  )
}

function FileField({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type="file" accept="application/pdf,image/jpeg,image/png"
        onChange={e => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-orange-700 hover:file:bg-orange-100" />
      {file && <p className="mt-1 text-xs text-green-600">✓ {file.name}</p>}
    </div>
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
