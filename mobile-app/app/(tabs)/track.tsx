import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Screen } from '@/components/Screen'
import { TextField } from '@/components/TextField'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { trackBooking, type TrackedBooking } from '@/lib/api'
import { formatDateTime } from '@/shared/format'

export default function Track() {
  const params = useLocalSearchParams<{ trackingId?: string }>()
  const [id, setId] = useState(params.trackingId ?? '')
  const [result, setResult] = useState<TrackedBooking | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const search = useCallback(async (searchId: string) => {
    if (!searchId.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await trackBooking(searchId.trim())
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking not found.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (params.trackingId) search(params.trackingId)
  }, [params.trackingId])

  return (
    <Screen>
      <Text style={styles.title}>Track a booking</Text>
      <Text style={styles.sub}>Enter your tracking ID to see live status.</Text>

      <TextField
        placeholder="e.g. BD-A1B2C3"
        autoCapitalize="characters"
        value={id}
        onChangeText={setId}
      />
      <Button label="Track" onPress={() => search(id)} loading={loading} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result ? (
        <Card style={{ marginTop: 20 }}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.trackingId}>{result.trackingId}</Text>
              <Text style={styles.route}>{result.fromCity} → {result.toCity}</Text>
            </View>
            <StatusBadge status={result.status} />
          </View>

          <View style={styles.metaGrid}>
            <Meta label="Service" value={result.serviceLabel} />
            <Meta label="Bags" value={String(result.totalBags)} />
            <Meta label="Pickup date" value={result.pickupDate ?? '—'} />
            <Meta label="Time slot" value={result.timeSlot ?? '—'} />
          </View>

          <Text style={styles.timelineTitle}>Status history</Text>
          {[...result.statusHistory].reverse().map((h, i) => (
            <View key={i} style={styles.timelineRow}>
              <View style={styles.timelineDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineStatus}>{h.status.replace(/_/g, ' ')}</Text>
                <Text style={styles.timelineTime}>{formatDateTime(h.timestamp)}</Text>
                {h.note ? <Text style={styles.timelineNote}>{h.note}</Text> : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { ...type.displaySm, color: colors.textPrimary, marginTop: 8, marginBottom: 4 },
  sub: { ...type.body, color: colors.textMuted, marginBottom: 18 },
  error: { ...type.small, color: colors.error, marginTop: 8, textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  trackingId: { ...type.h1, color: colors.textPrimary },
  route: { ...type.small, color: colors.textMuted, marginTop: 2 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  metaItem: { width: '50%', marginBottom: 10 },
  metaLabel: { ...type.caption, color: colors.textMuted },
  metaValue: { ...type.smallBold, color: colors.textPrimary, marginTop: 2 },
  timelineTitle: { ...type.h2, color: colors.textPrimary, marginBottom: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  timelineRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 },
  timelineStatus: { ...type.bodyBold, color: colors.textPrimary, textTransform: 'capitalize' },
  timelineTime: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  timelineNote: { ...type.small, color: colors.textSecondary, marginTop: 2 },
})
