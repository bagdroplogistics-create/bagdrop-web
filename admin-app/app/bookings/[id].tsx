import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { BackHeader } from '@/components/BackHeader'
import { PhoneInput } from '@/components/PhoneInput'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import {
  fetchAdminBooking, updateBooking, updatePayment, uploadPaymentProof, fetchPayments, fetchInvoices,
  sendIndemnityBond, fetchIndemnityDocs, reviewIndemnity, createTripSheet,
  AdminBooking, IndemnityBond,
} from '@/lib/api'
import { BOOKING_FUNNEL, statusLabel } from '@/shared/statuses'
import { rupees } from '@/shared/quotes'
import { formatDateTime, formatCustomerName } from '@/shared/format'
import { toE164, parseStoredPhone } from '@/shared/phone-format'
import { shouldShowDriverDetailsStep } from '@/shared/service-type'

// Statuses where the Indemnity Bond card is relevant — mirrors the
// website's combined "Send Indemnity Bond" (Step 7b) + "Awaiting Signed"
// (7c) + "Indemnity Bond Documents" review cards, folded into one card here
// for a single small-screen flow.
const INDEMNITY_CARD_STATUSES = ['confirmed', 'indemnity_bond_sent', 'indemnity_bond_signed']

// Statuses from which the Payment Proof & Verification card is shown —
// mirrors atStatus('payment_received', 'payment_approved') in
// app/(admin)/admin/quotes/view/[lead_id]/page.tsx exactly.
const PROOF_CARD_STATUSES = ['payment_received', 'payment_approved']

// Same DONE_STATUSES set app/api/admin/invoices/route.ts uses to decide
// which bookings are eligible to appear on the Invoices tab at all.
const INVOICE_ELIGIBLE_STATUSES = ['completed', 'invoice_generated', 'invoice_sent']

