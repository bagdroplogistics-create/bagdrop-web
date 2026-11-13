import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchLeads, AdminLead } from '@/lib/api'
import { LEAD_FILTER_STATUSES } from '@/shared/leads'
import { BOOKING_FUNNEL } from '@/shared/statuses'
import { sourceFilterOptions, resolveSource } from '@/shared/lead-source'
import { formatCustomerName } from '@/shared/format'

// Mirrors the website Leads tab (app/(admin)/admin/leads/page.tsx): same
// search, status / source filters, sort options, Deleted toggle, and the same
// per-lead info (quote #, service, route, pickup, bags, source, status, quote
// amount / estimate, booking + quote links, review-price flag).

const SORTS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'date_desc', label: 'Date (Newest → Oldest)' },
  { value: 'date_asc', label: 'Date (Oldest → Newest)' },
  { value: 'updated', label: 'Recently Updated' },
  { value: 'name_asc', label: 'Customer Name (A–Z)' },
  { value: 'name_desc', label: 'Customer Name (Z–A)' },
]
const STATUS_OPTS = [{ key: 'all', label: 'All statuses' }, ...LEAD_FILTER_STATUSES.map(s => ({ key: s.key, label: s.label }))]
const SOURCE_OPTS = [{ value: 'all', label: 'All sources' }, ...sourceFilterOptions()]

