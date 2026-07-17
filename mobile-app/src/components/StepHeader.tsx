import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'

export function StepHeader({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.stepLabel}>STEP {step} OF {total}</Text>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.track}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[styles.segment, i < step && styles.segmentActive, i > 0 && { marginLeft: 6 }]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  stepLabel: { ...type.caption, color: colors.brand, marginBottom: 4 },
  title: { ...type.displaySm, color: colors.textPrimary, marginBottom: 12 },
  track: { flexDirection: 'row' },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  segmentActive: { backgroundColor: colors.brand },
})
