import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  quote_created: 'Quote Created',
  quote_sent: 'Quote Sent',
  accepted: 'Accepted',
  payment_received: 'Payment Received',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
}

const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  pending: { fg: colors.warning, bg: colors.warningBg },
  confirmed: { fg: colors.brand, bg: colors.brandLight },
  quote_created: { fg: colors.brand, bg: colors.brandLight },
  quote_sent: { fg: colors.brand, bg: colors.brandLight },
  accepted: { fg: colors.success, bg: colors.successBg },
  payment_received: { fg: colors.success, bg: colors.successBg },
  picked_up: { fg: colors.brand, bg: colors.brandLight },
  in_transit: { fg: colors.brand, bg: colors.brandLight },
  delivered: { fg: colors.success, bg: colors.successBg },
  cancelled: { fg: colors.error, bg: colors.errorBg },
  rejected: { fg: colors.error, bg: colors.errorBg },
}

export function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { fg: colors.textSecondary, bg: colors.border }
  const label = STATUS_LABELS[status] ?? status
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, alignSelf: 'flex-start' },
  text: { ...type.caption, textTransform: 'uppercase' },
})
