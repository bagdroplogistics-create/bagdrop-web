import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchLeads, AdminLead } from '@/lib/api'
import { LEAD_STATUSES, leadStatusMeta } from '@/shared/leads'
import { timeAgo } from '@/shared/format'

const FILTERS = [{ key: 'all', label: 'All' }, ...LEAD_STATUSES.map(s => ({ key: s.key, label: s.label }))]

export default function Inquiries() {
  const { adminKey } = useAdminAuth()
  const [leads, setLeads] = useState<AdminLead[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!adminKey) return
    setError('')
    try {
      const res = await fetchLeads(adminKey, {
        status: filter === 'all' ? undefined : filter,
        search: search.trim() || undefined,
        limit: 100,
      })
      setLeads(res.leads)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load inquiries.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, filter, search])

  useEffect(() => { load() }, [load])

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Leads</Text>
          <Text style={styles.sub}>{total} total</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => router.push('/leads/new')}>
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
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
        data={leads}
        keyExtractor={l => l.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={
          !loading ? <Card><Text style={styles.emptyText}>No leads found.</Text></Card> : null
        }
        renderItem={({ item }) => {
          const meta = leadStatusMeta(item.status)
          return (
            <Pressable onPress={() => router.push(`/leads/${item.id}`)}>
              <Card style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>{item.phone}{item.email ? ` · ${item.email}` : ''}</Text>
                    <Text style={styles.meta}>{item.lead_number} · {timeAgo(item.created_at)}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
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
  addBtn: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
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
  name: { ...type.bodyBold, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { ...type.caption, fontWeight: '700' },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})
