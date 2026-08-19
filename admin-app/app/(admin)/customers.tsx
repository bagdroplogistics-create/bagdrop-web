import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchCustomers, AdminCustomer } from '@/lib/api'
import { rupees } from '@/shared/quotes'
import { timeAgo } from '@/shared/format'

// Mirrors app/(admin)/admin/customers/page.tsx — customers are derived by
// aggregating `bookings` rows keyed by phone number (no standalone
// `customers` table exists). Same search, same profile shape.
export default function Customers() {
  const { adminKey } = useAdminAuth()
  const [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!adminKey) return
    setError('')
    try {
      const res = await fetchCustomers(adminKey, { search: search.trim() || undefined })
      setCustomers(res.customers)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load customers.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, search])

  useEffect(() => { load() }, [load])

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Customers</Text>
          <Text style={styles.sub}>{customers.length} customers</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <TextField
          placeholder="Search name, phone, or email"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          returnKeyType="search"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={customers}
        keyExtractor={c => c.phone}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={
          !loading ? <Card><Text style={styles.emptyText}>No customers found.</Text></Card> : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/customers/${encodeURIComponent(item.phone)}`)}>
            <Card style={{ marginBottom: 10 }}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.name}>{item.name || 'Unknown'}</Text>
                  <Text style={styles.meta}>{item.phone} · {item.total_bookings} booking{item.total_bookings === 1 ? '' : 's'} · {timeAgo(item.last_booking)}</Text>
                </View>
                <Text style={styles.total}>{rupees(item.total_spent)}</Text>
              </View>
            </Card>
          </Pressable>
        )}
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
  error: { ...type.small, color: colors.error, textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { ...type.bodyBold, color: colors.brand },
  name: { ...type.bodyBold, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  total: { ...type.bodyBold, color: colors.textPrimary },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})
