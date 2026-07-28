import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, Image, StyleSheet, Pressable, RefreshControl, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchAdminStats, fetchCrmStats, fetchAdminBookings, AdminStats, CrmStats, AdminBooking } from '@/lib/api'
import { BOOKING_FUNNEL, statusLabel } from '@/shared/statuses'
import { formatCurrency, timeAgo } from '@/shared/format'

export default function Dashboard() {
  const { adminKey, role } = useAdminAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [crmStats, setCrmStats] = useState<CrmStats | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<AdminBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!adminKey) return
    setError('')
    try {
      const [s, c, all] = await Promise.all([
        fetchAdminStats(adminKey),
        fetchCrmStats(adminKey),
        // Same trick the website dashboard uses: pull a large page of
        // bookings and tally `status` client-side, instead of a bespoke
        // "funnel counts" endpoint that doesn't exist yet.
        fetchAdminBookings(adminKey, { limit: 2000 }),
      ])
      setStats(s)
      setCrmStats(c)
      const counts: Record<string, number> = {}
      for (const b of all.bookings) counts[b.status] = (counts[b.status] ?? 0) + 1
      setStatusCounts(counts)
      setRecent(
        [...all.bookings]
          .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
          .slice(0, 8)
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  useEffect(() => { load() }, [load])

  const statCards = [
    { label: 'Total Bookings', value: stats?.total ?? '—', icon: 'cube' as const, color: colors.brand, bg: colors.brandLight },
    { label: 'New Inquiries', value: stats?.new_inquiries ?? '—', icon: 'alert-circle' as const, color: '#d97706', bg: '#fef3c7' },
    { label: 'In Progress', value: stats?.in_progress ?? '—', icon: 'checkmark-circle' as const, color: '#2563eb', bg: '#dbeafe' },
    { label: 'In Transit', value: stats?.in_transit ?? '—', icon: 'car' as const, color: '#0891b2', bg: '#cffafe' },
    { label: 'Delivered', value: stats?.delivered ?? '—', icon: 'trending-up' as const, color: '#16a34a', bg: '#dcfce7' },
  ]

  const crmCards = [
    { label: 'Total Leads', value: crmStats?.total_leads ?? '—' },
    { label: "Today's Dispatch", value: crmStats?.today_dispatch ?? '—' },
    { label: 'Pending Quotes', value: crmStats?.pending_quotes ?? '—' },
    {
      label: 'Revenue This Month',
      value: crmStats ? formatCurrency(crmStats.revenue_this_month) : '—',
    },
  ]

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={styles.hello}>Bagdrop Admin</Text>
            <Text style={styles.title}>Dashboard</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {role ? (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{role}</Text>
            </View>
          ) : null}
          <Pressable onPress={load} hitSlop={10} style={{ marginLeft: 10 }}>
            <Ionicons name="refresh" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.statGrid}>
          {statCards.map(c => (
            <Card key={c.label} style={styles.statCard}>
              <View style={styles.statTop}>
                <Text style={styles.statLabel}>{c.label}</Text>
                <View style={[styles.statIcon, { backgroundColor: c.bg }]}>
                  <Ionicons name={c.icon} size={16} color={c.color} />
                </View>
              </View>
              <Text style={styles.statValue}>{c.value}</Text>
            </Card>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.crmGrid}>
          {crmCards.map(c => (
            <Card key={c.label} style={styles.crmCard}>
              <Text style={styles.statLabel}>{c.label}</Text>
              <Text style={styles.crmValue}>{c.value}</Text>
            </Card>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Booking Funnel</Text>
        <View style={styles.funnelGrid}>
          {BOOKING_FUNNEL.map(f => (
            <View key={f.key} style={[styles.funnelCard, { backgroundColor: f.bg }]}>
              <Text style={[styles.funnelLabel, { color: f.color }]}>{f.label}</Text>
              <Text style={[styles.funnelValue, { color: f.color }]}>{statusCounts[f.key] ?? 0}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {recent.length === 0 ? (
          <Card><Text style={styles.emptyText}>No recent bookings yet.</Text></Card>
        ) : (
          recent.map(b => (
            <Card key={b.id} style={{ marginBottom: 10 }}>
              <View style={styles.activityRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityTitle}>{b.customer_name || 'Unknown customer'}</Text>
                  <Text style={styles.activityMeta}>{b.tracking_id} · {statusLabel(b.status)}</Text>
                </View>
                <Text style={styles.activityTime}>{timeAgo(b.updated_at || b.created_at)}</Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 47 },
  hello: { ...type.small, color: colors.textMuted, marginBottom: 2 },
  title: { ...type.displaySm, color: colors.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  roleBadge: { backgroundColor: colors.midnight, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  roleBadgeText: { ...type.caption, color: '#fff', textTransform: 'uppercase' },
  error: { ...type.small, color: colors.error, marginBottom: 12, textAlign: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: { width: '47%', padding: 14 },
  statTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { ...type.caption, color: colors.textMuted },
  statIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statValue: { ...type.displaySm, color: colors.textPrimary, marginTop: 8 },
  sectionTitle: { ...type.h2, color: colors.textPrimary, marginTop: 18, marginBottom: 10 },
  crmGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  crmCard: { width: '47%', padding: 14 },
  crmValue: { ...type.h1, color: colors.textPrimary, marginTop: 6 },
  funnelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  funnelCard: { width: '31%', borderRadius: radius.lg, padding: 10 },
  funnelLabel: { ...type.caption, fontWeight: '700' },
  funnelValue: { ...type.h1, marginTop: 4 },
  activityRow: { flexDirection: 'row', alignItems: 'center' },
  activityTitle: { ...type.bodyBold, color: colors.textPrimary },
  activityMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  activityTime: { ...type.caption, color: colors.textMuted },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})
