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
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchAdminBooking, updateBooking, updatePayment, uploadPaymentProof, fetchPayments, fetchInvoices, AdminBooking } from '@/lib/api'
import { BOOKING_FUNNEL, statusLabel } from '@/shared/statuses'
import { rupees } from '@/shared/quotes'
import { formatDateTime, formatCustomerName } from '@/shared/format'

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

  const load = useCallback(async () => {
    if (!adminKey || !id) return
    setError('')
    try {
      const { booking: b } = await fetchAdminBooking(adminKey, id)
      setBooking(b)
      setStatusValue(b.status)
      setPaymentStatusValue(b.payment_status ?? 'pending')
      setPaymentReference(b.payment_reference ?? '')
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
