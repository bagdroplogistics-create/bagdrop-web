import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchPayments, AdminPayment } from '@/lib/api'
import { paymentStatusMeta, PAYMENT_METHOD_LABELS } from '@/shared/statuses'
import { rupees } from '@/shared/quotes'
import { timeAgo, formatCustomerName } from '@/shared/format'

// Mirrors app/(admin)/admin/payments/page.tsx — same statuses (including
// the 'pending_verification' state uploaded proof sits in before Accounts
// approves/rejects it), same synthetic "confirmed booking with no payment
// logged yet" rows merged in from GET /api/admin/payments, same
// Total/Collected/Pending/Refunded summary. No separate mobile payments
// system — this reads and writes the exact same `payments` table.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  // Full/Partial/VIP/Verification payment-accounting rework (2026-08-19) —
  // see lib/payment-status.ts on the website.
  { key: 'partially_paid', label: 'Partially Paid' },
  { key: 'pending_verification', label: 'Pending Verification' },
  // Was missing — web's filter dropdown is built from STATUS_CFG's entries
  // directly so it already had this state; mobile's chip row is a fixed
  // list and had no way to isolate VIP/Admin-Approved-but-unpaid bookings.
  { key: 'approved_pending', label: 'Admin Approved (VIP)' },
  { key: 'paid', label: 'Paid' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'refunded', label: 'Refunded' },
]

const PAGE_SIZE = 200

export default function Payments() {
  const { adminKey } = useAdminAuth()
  const [payments, setPayments] = useState<AdminPayment[]>([])
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
      const res = await fetchPayments(adminKey, {
        status: filter === 'all' ? undefined : filter,
        search: search.trim() || undefined,
        page: pageNum,
        limit: PAGE_SIZE,
      })
      setPayments(prev => (pageNum === 1 ? res.payments : [...prev, ...res.payments]))
      setTotal(res.total)
      setPage(pageNum)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payments.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [adminKey, filter, search])

  useEffect(() => { load(1) }, [load])

  const hasMore = payments.length < total
  const loadMore = () => { if (!loadingMore && !loading && hasMore) load(page + 1) }

  const totalPaid = payments.filter(p => p.payment_status === 'paid').reduce((s, p) => s + Number(p.amount), 0)
  const totalPending = payments.filter(p => !['paid', 'refunded'].includes(p.payment_status)).reduce((s, p) => s + Number(p.amount), 0)
  const refundedCount = payments.filter(p => p.payment_status === 'refunded').length

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Payments</Text>
          <Text style={styles.sub}>{total} total · {rupees(totalPaid)} collected</Text>
        </View>
        <Pressable style={styles.newBtn} onPress={() => router.push('/payments/new')}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      <View style={styles.summaryGrid}>
        {[
          { label: 'Total', value: String(total), color: '#2563eb' },
          { label: 'Collected', value: rupees(totalPaid), color: '#16a34a' },
          { label: 'Pending', value: rupees(totalPending), color: '#d97706' },
          { label: 'Refunded', value: String(refundedCount), color: '#7c3aed' },
        ].map(c => (
          <View key={c.label} style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{c.label}</Text>
            <Text style={[styles.summaryValue, { color: c.color }]} numberOfLines={1} adjustsFontSizeToFit>{c.value}</Text>
          </View>
        ))}
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <TextField
          placeholder="Search name, phone, or payment ID"
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
        data={payments}
        keyExtractor={p => p.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(1)} tintColor={colors.brand} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !loading ? <Card><Text style={styles.emptyText}>No payments found.</Text></Card> : null
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
            <Pressable onPress={() => {
              // Synthetic rows have no real payments.id — route to Record
              // Payment prefilled from the booking instead of a 404, same
              // "Log Payment" behaviour as the website's Payment# column.
              if (item.is_synthetic) {
                router.push({
                  pathname: '/payments/new',
                  params: {
                    booking_id: item.booking_id ?? '',
                    customer_name: item.customer_name,
                    customer_phone: item.customer_phone,
                    amount: String(item.amount),
                  },
                })
              } else {
                router.push(`/payments/${item.id}`)
              }
            }}>
              <Card style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.paymentId}>{item.payment_id}</Text>
                      {item.is_synthetic ? (
                        <View style={styles.syntheticBadge}><Text style={styles.syntheticBadgeText}>From Booking</Text></View>
                      ) : null}
                    </View>
                    <Text style={styles.name}>{formatCustomerName(item.title, item.customer_name) || item.customer_name}</Text>
                    <Text style={styles.meta}>
                      {PAYMENT_METHOD_LABELS[item.payment_method] ?? item.payment_method}
                      {item.invoice_number ? ` · Inv ${item.invoice_number}` : ''} · {timeAgo(item.created_at)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.total}>{rupees(Number(item.amount ?? 0))}</Text>
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
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  newBtnText: { ...type.smallBold, color: '#fff' },
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
  paymentId: { ...type.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  syntheticBadge: { backgroundColor: '#dbeafe', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  syntheticBadgeText: { fontSize: 9, fontWeight: '700', color: '#1d4ed8' },
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
