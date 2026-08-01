import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { rupees } from '@/shared/quotes'
import { timeAgo, formatCustomerName } from '@/shared/format'

const PAYMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  received: { label: 'Paid', color: '#15803d', bg: '#dcfce7' },
  pending: { label: 'Payment Pending', color: '#b45309', bg: '#fef3c7' },
}

export default function Quotes() {
  const { adminKey } = useAdminAuth()
  const [leads, setLeads] = useState<AdminLead[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!adminKey) return
    setError('')
    try {
      // No dedicated "list quotes" endpoint exists — quotes live as quote_*
      // fields on leads. Fetch a large page and filter client-side, same
      // pattern the dashboard uses for its booking funnel tally.
      const res = await fetchLeads(adminKey, { limit: 300 })
      setLeads(res.leads)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load quotes.')
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  useEffect(() => { load() }, [load])

  const quoted = useMemo(() => {
    const withQuote = leads.filter(l => !!l.quote_number)
    const q = search.trim().toLowerCase()
    const filtered = q
      ? withQuote.filter(l =>
          l.name?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q) ||
          String(l.quote_number ?? '').toLowerCase().includes(q)
        )
      : withQuote
    return filtered.sort((a, b) => {
      const at = (a.quote_date as string) ?? a.updated_at ?? ''
      const bt = (b.quote_date as string) ?? b.updated_at ?? ''
      return bt.localeCompare(at)
    })
  }, [leads, search])

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Quotes</Text>
          <Text style={styles.sub}>{quoted.length} quote{quoted.length !== 1 ? 's' : ''}</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => router.push('/quotes/new')}>
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <TextField
          placeholder="Search name, phone, or quote number"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={quoted}
        keyExtractor={l => l.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={
          !loading ? (
            <Card>
              <Text style={styles.emptyText}>No quotes yet.</Text>
              <Text style={[styles.emptyText, { marginTop: 4 }]}>Tap + to create one, or open an inquiry and generate a quote.</Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => {
          const meta = PAYMENT_META[(item.payment_status as string) ?? 'pending'] ?? PAYMENT_META.pending
          const total = Number(item.quote_total ?? 0)
          return (
            <Pressable onPress={() => router.push(`/quotes/${item.id}`)}>
              <Card style={{ marginBottom: 10 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quoteNo}>{item.quote_number as string}</Text>
                    <Text style={styles.name}>{formatCustomerName(item.title, item.name) || item.name}</Text>
                    <Text style={styles.meta}>
                      {(item.from_city as string) || '—'} → {(item.to_city as string) || '—'} · {timeAgo((item.quote_date as string) ?? item.updated_at)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.total}>{rupees(total)}</Text>
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
  addBtn: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  error: { ...type.small, color: colors.error, textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  quoteNo: { ...type.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  name: { ...type.bodyBold, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  total: { ...type.bodyBold, color: colors.textPrimary },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { ...type.caption, fontWeight: '700' },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})
