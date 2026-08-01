import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { BackHeader } from '@/components/BackHeader'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchAdminBooking, updateBooking, AdminBooking } from '@/lib/api'
import { BOOKING_FUNNEL, statusLabel } from '@/shared/statuses'
import { rupees } from '@/shared/quotes'
import { formatDateTime, formatCustomerName } from '@/shared/format'

const PAYMENT_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'approved_pending', label: 'Approved (pending payment)' },
]

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { adminKey } = useAdminAuth()
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

  useEffect(() => { load() }, [load])

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
      const { booking: b } = await updateBooking(adminKey, id, {
        payment_status: paymentStatusValue,
        payment_reference: paymentReference.trim() || undefined,
      })
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
        <View style={styles.kv}><Text style={styles.k}>Status</Text><Text style={styles.v}>{booking.payment_status || 'pending'}</Text></View>
        {booking.payment_method ? <View style={styles.kv}><Text style={styles.k}>Method</Text><Text style={styles.v}>{booking.payment_method}</Text></View> : null}
        {booking.payment_reference ? <View style={styles.kv}><Text style={styles.k}>Reference</Text><Text style={styles.v}>{booking.payment_reference}</Text></View> : null}
      </Card>

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
              options={PAYMENT_OPTIONS}
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
})
