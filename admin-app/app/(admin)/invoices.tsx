import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchInvoices, AdminInvoice } from '@/lib/api'
import { paymentStatusMeta } from '@/shared/statuses'
import { rupees } from '@/shared/quotes'
import { timeAgo, formatCustomerName } from '@/shared/format'

// Mirrors app/(admin)/admin/invoices/page.tsx — every COMPLETED booking
// shows up here, not just ones someone already generated an invoice for
// (the `generated: false` placeholder rows from GET /api/admin/invoices).
// Same statuses, same "not_generated" filter, same source of truth.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'not_generated', label: 'Not Generated' },
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Pending' },
]

const PAGE_SIZE = 200

export default function Invoices() {
  const { adminKey } = useAdminAuth()
  const [invoices, setInvoices] = useState<AdminInvoice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (pageNum = 1) => {
    if (!adminKey) return
    setError('')
    if (pageNum === 1) setLoading(true)
    else setLoadingMore(true)
    try {
      const res = await fetchInvoices(adminKey, {
        status: filter === 'all' ? undefined : filter,
        search: search.trim() || undefined,
        page: pageNum,
        limit: PAGE_SIZE,
      })
      setInvoices(prev => (pageNum === 1 ? res.invoices : [...prev, ...res.invoices]))
      setTotal(res.total)
      setPage(pageNum)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load invoices.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [adminKey, filter, search])

  useEffect(() => { load(1) }, [load])

  const hasMore = invoices.length < total
  const loadMore = () => { if (!loadingMore && !loading && hasMore) load(page + 1) }

  const notGeneratedCount = invoices.filter(i => !i.generated).length
  const paidCount = invoices.filter(i => i.payment_status === 'paid').length
  const revenue = invoices.filter(i => i.payment_status === 'paid').reduce((s, i) => s + Number(i.total_amount), 0)

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Invoices</Text>
          <Text style={styles.sub}>{total} completed inquiries · {rupees(revenue)} collected</Text>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        {[
          { label: 'Completed', value: String(total), color: '#2563eb' },
          { label: 'Not Generated', value: String(notGeneratedCount), color: '#dc2626' },
          { label: 'Paid', value: String(paidCount), color: '#16a34a' },
          { label: 'Revenue', value: rupees(revenue), color: colors.brand },
        ].map(c => (
          <View key={c.label} style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{c.label}</Text>
            <Text style={[styles.summaryValue, { color: c.color }]} numberOfLines={1} adjustsFontSizeToFit>{c.value}</Text>
          </View>
        ))}
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <TextField
          placeholder="Search name, phone, or invoice number"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load(1)}
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
        data={invoices}
        keyExtractor={i => i.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(1)} tintColor={colors.brand} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !loading ? <Card><Text style={styles.emptyText}>No invoices found.</Text></Card> : null
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.brand} />
          ) : hasMore ? (
            <Pressable style={styles.loadMoreBtn} onPress={loadMore}>
              <Text style={styles.loadMoreText}>Load More</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const meta = paymentStatusMeta(item.payment_status)
          return (
            <Pressable onPress={() => router.push(`/invoices/${item.id}`)}>
              <Card style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {item.generated ? (
                        <Text style={styles.invoiceNo}>{item.invoice_number}</Text>
                      ) : (
                        <View style={styles.notGenBadge}><Text style={styles.notGenBadgeText}>Not Generated</Text></View>
                      )}
                    </View>
                    <Text style={styles.name}>{formatCustomerName(item.title, item.customer_name) || item.customer_name}</Text>
                    <Text style={styles.meta}>
                      {item.from_city || '—'} → {item.to_city || '—'} · {timeAgo(item.invoice_date || item.created_at)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.total}>{rupees(Number(item.total_amount ?? 0))}</Text>
                    <View style={[styles.badge, { backgroundColor: meta.bg, marginTop: 6 }]}>
                      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
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
  summaryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 8, marginBottom: 12,
  },
  summaryCard: {
    flexBasis: '47%', flexGrow: 1,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  summaryLabel: { ...type.caption, color: colors.textMuted },
  summaryValue: { ...type.h1, marginTop: 2 },
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
  invoiceNo: { ...type.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  notGenBadge: { backgroundColor: '#fee2e2', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 2 },
  notGenBadgeText: { fontSize: 10, fontWeight: '700', color: '#dc2626' },
  name: { ...type.bodyBold, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  total: { ...type.bodyBold, color: colors.textPrimary },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { ...type.caption, fontWeight: '700' },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  loadMoreBtn: {
    alignSelf: 'center', marginVertical: 16, paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  loadMoreText: { ...type.smallBold, color: colors.brand },
})