const ts = (d?: string | null) => (d ? new Date(d).getTime() || 0 : 0)
const dateOnly = (d?: string | null) => {
  if (!d) return '—'
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00' : d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const inr = (n: number) => '₹' + Math.round(Number(n)).toLocaleString('en-IN')

function statusBadge(l: AdminLead) {
  const s = l.effective_status ?? l.status
  const b = BOOKING_FUNNEL.find(x => x.key === s)
  if (b) return { label: b.label, color: b.color, bg: b.bg }
  const f = LEAD_FILTER_STATUSES.find(x => x.key === s)
  return f ?? { label: s, color: '#6b7280', bg: '#f3f4f6' }
}

function sortLeads(list: AdminLead[], sort: string) {
  const a = [...list]
  switch (sort) {
    case 'oldest': return a.sort((x, y) => ts(x.created_at) - ts(y.created_at))
    case 'date_desc': return a.sort((x, y) => ts(y.pickup_date) - ts(x.pickup_date))
    case 'date_asc': return a.sort((x, y) => ts(x.pickup_date) - ts(y.pickup_date))
    case 'updated': return a.sort((x, y) => ts(y.updated_at) - ts(x.updated_at))
    case 'name_asc': return a.sort((x, y) => (x.name ?? '').localeCompare(y.name ?? ''))
    case 'name_desc': return a.sort((x, y) => (y.name ?? '').localeCompare(x.name ?? ''))
    default: return a.sort((x, y) => ts(y.created_at) - ts(x.created_at))
  }
}

function ChipRow<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
      {options.map(o => (
        <Pressable key={o.key} style={[styles.chip, value === o.key && styles.chipActive]} onPress={() => onChange(o.key)}>
          <Text style={[styles.chipText, value === o.key && styles.chipTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

export default function Inquiries() {
  const { adminKey } = useAdminAuth()
  const [leads, setLeads] = useState<AdminLead[]>([])
  const [filter, setFilter] = useState('all')
  const [source, setSource] = useState('all')
  const [sort, setSort] = useState('newest')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    if (!adminKey) return
    setError(''); setLoading(true)
    try {
      // Same as the website: pull the full filtered set, sort/paginate locally.
      const res = await fetchLeads(adminKey, {
        status: showDeleted || filter === 'all' ? undefined : filter,
        source: source === 'all' ? undefined : source,
        search: debounced || undefined,
        deleted: showDeleted,
        limit: 5000,
        slim: true,
      })
      setLeads(res.leads ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load leads.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, filter, source, debounced, showDeleted])

  useEffect(() => { load() }, [load])

  const sorted = useMemo(() => sortLeads(leads, sort), [leads, sort])
  const [visible, setVisible] = useState(50)
  useEffect(() => { setVisible(50) }, [filter, source, debounced, sort, showDeleted])
  const shown = sorted.slice(0, visible)

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Quote Management</Text>
          <Text style={styles.sub}>Capture prospects — send a quote to convert to a booking</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => router.push('/quotes/new')}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>New Quote</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <TextField
          placeholder="Search name, phone, email, inquiry / booking / quote ID, route…"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        <View style={styles.toolRow}>
          <Pressable style={styles.toolBtn} onPress={() => setShowFilters(v => !v)}>
            <Ionicons name="options" size={14} color={colors.textSecondary} />
            <Text style={styles.toolText}>Filters</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} onPress={load}>
            <Ionicons name="refresh" size={14} color={colors.textSecondary} />
            <Text style={styles.toolText}>{loading ? 'Updating…' : 'Refresh'}</Text>
          </Pressable>
          <Pressable style={[styles.toolBtn, showDeleted && styles.toolBtnDanger]} onPress={() => setShowDeleted(v => !v)}>
            <Ionicons name="trash" size={14} color={showDeleted ? colors.error : colors.textSecondary} />
            <Text style={[styles.toolText, showDeleted && { color: colors.error }]}>{showDeleted ? 'Active Leads' : 'Deleted'}</Text>
          </Pressable>
        </View>
      </View>

      {showFilters ? (
        <View>
          <Text style={styles.filterLabel}>Status</Text>
          <ChipRow options={STATUS_OPTS} value={filter} onChange={setFilter} />
          <Text style={styles.filterLabel}>Source</Text>
          <ChipRow options={SOURCE_OPTS.map(o => ({ key: o.value, label: o.label }))} value={source} onChange={setSource} />
          <Text style={styles.filterLabel}>Sort</Text>
          <ChipRow options={SORTS.map(o => ({ key: o.value, label: o.label }))} value={sort} onChange={setSort} />
        </View>
      ) : null}

      <Text style={styles.count}>{sorted.length} {showDeleted ? 'deleted ' : ''}lead{sorted.length === 1 ? '' : 's'}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={shown}
        keyExtractor={l => l.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        onEndReached={() => { if (visible < sorted.length) setVisible(v => v + 50) }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={!loading ? <Card><Text style={styles.emptyText}>No leads found.</Text></Card> : null}
        renderItem={({ item: l }) => {
          const st = statusBadge(l)
          const src = l.source ? resolveSource(l.source) : null
          return (
            <Pressable onPress={() => router.push(`/leads/${l.id}`)}>
              <Card style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leadNo}>{l.lead_number}</Text>
                    <Text style={styles.name}>{formatCustomerName(l.title, l.name) || l.name}</Text>
                    <Text style={styles.meta}>{l.phone}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                    {l.is_test ? (
                      <View style={[styles.badge, { backgroundColor: '#f3e8ff' }]}>
                        <Text style={[styles.badgeText, { color: '#7e22ce' }]}>Test Mode</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.infoGrid}>
                  <Info label="Service" value={l.service_interest ?? l.service_type ?? '—'} />
                  <Info label="Route" value={l.from_city && l.to_city ? `${l.from_city} → ${l.to_city}` : '—'} />
                  <Info label="Pickup" value={dateOnly(l.pickup_date)} />
                  <Info label="Bags" value={l.bags_count != null ? String(l.bags_count) : '—'} />
                </View>

                <View style={styles.rowWrap}>
                  {src ? (
                    <View style={[styles.badge, { backgroundColor: src.bg }]}>
                      <Text style={[styles.badgeText, { color: src.color }]}>{src.label}</Text>
                    </View>
                  ) : null}
                  {l.partner_name ? <Text style={styles.meta}>{l.partner_name}</Text> : null}
                  <View style={{ flex: 1 }} />
                  {l.quote_total != null ? (
                    <Text style={styles.amount}>{inr(l.quote_total)}</Text>
                  ) : l.estimate_status === 'generated' && l.estimate_total != null ? (
                    <View style={styles.rowWrap}>
                      <View style={[styles.badge, { backgroundColor: '#fef3c7' }]}>
                        <Text style={[styles.badgeText, { color: '#b45309' }]}>ESTIMATE</Text>
                      </View>
                      {l.estimate_is_unknown_route ? (
                        <View style={[styles.badge, { backgroundColor: '#fee2e2' }]}>
                          <Text style={[styles.badgeText, { color: '#b91c1c' }]}>UNKNOWN ROUTE</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.amount, { color: '#b45309' }]}>{inr(l.estimate_total)}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.rowWrap}>
                  {l.booking_id ? (
                    <Pressable style={[styles.linkBtn, { backgroundColor: '#f0fdf4', borderColor: '#dcfce7' }]}
                      onPress={() => router.push(`/bookings/${l.booking_id}`)}>
                      <Text style={[styles.linkText, { color: '#15803d' }]}>View Booking</Text>
                    </Pressable>
                  ) : null}
                  {l.zoho_estimate_number ? (
                    <Pressable style={[styles.linkBtn, { backgroundColor: '#eff6ff', borderColor: '#dbeafe' }]}
                      onPress={() => router.push(`/quotes/${l.id}`)}>
                      <Text style={[styles.linkText, { color: '#1d4ed8' }]}>{l.zoho_estimate_number}</Text>
                    </Pressable>
                  ) : null}
                  {l.quote_needs_review ? (
                    <View style={[styles.badge, { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }]}>
                      <Text style={[styles.badgeText, { color: '#dc2626' }]}>Review Price</Text>
                    </View>
                  ) : null}
                  {(l.quote_discount_amt ?? 0) > 0 ? (
                    <View style={[styles.badge, { backgroundColor: '#fef2f2' }]}>
                      <Text style={[styles.badgeText, { color: '#dc2626' }]}>
                        {l.quote_discount_pct ? `−${l.quote_discount_pct}%` : `−₹${Number(l.quote_discount_amt).toLocaleString('en-IN')}`} discount
                      </Text>
                    </View>
                  ) : null}
                  {l.billing_type === 'foc' ? (
                    <View style={[styles.badge, { backgroundColor: '#fffbeb' }]}>
                      <Text style={[styles.badgeText, { color: '#b45309' }]}>FOC</Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Text style={styles.meta}>{dateOnly(l.created_at)}</Text>
                </View>
              </Card>
            </Pressable>
          )
        }}
      />
    </Screen>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 10,
  },
  title: { ...type.displaySm, color: colors.textPrimary },
  sub: { ...type.small, color: colors.textMuted, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 38, paddingHorizontal: 12,
    borderRadius: radius.md, backgroundColor: colors.brand,
  },
  addBtnText: { ...type.smallBold, color: '#fff' },
  toolRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  toolBtnDanger: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  toolText: { ...type.small, color: colors.textSecondary },
  filterLabel: { ...type.caption, color: colors.textMuted, paddingHorizontal: 20, marginTop: 4, fontWeight: '700' },
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chipRow: { paddingHorizontal: 20, gap: 8, paddingVertical: 6, alignItems: 'center' },
  chip: {
    alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...type.small, color: colors.textSecondary },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  count: { ...type.caption, color: colors.textMuted, paddingHorizontal: 20, marginTop: 4 },
  error: { ...type.small, color: colors.error, textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  leadNo: { ...type.caption, color: colors.brandDark, fontWeight: '700' },
  name: { ...type.bodyBold, color: colors.textPrimary, marginTop: 2 },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { ...type.caption, fontWeight: '700' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 8 },
  info: { width: '50%', paddingRight: 8 },
  infoLabel: { ...type.caption, color: colors.textMuted, fontSize: 10 },
  infoValue: { ...type.small, color: colors.textSecondary, marginTop: 1 },
  amount: { ...type.bodyBold, color: colors.textPrimary },
  linkBtn: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  linkText: { ...type.caption, fontWeight: '700' },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})
