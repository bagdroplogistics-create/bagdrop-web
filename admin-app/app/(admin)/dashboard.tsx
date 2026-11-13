import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, Image, StyleSheet, Pressable, RefreshControl, ScrollView, Modal, TextInput, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import {
  fetchDashboardV2, fetchDashboardDrilldown, fetchOperations,
  DashboardV2Data, DashboardRange, DrilldownKey, DrilldownRecord, OpsData, OpsRange,
} from '@/lib/api'
import { statusLabel } from '@/shared/statuses'

// Mirrors the website admin dashboard (app/(admin)/admin/page.tsx) section by
// section, using the same endpoints: /api/admin/dashboard-v2 for Business
// Overview / Funnel / Revenue / Trips / Service Types and
// /api/admin/reports/operations for Upcoming Operations.

const DASH_RANGES: { value: DashboardRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
]
const OPS_RANGES: { value: OpsRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'next3', label: 'Next 3 Days' },
  { value: 'next7', label: 'Next 7 Days' },
  { value: 'custom', label: 'Custom' },
]
const FUNNEL_STAGES: { key: keyof DashboardV2Data['funnel']['stages']; label: string }[] = [
  { key: 'total_inquiries', label: 'Inquiries' },
  { key: 'quotes_generated', label: 'Quotes Generated' },
  { key: 'quotes_sent', label: 'Quotes Sent' },
  { key: 'accepted', label: 'Customer Approval' },
  { key: 'payment_received', label: 'Payment Received' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
]
const DRILL_TITLES: Record<DrilldownKey, string> = {
  total_inquiries: 'Total Inquiries', quotes_sent: 'Quotes Sent', confirmed_bookings: 'Confirmed Bookings',
  payments_received: 'Payments Received', completed: 'Completed',
}

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : 'Rs.' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const dateOnly = (d: string | null | undefined) => {
  if (!d) return '—'
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00' : d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const daysLeft = (pickup: string | null) => {
  if (!pickup) return '—'
  const d = Math.ceil((new Date(pickup + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000)
  return d < 0 ? 'Overdue' : d === 0 ? 'Today' : `${d}d`
}

function Chips<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
      {options.map(o => (
        <Pressable key={o.value} onPress={() => onChange(o.value)}
          style={[styles.chip, value === o.value && styles.chipActive]}>
          <Text style={[styles.chipText, value === o.value && styles.chipTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

function DateRangeInputs({ from, to, setFrom, setTo }: {
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void
}) {
  return (
    <View style={styles.dateRow}>
      <TextInput value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" style={styles.dateInput} placeholderTextColor={colors.neutralLight} />
      <Text style={styles.statLabel}>to</Text>
      <TextInput value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" style={styles.dateInput} placeholderTextColor={colors.neutralLight} />
    </View>
  )
}

function MiniStat({ label, value, sub, color, onPress, half = true }: {
  label: string; value: string | number; sub?: string; color?: string; onPress?: () => void; half?: boolean
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[half ? styles.halfCard : styles.fullCard]}>
      <Card style={{ padding: 12 }}>
        <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
        <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
        {sub ? <Text style={styles.subText}>{sub}</Text> : null}
        {onPress ? <Text style={styles.linkText}>View records →</Text> : null}
      </Card>
    </Pressable>
  )
}

export default function Dashboard() {
  const { adminKey, role } = useAdminAuth()
  const [range, setRange] = useState<DashboardRange>('this_month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [dash, setDash] = useState<DashboardV2Data | null>(null)
  const [opsRange, setOpsRange] = useState<OpsRange>('next7')
  const [opsFrom, setOpsFrom] = useState('')
  const [opsTo, setOpsTo] = useState('')
  const [ops, setOps] = useState<OpsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [opsLoading, setOpsLoading] = useState(true)
  const [error, setError] = useState('')

  const [drillKey, setDrillKey] = useState<DrilldownKey | null>(null)
  const [drillRecords, setDrillRecords] = useState<DrilldownRecord[]>([])
  const [drillLoading, setDrillLoading] = useState(false)

  const loadDash = useCallback(async () => {
    if (!adminKey) return
    if (range === 'custom' && (!from || !to)) return
    setLoading(true); setError('')
    try { setDash(await fetchDashboardV2(adminKey, range, from, to)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load dashboard data.') }
    finally { setLoading(false) }
  }, [adminKey, range, from, to])

  const loadOps = useCallback(async () => {
    if (!adminKey) return
    if (opsRange === 'custom' && (!opsFrom || !opsTo)) return
    setOpsLoading(true)
    try { setOps(await fetchOperations(adminKey, opsRange, opsFrom, opsTo)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load operations data.') }
    finally { setOpsLoading(false) }
  }, [adminKey, opsRange, opsFrom, opsTo])

  useEffect(() => { loadDash() }, [loadDash])
  useEffect(() => { loadOps() }, [loadOps])

  const refresh = () => { loadDash(); loadOps() }

  const openDrill = async (key: DrilldownKey) => {
    if (!adminKey) return
    setDrillKey(key); setDrillRecords([]); setDrillLoading(true)
    try {
      const d = await fetchDashboardDrilldown(adminKey, range, key, from, to)
      setDrillRecords(d.drilldown_records ?? [])
    } catch { /* shown as empty */ }
    setDrillLoading(false)
  }

  const bo = dash?.business_overview
  const rc = dash?.revenue_collection
  const tp = dash?.trip_profitability
  const v = (x: number | undefined) => (loading || x === undefined ? '…' : x)
  const m = (x: number | undefined) => (loading || x === undefined ? '…' : inr(x))

  const totalBags = (dash?.service_types ?? []).reduce((s, r) => s + r.bags, 0)
  const totalBookings = (dash?.service_types ?? []).reduce((s, r) => s + r.bookings, 0)
  const totalRevenue = (dash?.service_types ?? []).reduce((s, r) => s + r.revenue, 0)

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
            <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{role}</Text></View>
          ) : null}
          <Pressable onPress={refresh} hitSlop={10} style={{ marginLeft: 10 }}>
            <Ionicons name="refresh" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.quickLinksRow}>
          <Pressable style={styles.quickLink} onPress={() => router.push('/bookings')}>
            <Ionicons name="cube" size={18} color={colors.brand} />
            <Text style={styles.quickLinkText}>Bookings</Text>
          </Pressable>
          <Pressable style={styles.quickLink} onPress={() => router.push('/invoices')}>
            <Ionicons name="receipt" size={18} color={colors.brand} />
            <Text style={styles.quickLinkText}>Invoices</Text>
          </Pressable>
          <Pressable style={styles.quickLink} onPress={() => router.push('/customers')}>
            <Ionicons name="people" size={18} color={colors.brand} />
            <Text style={styles.quickLinkText}>Customers</Text>
          </Pressable>
        </View>

        {/* ── Business Overview ── */}
        <Text style={styles.sectionTitle}>Business Overview</Text>
        <Chips options={DASH_RANGES} value={range} onChange={setRange} />
        {range === 'custom' ? <DateRangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} /> : null}
        <View style={styles.grid}>
          <MiniStat label="Total Inquiries" value={v(bo?.total_inquiries)} color="#2563eb" onPress={() => openDrill('total_inquiries')} />
          <MiniStat label="Quotes Sent" value={v(bo?.quotes_sent)} color="#6d28d9" onPress={() => openDrill('quotes_sent')} />
          <MiniStat label="Confirmed Bookings" value={v(bo?.confirmed_bookings)} color="#0891b2" onPress={() => openDrill('confirmed_bookings')} />
          <MiniStat label="Payments Received" value={v(bo?.payments_received_count)}
            sub={bo ? inr(bo.payments_received_amount) : undefined} color="#16a34a" onPress={() => openDrill('payments_received')} />
          <MiniStat label="Outstanding" value={m(bo?.outstanding_amount)} color="#d97706" />
          <MiniStat label="Revenue" value={m(bo?.revenue)} color="#7c3aed" />
        </View>
        <Text style={styles.note}>
          {dash ? `Showing ${dateOnly(dash.range.from)} – ${dateOnly(dash.range.to)}. ` : ''}
          Outstanding is always a live, current-balance figure.
        </Text>

        {/* ── Inquiry & Sales Funnel ── */}
        <Text style={styles.sectionTitle}>Inquiry &amp; Sales Funnel</Text>
        <View style={styles.grid}>
          {FUNNEL_STAGES.map(s => (
            <Pressable key={s.key} style={styles.funnelCard}
              disabled={s.key !== 'completed'} onPress={() => openDrill('completed')}>
              <Text style={styles.funnelLabel}>{s.label.toUpperCase()}</Text>
              <Text style={styles.funnelValue}>{v(dash?.funnel.stages[s.key])}</Text>
              {s.key === 'completed' ? <Text style={styles.linkText}>View →</Text> : null}
            </Pressable>
          ))}
        </View>

        {/* ── Revenue & Payment Collection ── */}
        <Text style={styles.sectionTitle}>Revenue &amp; Payment Collection</Text>
        <View style={styles.grid}>
          <MiniStat label="Revenue" value={m(rc?.revenue)} />
          <MiniStat label="Payments Received" value={m(rc?.payments_received_amount)}
            sub={rc ? `${rc.payments_received_count} transactions` : undefined} />
          <MiniStat label="Outstanding" value={m(rc?.outstanding)} />
          <MiniStat label="Pending Verification" value={m(rc?.pending_verification)} />
          <MiniStat label="Refunds" value={m(rc?.refunds)} />
          <MiniStat label="Net Revenue" value={m(rc?.net_revenue)} />
        </View>

        {/* ── Upcoming Operations ── */}
        <Text style={styles.sectionTitle}>Upcoming Operations</Text>
        <Chips options={OPS_RANGES} value={opsRange} onChange={setOpsRange} />
        {opsRange === 'custom' ? <DateRangeInputs from={opsFrom} to={opsTo} setFrom={setOpsFrom} setTo={setOpsTo} /> : null}
        <View style={styles.grid}>
          <MiniStat label="Today's Pickups" value={opsLoading ? '…' : ops?.widgets.todays_pickups ?? '—'} color="#2563eb" />
          <MiniStat label="Today's Deliveries" value={opsLoading ? '…' : ops?.widgets.todays_deliveries ?? '—'} color="#0891b2" />
          <MiniStat label="Delivered Today" value={opsLoading ? '…' : ops?.widgets.delivered_today ?? '—'} color="#16a34a" />
          <MiniStat label="Upcoming (7 Days)" value={opsLoading ? '…' : ops?.widgets.upcoming_pickups_7d ?? '—'} color="#7c3aed" />
        </View>

        <Text style={styles.subTitle}>Upcoming Confirmed Bookings</Text>
        {opsLoading ? (
          <ActivityIndicator color={colors.brand} />
        ) : (ops?.upcoming_bookings ?? []).length === 0 ? (
          <Card><Text style={styles.emptyText}>No upcoming confirmed bookings in this window</Text></Card>
        ) : (
          (ops?.upcoming_bookings ?? []).slice(0, 50).map(b => (
            <Card key={b.id} style={{ marginBottom: 10 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{b.customer_name || '—'}</Text>
                <Text style={styles.tracking}>{b.tracking_id}</Text>
              </View>
              <Text style={styles.meta}>{b.service_label || '—'} · {b.from_city} → {b.to_city}</Text>
              <Text style={styles.meta}>Pickup {dateOnly(b.pickup_date)} · Delivery {dateOnly(b.delivery_date)}</Text>
              <View style={[styles.rowBetween, { marginTop: 6 }]}>
                <Text style={styles.statusPill}>{statusLabel(b.status)}</Text>
                <Text style={styles.meta}>Bags {b.total_bags ?? '—'} · {daysLeft(b.pickup_date)}</Text>
              </View>
              <Text style={[styles.meta, !b.driver_name && { color: '#d97706', fontWeight: '700' }]}>
                {b.driver_name ? `Driver: ${b.driver_name}` : 'Driver Not Assigned'}
              </Text>
            </Card>
          ))
        )}

        {/* ── Trip Operations & Profitability ── */}
        <Text style={styles.sectionTitle}>Trip Operations &amp; Profitability</Text>
        <View style={styles.grid}>
          <MiniStat label="Total Trips" value={v(tp?.total_trips)} color="#f97316" />
          <MiniStat label="Active Trips" value={v(tp?.active_trips)} color="#2563eb" />
          <MiniStat label="Delivered Trips" value={v(tp?.delivered_trips)} color="#16a34a" />
          <MiniStat label="Total Income" value={m(tp?.total_income)} color="#16a34a" />
          <MiniStat label="Total Expense" value={m(tp?.total_expense)} color="#dc2626" />
          <MiniStat label="Net Profit" value={m(tp?.net_profit)} color={(tp?.net_profit ?? 0) >= 0 ? '#16a34a' : '#dc2626'} />
          <MiniStat label="Avg Revenue / Trip" value={m(tp?.avg_revenue_per_trip)} color="#0891b2" />
          <MiniStat label="Avg Expense / Trip" value={m(tp?.avg_expense_per_trip)} color="#dc2626" />
          <MiniStat label="Profit Margin" value={loading || !tp ? '…' : tp.profit_margin.toFixed(1) + '%'} color="#7c3aed" />
        </View>

        {/* ── Bookings by Service Type ── */}
        <Text style={styles.sectionTitle}>Bookings by Service Type</Text>
        <Text style={styles.note}>All completed bookings, all time — not affected by the period filter.</Text>
        {!loading && (dash?.service_types ?? []).length > 0 ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>{totalBags.toLocaleString('en-IN')} bags delivered</Text>
            <Text style={styles.meta}>
              across {totalBookings.toLocaleString('en-IN')} completed bookings · {inr(totalRevenue)} revenue
            </Text>
          </View>
        ) : null}
        <Card>
          <View style={styles.tableRow}>
            <Text style={[styles.th, { flex: 2 }]}>SERVICE TYPE</Text>
            <Text style={styles.th}>BAGS</Text>
            <Text style={styles.th}>BOOKINGS</Text>
            <Text style={[styles.th, { flex: 1.3, textAlign: 'right' }]}>REVENUE</Text>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.brand} />
          ) : (dash?.service_types ?? []).length === 0 ? (
            <Text style={styles.emptyText}>No completed bookings yet</Text>
          ) : (
            <>
              {(dash?.service_types ?? []).map(s => (
                <View key={s.service_label} style={styles.tableRow}>
                  <Text style={[styles.td, { flex: 2 }]}>{s.service_label}</Text>
                  <Text style={[styles.td, styles.bold]}>{s.bags}</Text>
                  <Text style={styles.td}>{s.bookings}</Text>
                  <Text style={[styles.td, { flex: 1.3, textAlign: 'right' }]}>{inr(s.revenue)}</Text>
                </View>
              ))}
              <View style={[styles.tableRow, styles.totalRow]}>
                <Text style={[styles.td, styles.bold, { flex: 2 }]}>Total</Text>
                <Text style={[styles.td, styles.bold]}>{totalBags}</Text>
                <Text style={[styles.td, styles.bold]}>{totalBookings}</Text>
                <Text style={[styles.td, styles.bold, { flex: 1.3, textAlign: 'right' }]}>{inr(totalRevenue)}</Text>
              </View>
            </>
          )}
        </Card>
      </ScrollView>

      {/* Drill-down: exact records behind a card, same as the website modal */}
      <Modal visible={!!drillKey} animationType="slide" onRequestClose={() => setDrillKey(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{drillKey ? DRILL_TITLES[drillKey] : ''}</Text>
              <Text style={styles.meta}>
                {drillLoading ? '…' : drillRecords.length} record{drillRecords.length === 1 ? '' : 's'}
              </Text>
            </View>
            <Pressable onPress={() => setDrillKey(null)} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {drillLoading ? (
              <ActivityIndicator color={colors.brand} />
            ) : drillRecords.length === 0 ? (
              <Text style={styles.emptyText}>No records in this range.</Text>
            ) : (
              drillRecords.map(r => (
                <Card key={r.id} style={{ marginBottom: 10 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{r.customer_name ?? '—'}</Text>
                    <Text style={styles.bold}>{r.amount != null ? inr(r.amount) : '—'}</Text>
                  </View>
                  <Text style={styles.meta}>{dateOnly(r.date)} · {r.tracking_id ?? '—'}</Text>
                  <Text style={styles.meta}>{r.route ?? '—'} · {r.status ?? '—'}</Text>
                </Card>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
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
  quickLinksRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  quickLink: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brandLight, borderRadius: radius.lg, paddingVertical: 12,
  },
  quickLinkText: { ...type.smallBold, color: colors.brand },
  sectionTitle: { ...type.h2, color: colors.textPrimary, marginTop: 18, marginBottom: 8 },
  subTitle: { ...type.bodyBold, color: colors.textPrimary, marginTop: 14, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  halfCard: { width: '47.5%' },
  fullCard: { width: '100%' },
  statLabel: { ...type.caption, color: colors.textMuted },
  statValue: { ...type.h1, color: colors.textPrimary, marginTop: 6 },
  subText: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  linkText: { ...type.caption, color: colors.brand, marginTop: 4, fontWeight: '600' },
  note: { ...type.caption, color: colors.textMuted, marginTop: 8, marginBottom: 4 },
  chip: { backgroundColor: '#f3f4f6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.brand },
  chipText: { ...type.caption, color: '#4b5563', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dateInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 10, paddingVertical: 6, color: colors.textPrimary, backgroundColor: '#fff',
  },
  funnelCard: {
    width: '47.5%', backgroundColor: '#fff', borderRadius: radius.lg, padding: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  funnelLabel: { ...type.caption, color: colors.textMuted, fontWeight: '700' },
  funnelValue: { ...type.h1, color: colors.textPrimary, marginTop: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { ...type.bodyBold, color: colors.textPrimary, flexShrink: 1 },
  tracking: { ...type.caption, color: colors.brandDark, fontWeight: '700' },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  statusPill: {
    ...type.caption, color: '#1d4ed8', backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 999, overflow: 'hidden', fontWeight: '600',
  },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  banner: {
    backgroundColor: colors.brandLight, borderRadius: radius.lg, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  bannerTitle: { ...type.bodyBold, color: colors.textPrimary },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 6 },
  totalRow: { borderTopWidth: 2, borderTopColor: colors.border },
  th: { flex: 1, ...type.caption, color: colors.textMuted, fontWeight: '700' },
  td: { flex: 1, ...type.small, color: colors.textSecondary },
  bold: { fontWeight: '700', color: colors.textPrimary },
  modalWrap: { flex: 1, backgroundColor: colors.cream },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 24,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#fff',
  },
})