const PAYMENT_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'approved_pending', label: 'Approved (pending payment)' },
]

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { adminKey, role } = useAdminAuth()
  // "Approved (pending payment)" is the VIP/Admin-Approve-without-payment
  // bypass — website restricts it to role='admin' only
  // (app/api/admin/bookings/[id]/route.ts). Hiding it here for non-admins
  // too, since the field-level fix below (routing through
  // approved_without_payment) makes the backend actually enforce that gate
  // on mobile now, where previously a raw payment_status write skipped it.
  const paymentOptions = role === 'admin' ? PAYMENT_OPTIONS : PAYMENT_OPTIONS.filter(o => o.value !== 'approved_pending')
  const [booking, setBooking] = useState<AdminBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [statusValue, setStatusValue] = useState<string | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusSuccess, setStatusSuccess] = useState(false)

  const [paymentStatusValue, setPaymentStatusValue] = useState<string | null>(null)
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  // Outstanding Amount — same definition as the website's Booking
  // Workflow page: total_amount minus the sum of this booking's 'paid'
  // payments rows (real payments only, no synthetic merge needed here
  // since we already know exactly which booking we're looking at).
  const [paidTotal, setPaidTotal] = useState(0)

  // Payment Proof & Verification — mirrors the same card on
  // app/(admin)/admin/quotes/view/[lead_id]/page.tsx.
  const [proofUploading, setProofUploading] = useState(false)
  const [proofError, setProofError] = useState('')
  const [proofMsg, setProofMsg] = useState('')
  const [verifying, setVerifying] = useState<'approve' | 'reject' | null>(null)

  // Invoice link — resolved lazily once the booking is loaded (only
  // eligible statuses are ever checked, matching DONE_STATUSES on web).
  const [invoiceId, setInvoiceId] = useState<string | null>(null)

  // Indemnity Bond — mirrors Steps 7b/7c + the Indemnity Bond Documents
  // review card on the website.
  const [bond, setBond] = useState<IndemnityBond | null>(null)
  const [bondLoading, setBondLoading] = useState(false)
  const [bondSending, setBondSending] = useState(false)
  const [bondReviewing, setBondReviewing] = useState<'approve' | 'reject' | 'request_resubmission' | null>(null)
  const [bondMsg, setBondMsg] = useState('')
  const [bondErr, setBondErr] = useState('')
  const [markingSignedOffline, setMarkingSignedOffline] = useState(false)

  // Driver Assignment & Share — mirrors doSaveDriverDetails/
  // doShareDriverDetails. "Assigned" is derived from booking.driver_name/
  // driver_phone directly (not local draft state) — same fix the website
  // already applied (see its comment near doSaveDriverDetails).
  const [driverName, setDriverName] = useState('')
  const [driverPhoneNational, setDriverPhoneNational] = useState('')
  const [driverPhoneIso2, setDriverPhoneIso2] = useState('IN')
  const [driverSaving, setDriverSaving] = useState(false)
  const [driverSharing, setDriverSharing] = useState(false)
  const [driverMsg, setDriverMsg] = useState('')
  const [driverErr, setDriverErr] = useState('')

  // Create Trip Sheet — one-tap for the common case (just booking_id);
  // optional driver/vehicle fields for anyone who wants to fill them in
  // now rather than later on the website's Trip Sheets tab.
  const [tripDriverName, setTripDriverName] = useState('')
  const [tripVehicleNumber, setTripVehicleNumber] = useState('')
  const [tripCreating, setTripCreating] = useState(false)
  const [tripMsg, setTripMsg] = useState('')
  const [tripErr, setTripErr] = useState('')

  const load = useCallback(async () => {
    if (!adminKey || !id) return
    setError('')
    try {
      const { booking: b } = await fetchAdminBooking(adminKey, id)
      setBooking(b)
      setStatusValue(b.status)
      setPaymentStatusValue(b.payment_status ?? 'pending')
      setPaymentReference(b.payment_reference ?? '')
      const parsedDriverPhone = parseStoredPhone((b.driver_phone as string | null) ?? '')
      setDriverName((b.driver_name as string | null) ?? '')
      setDriverPhoneNational(parsedDriverPhone.nationalNumber)
      setDriverPhoneIso2(parsedDriverPhone.nationalNumber ? parsedDriverPhone.iso2 : 'IN')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this booking.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, id])

  useEffect(() => {
    if (!adminKey || !id || !booking || !INVOICE_ELIGIBLE_STATUSES.includes(booking.status)) return
    fetchInvoices(adminKey, { bookingId: id })
      .then(res => setInvoiceId(res.invoices[0]?.id ?? null))
      .catch(() => setInvoiceId(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, id, booking?.status])

  const loadBond = useCallback(async () => {
    if (!adminKey || !id || !booking || !INDEMNITY_CARD_STATUSES.includes(booking.status)) return
    setBondLoading(true)
    try {
      const res = await fetchIndemnityDocs(adminKey, id)
      setBond(res.bond)
    } catch {
      setBond(null) // non-fatal — card still shows the Send/Resend action
    } finally {
      setBondLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, id, booking?.status])

  useEffect(() => { loadBond() }, [loadBond])

  const loadPaidTotal = useCallback(async () => {
    if (!adminKey || !id) return
    try {
      const { payments } = await fetchPayments(adminKey, { bookingId: id })
      setPaidTotal(payments.filter(p => p.payment_status === 'paid').reduce((s, p) => s + Number(p.amount), 0))
    } catch { /* non-fatal — outstanding amount just won't show */ }
  }, [adminKey, id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadPaidTotal() }, [loadPaidTotal, booking?.payment_verification_status])

  const outstandingAmount = Math.max(0, (Number(booking?.total_amount) || 0) - paidTotal)

  async function uploadProof(source: 'camera' | 'library' | 'document') {
    if (!adminKey || !id) return
    setProofError(''); setProofMsg('')
    try {
      let file: { uri: string; name: string; type: string } | null = null

      if (source === 'document') {
        const res = await DocumentPicker.getDocumentAsync({
          type: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
          copyToCacheDirectory: true,
        })
        if (res.canceled || !res.assets?.[0]) return
        const asset = res.assets[0]
        file = { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' }
      } else {
        const perm = source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!perm.granted) { setProofError('Permission denied — enable camera/photo access in Settings.'); return }
        const res = source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ImagePicker.MediaTypeOptions.Images })
        if (res.canceled || !res.assets?.[0]) return
        const asset = res.assets[0]
        file = { uri: asset.uri, name: asset.fileName ?? `proof-${Date.now()}.jpg`, type: asset.mimeType ?? 'image/jpeg' }
      }

      if (!file) return
      setProofUploading(true)
      await uploadPaymentProof(adminKey, id, file)
      setProofMsg('✅ Payment proof uploaded. Account Department notified — payment stays Pending Verification until they approve it.')
      await load()
    } catch (e) {
      setProofError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setProofUploading(false)
    }
  }

  async function doVerifyPayment(action: 'approve' | 'reject') {
    if (!adminKey || !booking?.payment_verification_payment_id) return
    setVerifying(action); setProofError(''); setProofMsg('')
    try {
      await updatePayment(adminKey, booking.payment_verification_payment_id, {
        payment_status: action === 'approve' ? 'paid' : 'rejected',
      })
      setProofMsg(action === 'approve' ? '✅ Payment verified and approved.' : 'Payment rejected.')
      await load()
      await loadPaidTotal()
    } catch (e) {
      setProofError(e instanceof Error ? e.message : 'Could not update payment.')
    } finally {
      setVerifying(null)
    }
  }

  // ── Indemnity Bond ────────────────────────────────────────────────────
  async function doSendIndemnityBond() {
    if (!adminKey || !id) return
    setBondSending(true); setBondErr(''); setBondMsg('')
    try {
      await sendIndemnityBond(adminKey, id)
      setBondMsg('✅ Signing link sent to the customer (email + WhatsApp).')
      await load()
      await loadBond()
    } catch (e) {
      setBondErr(e instanceof Error ? e.message : 'Could not send the indemnity bond.')
    } finally {
      setBondSending(false)
    }
  }

  async function doMarkIndemnitySignedOffline() {
    if (!adminKey || !id) return
    setMarkingSignedOffline(true); setBondErr(''); setBondMsg('')
    try {
      const { booking: b } = await updateBooking(adminKey, id, { status: 'indemnity_bond_signed' })
      setBooking(b)
      setBondMsg('✅ Marked as signed offline (paper bond collected in person).')
    } catch (e) {
      setBondErr(e instanceof Error ? e.message : 'Could not update status.')
    } finally {
      setMarkingSignedOffline(false)
    }
  }

  async function doReviewIndemnity(action: 'approve' | 'reject' | 'request_resubmission') {
    if (!adminKey || !id) return
    setBondReviewing(action); setBondErr(''); setBondMsg('')
    try {
      const res = await reviewIndemnity(adminKey, id, action)
      setBond(res.bond)
      setBondMsg(
        action === 'approve' ? '✅ Documents approved.'
        : action === 'reject' ? 'Documents rejected.'
        : 'Resubmission requested — the customer has a fresh signing link.'
      )
      await load()
    } catch (e) {
      setBondErr(e instanceof Error ? e.message : 'Could not update the review.')
    } finally {
      setBondReviewing(null)
    }
  }

  // ── Driver Assignment & Share ────────────────────────────────────────
  async function doSaveDriverDetails() {
    if (!adminKey || !id) return
    setDriverSaving(true); setDriverErr(''); setDriverMsg('')
    try {
      const { booking: b } = await updateBooking(adminKey, id, {
        driver_name: driverName.trim(),
        driver_phone: toE164(driverPhoneNational, driverPhoneIso2),
        driver_phone_country_code: driverPhoneIso2,
        driver_phone_national: driverPhoneNational,
      })
      setBooking(b)
      setDriverMsg('✅ Driver details saved.')
    } catch (e) {
      setDriverErr(e instanceof Error ? e.message : 'Could not save driver details.')
    } finally {
      setDriverSaving(false)
    }
  }

  async function doShareDriverDetails() {
    if (!adminKey || !id || !driverName.trim() || !driverPhoneNational.trim()) {
      setDriverErr('Driver name and phone are required before sharing with the customer.')
      return
    }
    setDriverSharing(true); setDriverErr(''); setDriverMsg('')
    try {
      const { booking: b } = await updateBooking(adminKey, id, {
        status: 'driver_details_shared',
        driver_name: driverName.trim(),
        driver_phone: toE164(driverPhoneNational, driverPhoneIso2),
        driver_phone_country_code: driverPhoneIso2,
        driver_phone_national: driverPhoneNational,
      })
      setBooking(b)
      setDriverMsg('✅ Driver details shared with the customer.')
    } catch (e) {
      setDriverErr(e instanceof Error ? e.message : 'Could not share driver details.')
    } finally {
      setDriverSharing(false)
    }
  }

  // ── Create Trip Sheet ─────────────────────────────────────────────────
  async function doCreateTripSheet() {
    if (!adminKey || !id) return
    setTripCreating(true); setTripErr(''); setTripMsg('')
    try {
      const res = await createTripSheet(adminKey, {
        booking_id: id,
        driver_name: tripDriverName.trim() || undefined,
        vehicle_number: tripVehicleNumber.trim() || undefined,
      })
      setTripMsg(`✅ Trip sheet ${res.trip_number} created.`)
      await load()
    } catch (e) {
      setTripErr(e instanceof Error ? e.message : 'Could not create the trip sheet.')
    } finally {
      setTripCreating(false)
    }
  }

  const isLocked = booking?.status === 'completed'

  async function handleUpdateStatus() {
    if (!adminKey || !id || !statusValue) return
    setError(''); setStatusSaving(true); setStatusSuccess(false)
    try {
      const { booking: b } = await updateBooking(adminKey, id, { status: statusValue })
      setBooking(b)
      setStatusSuccess(true)
      setTimeout(() => setStatusSuccess(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update status.')
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleUpdatePayment() {
    if (!adminKey || !id || !paymentStatusValue) return
    setError(''); setPaymentSaving(true); setPaymentSuccess(false)
    try {
      // "Approved (pending payment)" must go through approved_without_
      // payment, not a raw payment_status write — matches doAdminApprove()
      // in app/(admin)/admin/quotes/view/[lead_id]/page.tsx on the website.
      // Sending payment_status: 'approved_pending' directly used to skip
      // the backend's admin-only role check entirely (any staff user could
      // set it) and left approved_by/approved_without_payment unset,
      // inconsistent with the same state reached from the website. Every
      // other payment status here is unaffected.
      const { booking: b } = await updateBooking(adminKey, id,
        paymentStatusValue === 'approved_pending'
          ? { approved_without_payment: true, payment_reference: paymentReference.trim() || undefined }
          : { payment_status: paymentStatusValue, payment_reference: paymentReference.trim() || undefined }
      )
      setBooking(b)
      setPaymentSuccess(true)
      setTimeout(() => setPaymentSuccess(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update payment.')
    } finally {
      setPaymentSaving(false)
    }
  }

  if (loading) {
    return <Screen><BackHeader /><ActivityIndicator color={colors.brand} /></Screen>
  }

  if (!booking) {
    return (
      <Screen>
        <BackHeader />
        <Text style={styles.errorText}>{error || 'Booking not found.'}</Text>
      </Screen>
    )
  }

  const meta = BOOKING_FUNNEL.find(s => s.key === booking.status)

  return (
    <Screen>
      <BackHeader />
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.trackingId}>{booking.tracking_id}</Text>
          <Text style={styles.title}>{formatCustomerName(booking.title, booking.customer_name) || booking.customer_name}</Text>
          <Text style={styles.sub}>Updated {formatDateTime(booking.updated_at || booking.created_at)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: meta?.bg ?? '#f3f4f6' }]}>
          <Text style={[styles.badgeText, { color: meta?.color ?? '#6b7280' }]}>{statusLabel(booking.status)}</Text>
        </View>
      </View>

      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Contact</Text>
        <View style={styles.kv}><Text style={styles.k}>Phone</Text><Text style={styles.v}>{booking.customer_phone || '—'}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Email</Text><Text style={styles.v}>{booking.customer_email || '—'}</Text></View>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Route & Schedule</Text>
        <View style={styles.kv}><Text style={styles.k}>Route</Text><Text style={styles.v}>{booking.from_city || '—'} → {booking.to_city || '—'}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Service</Text><Text style={styles.v}>{(booking.service_label as string) || (booking.service_type as string) || '—'}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Bags</Text><Text style={styles.v}>{booking.total_bags ?? '—'}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Pickup</Text><Text style={styles.v}>{booking.pickup_date || '—'}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Delivery</Text><Text style={styles.v}>{booking.delivery_date || '—'}</Text></View>
        {booking.pickup_address ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.k}>Pickup Address</Text>
            <Text style={[styles.v, { textAlign: 'left', marginTop: 2 }]}>{booking.pickup_address}</Text>
          </View>
        ) : null}
        {booking.drop_address ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.k}>Drop Address</Text>
            <Text style={[styles.v, { textAlign: 'left', marginTop: 2 }]}>{booking.drop_address}</Text>
          </View>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <View style={styles.kv}><Text style={styles.k}>Amount</Text><Text style={[styles.v, { fontWeight: '800', color: colors.brand, fontSize: 16 }]}>{rupees(Number(booking.total_amount ?? 0))}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Paid</Text><Text style={styles.v}>{rupees(paidTotal)}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Outstanding</Text><Text style={[styles.v, outstandingAmount > 0 && { color: '#d97706', fontWeight: '700' }]}>{rupees(outstandingAmount)}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Status</Text><Text style={styles.v}>{booking.payment_status || 'pending'}</Text></View>
        {booking.payment_method ? <View style={styles.kv}><Text style={styles.k}>Method</Text><Text style={styles.v}>{booking.payment_method}</Text></View> : null}
        {booking.payment_reference ? <View style={styles.kv}><Text style={styles.k}>Reference</Text><Text style={styles.v}>{booking.payment_reference}</Text></View> : null}
        <Pressable
          style={styles.recordPaymentBtn}
          onPress={() => router.push({
            pathname: '/payments/new',
            params: {
              booking_id: booking.id,
              customer_name: formatCustomerName(booking.title, booking.customer_name) || booking.customer_name,
              customer_phone: booking.customer_phone ?? '',
              amount: String(outstandingAmount || booking.total_amount || ''),
            },
          })}
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.brand} />
          <Text style={styles.recordPaymentBtnText}>Record Payment</Text>
        </Pressable>
      </Card>

      {INVOICE_ELIGIBLE_STATUSES.includes(booking.status) && (
        <Pressable
          style={styles.invoiceLinkCard}
          onPress={() => router.push(`/invoices/${invoiceId ?? `pending-${booking.id}`}`)}
        >
          <Ionicons name="receipt" size={18} color={colors.brand} />
          <Text style={styles.invoiceLinkText}>{invoiceId ? 'View Invoice' : 'Generate Invoice'}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.neutralMid} />
        </Pressable>
      )}

      {PROOF_CARD_STATUSES.includes(booking.status) && (
        <Card style={{ marginBottom: 12, backgroundColor: '#f0fdfa', borderColor: '#99f6e4' }}>
          <Text style={[styles.sectionTitle, { color: '#0d9488' }]}>Payment Proof & Verification</Text>

          {booking.payment_verification_status === 'pending_verification' && (
            <View style={styles.verifyBox}>
              <Text style={styles.verifyBoxTitle}>⏳ Payment Verification Pending</Text>
              <Text style={styles.verifyBoxText}>Accounts has been notified. Waiting for them to check and approve.</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <Button label="Approve" onPress={() => doVerifyPayment('approve')} loading={verifying === 'approve'} disabled={!!verifying} style={{ flex: 1 }} />
                <Button label="Reject" variant="outline" onPress={() => doVerifyPayment('reject')} loading={verifying === 'reject'} disabled={!!verifying} style={{ flex: 1 }} />
              </View>
            </View>
          )}

          {booking.payment_verification_status === 'verified' && (
            <Text style={[styles.notesText, { color: '#15803d', fontWeight: '700' }]}>✅ Payment verified and approved by Accounts.</Text>
          )}

          {(!booking.payment_verification_status || booking.payment_verification_status === 'rejected') && (
            <View>
              {booking.payment_verification_status === 'rejected' && (
                <Text style={[styles.notesText, { color: colors.error, fontWeight: '700', marginBottom: 6 }]}>Previous proof was rejected — upload a new one below.</Text>
              )}
              <Text style={styles.notesText}>Upload the customer&apos;s payment screenshot or PDF receipt. This notifies Accounts to check and approve it — it does not mark the payment approved on its own.</Text>
              <View style={styles.uploadRow}>
                <Pressable style={styles.uploadBtn} onPress={() => uploadProof('camera')} disabled={proofUploading}>
                  <Ionicons name="camera" size={16} color={colors.brand} />
                  <Text style={styles.uploadBtnText}>Camera</Text>
                </Pressable>
                <Pressable style={styles.uploadBtn} onPress={() => uploadProof('library')} disabled={proofUploading}>
                  <Ionicons name="image" size={16} color={colors.brand} />
                  <Text style={styles.uploadBtnText}>Gallery</Text>
                </Pressable>
                <Pressable style={styles.uploadBtn} onPress={() => uploadProof('document')} disabled={proofUploading}>
                  <Ionicons name="folder" size={16} color={colors.brand} />
                  <Text style={styles.uploadBtnText}>File</Text>
                </Pressable>
              </View>
              {proofUploading ? <Text style={styles.notesText}>Uploading…</Text> : null}
            </View>
          )}

          {proofMsg ? <Text style={[styles.notesText, { color: '#0d9488', marginTop: 8 }]}>{proofMsg}</Text> : null}
          {proofError ? <Text style={styles.errorText}>{proofError}</Text> : null}
        </Card>
      )}

      {/* ── Indemnity Bond — Steps 7b/7c + document review, combined ── */}
      {INDEMNITY_CARD_STATUSES.includes(booking.status) && (
        <Card style={{ marginBottom: 12, backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }}>
          <Text style={[styles.sectionTitle, { color: '#7c3aed' }]}>Indemnity Bond</Text>

          {booking.status === 'confirmed' && (
            <>
              <Text style={styles.notesText}>Not sent yet — send the secure signing link to the customer.</Text>
              <Button label="Send Indemnity Bond" onPress={doSendIndemnityBond} loading={bondSending} style={{ marginTop: 10 }} />
            </>
          )}

          {booking.status === 'indemnity_bond_sent' && (
            <>
              <Text style={styles.notesText}>Link sent — waiting for the customer to verify by OTP and sign.</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Button label="Resend Link" variant="outline" onPress={doSendIndemnityBond} loading={bondSending} style={{ flex: 1 }} />
                <Button label="Mark Signed Offline" variant="outline" onPress={doMarkIndemnitySignedOffline} loading={markingSignedOffline} style={{ flex: 1 }} />
              </View>
            </>
          )}

          {booking.status === 'indemnity_bond_signed' && (
            <>
              <Text style={[styles.notesText, { color: '#15803d', fontWeight: '700' }]}>✅ Bond signed.</Text>
              {bondLoading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 8 }} /> : null}
              {bond && (
                <View style={{ marginTop: 8 }}>
                  <View style={styles.kv}><Text style={styles.k}>Document Status</Text><Text style={styles.v}>{bond.document_status}</Text></View>
                  {bond.aadhaar_number ? <View style={styles.kv}><Text style={styles.k}>Aadhaar</Text><Text style={styles.v}>{bond.aadhaar_number}</Text></View> : null}
                  {bond.passport_number ? <View style={styles.kv}><Text style={styles.k}>Passport</Text><Text style={styles.v}>{bond.passport_number}</Text></View> : null}
                </View>
              )}
              {(!bond || bond.document_status === 'submitted') && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <Button label="Approve" onPress={() => doReviewIndemnity('approve')} loading={bondReviewing === 'approve'} disabled={!!bondReviewing} style={{ flex: 1 }} />
                  <Button label="Reject" variant="outline" onPress={() => doReviewIndemnity('reject')} loading={bondReviewing === 'reject'} disabled={!!bondReviewing} style={{ flex: 1 }} />
                </View>
              )}
              <Pressable onPress={() => doReviewIndemnity('request_resubmission')} disabled={!!bondReviewing} style={{ marginTop: 8 }}>
                <Text style={[styles.notesText, { color: colors.brand, fontWeight: '700' }]}>
                  {bondReviewing === 'request_resubmission' ? 'Requesting…' : 'Request Resubmission'}
                </Text>
              </Pressable>
            </>
          )}

          {bondMsg ? <Text style={[styles.notesText, { color: '#7c3aed', marginTop: 8 }]}>{bondMsg}</Text> : null}
          {bondErr ? <Text style={styles.errorText}>{bondErr}</Text> : null}
        </Card>
      )}

      {/* ── Driver Assignment & Share — destination-airport bookings only ── */}
      {booking.status === 'out_for_delivery' && shouldShowDriverDetailsStep(booking.service_type) && !booking.driver_details_sent_at && (
        <Card style={{ marginBottom: 12, backgroundColor: '#fff7ed', borderColor: '#fed7aa' }}>
          <Text style={[styles.sectionTitle, { color: '#ea580c' }]}>Driver Assignment</Text>
          <TextField label="Driver Name" value={driverName} onChangeText={setDriverName} placeholder="Driver's full name" />
          <PhoneInput
            label="Driver Phone"
            countryIso2={driverPhoneIso2}
            nationalNumber={driverPhoneNational}
            onCountryChange={setDriverPhoneIso2}
            onNumberChange={setDriverPhoneNational}
            placeholder="9876543210"
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Button label="Save" variant="outline" onPress={doSaveDriverDetails} loading={driverSaving} style={{ flex: 1 }} />
            <Button label="Save & Share" onPress={doShareDriverDetails} loading={driverSharing} style={{ flex: 1 }} />
          </View>
          {driverMsg ? <Text style={[styles.notesText, { color: '#ea580c', marginTop: 8 }]}>{driverMsg}</Text> : null}
          {driverErr ? <Text style={styles.errorText}>{driverErr}</Text> : null}
        </Card>
      )}

      {/* ── Create Trip Sheet — Step 15 ── */}
      {booking.status === 'delivered' && (
        <Card style={{ marginBottom: 12, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <Text style={[styles.sectionTitle, { color: '#15803d' }]}>Create Trip Sheet</Text>
          <Text style={styles.notesText}>Driver/vehicle are optional here — add or edit them later on the Trip Sheets tab if you'd rather do this in one tap.</Text>
          <TextField label="Driver Name (optional)" value={tripDriverName} onChangeText={setTripDriverName} placeholder="Driver's full name" />
          <TextField label="Vehicle Number (optional)" value={tripVehicleNumber} onChangeText={setTripVehicleNumber} placeholder="e.g. GJ-01-AB-1234" />
          <Button label="Create Trip Sheet" onPress={doCreateTripSheet} loading={tripCreating} style={{ marginTop: 6 }} />
          {tripMsg ? <Text style={[styles.notesText, { color: '#15803d', marginTop: 8 }]}>{tripMsg}</Text> : null}
          {tripErr ? <Text style={styles.errorText}>{tripErr}</Text> : null}
        </Card>
      )}

      {booking.notes ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{booking.notes}</Text>
        </Card>
      ) : null}

      {booking.status === 'rejected' && booking.rejection_reason ? (
        <Card style={{ marginBottom: 12, backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
          <Text style={[styles.sectionTitle, { color: '#991b1b' }]}>Rejection Reason</Text>
          <Text style={styles.notesText}>{booking.rejection_reason}</Text>
          {booking.rejection_comment ? <Text style={[styles.notesText, { marginTop: 4 }]}>{booking.rejection_comment}</Text> : null}
        </Card>
      ) : null}

      {isLocked ? (
        <Card style={{ marginBottom: 12, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <Text style={{ ...type.smallBold, color: '#15803d' }}>This booking is completed and locked — status and payment can no longer be changed.</Text>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Update Status</Text>
            <SelectField
              value={statusValue}
              options={BOOKING_FUNNEL.map(s => ({ value: s.key, label: s.label }))}
              onChange={setStatusValue}
            />
            <Button
              label={statusSuccess ? 'Updated ✓' : 'Update Status'}
              onPress={handleUpdateStatus}
              loading={statusSaving}
              disabled={!statusValue || statusValue === booking.status}
              variant={statusSuccess ? 'secondary' : 'primary'}
            />
          </Card>

          <Card style={{ marginBottom: 24 }}>
            <Text style={styles.sectionTitle}>Update Payment</Text>
            <SelectField
              label="Payment Status"
              value={paymentStatusValue}
              options={paymentOptions}
              onChange={setPaymentStatusValue}
            />
            <TextField label="Payment Reference (optional)" value={paymentReference} onChangeText={setPaymentReference} placeholder="UTR / transaction ID" />
            <Button
              label={paymentSuccess ? 'Updated ✓' : 'Update Payment'}
              onPress={handleUpdatePayment}
              loading={paymentSaving}
              variant={paymentSuccess ? 'secondary' : 'outline'}
            />
          </Card>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  trackingId: { ...type.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  title: { ...type.displaySm, color: colors.textPrimary },
  sub: { ...type.small, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { ...type.smallBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  k: { ...type.small, color: colors.textMuted, flex: 1 },
  v: { ...type.smallBold, color: colors.textPrimary, flex: 1, textAlign: 'right' },
  notesText: { ...type.small, color: colors.textPrimary },
  badge: { borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { ...type.caption, fontWeight: '700' },
  errorText: { ...type.small, color: colors.error, textAlign: 'center', marginVertical: 8 },
  recordPaymentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  recordPaymentBtnText: { ...type.smallBold, color: colors.brand },
  invoiceLinkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  invoiceLinkText: { ...type.smallBold, color: colors.textPrimary, flex: 1 },
  verifyBox: { borderWidth: 1, borderColor: '#fcd34d', backgroundColor: '#fef3c7', borderRadius: radius.md, padding: 12 },
  verifyBoxTitle: { ...type.smallBold, color: '#92400e' },
  verifyBoxText: { ...type.caption, color: '#92400e', marginTop: 4 },
  uploadRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  uploadBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, backgroundColor: colors.surface,
  },
  uploadBtnText: { ...type.smallBold, color: colors.brand },
})
