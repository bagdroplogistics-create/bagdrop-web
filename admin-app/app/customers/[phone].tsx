import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Linking } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { BackHeader } from '@/components/BackHeader'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchCustomers, AdminCustomer } from '@/lib/api'
import { statusLabel } from '@/shared/statuses'
import { rupees } from '@/shared/quotes'
import { formatDateTime } from '@/shared/format'

// No standalone single-customer endpoint exists (customers are derived,
// not a real table) — reuses GET /api/admin/customers?search=<phone>,
// same as the list screen, and picks the exact phone match. Mirrors the
// website's ProfileModal in app/(admin)/admin/customers/page.tsx exactly
// (stats row, contact, booking history) as a full screen instead of a
// modal — mobile-first navigation, not a copy of the desktop layout.
export default function CustomerDetail() {
  const { phone: rawPhone } = useLocalSearchParams<{ phone: string }>()
  const phone = decodeURIComponent(rawPhone ?? '')
  const { adminKey } = useAdminAuth()
  const [customer, setCustomer] = useState<AdminCustomer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!adminKey || !phone) return
    setError('')
    try {
      const res = await fetchCustomers(adminKey, { search: phone })
      setCustomer(res.customers.find(c => c.phone === phone) ?? res.customers[0] ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this customer.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, phone])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <Screen><BackHeader /><ActivityIndicator color={colors.brand} /></Screen>
  }
  if (!customer) {
    return <Screen><BackHeader /><Text style={styles.errorText}>{error || 'Customer not found.'}</Text></Screen>
  }

  return (
    <Screen>
      <BackHeader />

      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(customer.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{customer.name || 'Unknown'}</Text>
        <Text style={styles.phone}>{customer.phone}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{customer.total_bookings}</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>
        <View style={[styles.statCell, styles.statCellBorder]}>
          <Text style={styles.statValue}>{rupees(customer.total_spent)}</Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatDateTime(customer.first_booking).split(',')[0]}</Text>
          <Text style={styles.statLabel}>Customer Since</Text>
        </View>
      </View>

      <View style={styles.contactRow}>
        <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${customer.phone}`)}>
          <Ionicons name="call" size={16} color={colors.brand} />
          <Text style={styles.contactBtnText}>Call</Text>
        </Pressable>
        {customer.email ? (
          <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`mailto:${customer.email}`)}>
            <Ionicons name="mail" size={16} color={colors.brand} />
            <Text style={styles.contactBtnText}>Email</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Booking History</Text>
      {customer.bookings.length === 0 ? (
        <Card><Text style={styles.emptyText}>No bookings yet.</Text></Card>
      ) : (
        customer.bookings.map(b => (
          <Pressable key={b.id} onPress={() => router.push(`/bookings/${b.id}`)}>
            <Card style={{ marginBottom: 10 }}>
              <View style={styles.bookingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackingId}>{b.tracking_id}</Text>
                  <Text style={styles.bookingMeta}>{b.from_city} → {b.to_city} · {formatDateTime(b.created_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.bookingAmount}>{rupees(b.total_amount)}</Text>
                  <Text style={styles.bookingStatus}>{statusLabel(b.status)}</Text>
                </View>
              </View>
            </Card>
          </Pressable>
        ))
      )}

      {error ? <Text style={[styles.errorText, { marginBottom: 24 }]}>{error}</Text> : <View style={{ height: 24 }} />}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerCard: { alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  avatarText: { ...type.displaySm, color: colors.brand },
  name: { ...type.h1, color: colors.textPrimary },
  phone: { ...type.small, color: colors.textMuted, marginTop: 2 },
  statsRow: {
    flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    backgroundColor: colors.surface, marginBottom: 16,
  },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statCellBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  statValue: { ...type.bodyBold, color: colors.textPrimary },
  statLabel: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  contactRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  contactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10,
  },
  contactBtnText: { ...type.smallBold, color: colors.brand },
  sectionTitle: { ...type.smallBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  bookingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  trackingId: { ...type.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  bookingMeta: { ...type.small, color: colors.textPrimary },
  bookingAmount: { ...type.bodyBold, color: colors.textPrimary },
  bookingStatus: { ...type.caption, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  errorText: { ...type.small, color: colors.error, textAlign: 'center', marginVertical: 8 },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})
