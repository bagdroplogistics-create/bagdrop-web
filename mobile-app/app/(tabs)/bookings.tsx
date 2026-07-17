import React, { useCallback, useState } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { myBookings, type MyBooking } from '@/lib/api'
import { formatDate } from '@/shared/format'

// Once a booking reaches one of these, our team has already acted on it
// (or it's over) — matches the server-side check in
// app/api/my-bookings/[id]/route.ts, so the Edit button only shows when
// an edit would actually be allowed.
const LOCKED_STATUSES = new Set(['picked_up', 'in_transit', 'delivered', 'cancelled', 'rejected'])

export default function Bookings() {
  const [items, setItems] = useState<MyBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError('')
    try {
      const res = await myBookings()
      setItems(res.bookings)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your bookings.')
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  // Refresh every time this tab regains focus — e.g. coming back from
  // editing a booking, or after placing a new one.
  useFocusEffect(useCallback(() => { load() }, [load]))

  function openEdit(item: MyBooking) {
    router.push({
      pathname: '/booking/edit/[id]',
      params: {
        id: item.id,
        trackingId: item.tracking_id,
        serviceType: item.service_type,
        pickupAddress: item.pickup_address ?? '',
        dropAddress: item.drop_address ?? '',
        pickupDate: item.pickup_date ?? '',
        deliveryDate: item.delivery_date ?? '',
        timeSlot: item.time_slot ?? '',
        flightNumber: item.flight_number ?? '',
        notes: item.notes ?? '',
        totalBags: String(item.total_bags ?? 1),
        bagDetails: JSON.stringify(item.bag_details ?? {}),
      },
    })
  }

  return (
    <Screen scroll={false}>
      <Text style={styles.title}>My Bookings</Text>

      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        contentContainerStyle={items.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{error || 'No bookings yet'}</Text>
              <Text style={styles.emptySub}>Your bookings will show up here.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const editable = !LOCKED_STATUSES.has(item.status)
          return (
            <Pressable onPress={() => router.push({ pathname: '/(tabs)/track', params: { trackingId: item.tracking_id } })}>
              <Card style={{ marginBottom: 12 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trackingId}>{item.tracking_id}</Text>
                    <Text style={styles.route}>{item.from_city} → {item.to_city}</Text>
                  </View>
                  <StatusBadge status={item.status} />
                </View>
                <View style={styles.footerRow}>
                  <Text style={styles.date}>{item.pickup_date ? formatDate(item.pickup_date) : formatDate(item.created_at)}</Text>
                  {editable ? (
                    <Pressable
                      hitSlop={8}
                      onPress={e => { e.stopPropagation(); openEdit(item) }}
                      style={styles.editBtn}
                    >
                      <Ionicons name="pencil" size={13} color={colors.brand} />
                      <Text style={styles.editText}>Edit</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          )
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.displaySm, color: colors.textPrimary, marginTop: 8, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  trackingId: { ...type.bodyBold, color: colors.textPrimary },
  route: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  footerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10,
  },
  date: { ...type.small, color: colors.textMuted },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 2 },
  editText: { ...type.smallBold, color: colors.brand },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  emptyTitle: { ...type.h2, color: colors.textPrimary, marginBottom: 6, textAlign: 'center' },
  emptySub: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})
