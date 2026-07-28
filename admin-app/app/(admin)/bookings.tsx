import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchAdminBookings, AdminBooking } from '@/lib/api'
import { BOOKING_FUNNEL, statusLabel } from '@/shared/statuses'
import { rupees } from '@/shared/quotes'
import { timeAgo } from '@/shared/format'

const FILTERS = [{ key: 'all', label: 'All' }, ...BOOKING_FUNNEL.map(s => ({ key: s.key, label: s.label }))]

export default function Bookings() {
  const { adminKey } = useAdminAuth()
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!adminKey) return
    setError('')
    try {
      const res = await fetchAdminBookings(adminKey, {
        status: filter === 'all' ? undefined : filter,
        search: search.trim() || undefined,
        limit: 200,
      })
      setBookings(res.bookings)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bookings.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, filter, search])

  useEffect(() => { load() }, [load])

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Bookings</Text>
          <Text style={styles.sub}>{total} total</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <TextField
          placeholder="Search name, phone, email, or tracking ID"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          returnKeyType="search"
        />
      </View>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={f => f.key}
        showsHorizontalScrollIndicator={false}
        style={styles.filterList}
        contentContainerStyle={styles.filterListContent}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.chip, filter === item.key && styles.chipActive]}
            onPress={() => setFilter(item.key)}
          >
            <Text style={[styles.chipText, filter === item.key && styles.chipTextActive]}>{item.label}</Text>
          </Pressable>
        )}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={bookings}
        keyExtractor={b => b.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={
          !loading ? <Card><Text style={styles.emptyText}>No bookings found.</Text></Card> : null
        }
        renderItem={({ item }) => {
          const meta = BOOKING_FUNNEL.find(s => s.key === item.status)
          const bg = meta?.bg ?? '#f3f4f6'
          const fg = meta?.color ?? '#6b7280'
          return (
            <Pressable onPress={() => router.push(`/bookings/${item.id}`)}>
              <Card style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trackingId}>{item.tracking_id}</Text>
                    <Text style={styles.name}>{item.customer_name || 'Unknown customer'}</Text>
                    <Text style={styles.meta}>
                      {(item.from_city as string) || '—'} → {(item.to_city as string) || '—'} · {timeAgo(item.updated_at || item.created_at)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.total}>{rupees(Number(item.total_amount ?? 0))}</Text>
                    <View style={[styles.badge, { backgroundColor: bg, marginTop: 6 }]}>
                      <Text style={[styles.badgeText, { color: fg }]}>{statusLabel(item.status)}</Text>
                    </View>
                  </View>
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
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  title: { ...type.displaySm, color: colors.textPrimary },
  sub: { ...type.small, color: colors.textMuted, marginTop: 2 },
  filterList: { flexGrow: 0, flexShrink: 0 },
  filterListContent: { paddingHorizontal: 20, gap: 8, paddingBottom: 12, alignItems: 'center' },
  chip: {
    alignSelf: 'flex-start',
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...type.small, color: colors.textSecondary },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  error: { ...type.small, color: colors.error, textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  trackingId: { ...type.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  name: { ...type.bodyBold, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  total: { ...type.bodyBold, color: colors.textPrimary },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { ...type.caption, fontWeight: '700' },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})
