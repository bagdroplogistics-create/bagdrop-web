import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'

export function Stepper({ value, onChange, min = 0, max = 20 }: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.btn, value <= min && styles.btnDisabled]}
        onPress={() => value > min && onChange(value - 1)}
        disabled={value <= min}
      >
        <Ionicons name="remove" size={18} color={value <= min ? colors.neutralLight : colors.textPrimary} />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        style={[styles.btn, value >= max && styles.btnDisabled]}
        onPress={() => value < max && onChange(value + 1)}
        disabled={value >= max}
      >
        <Ionicons name="add" size={18} color={value >= max ? colors.neutralLight : colors.textPrimary} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  btn: {
    width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream,
  },
  btnDisabled: { opacity: 0.5 },
  value: { ...type.bodyBold, color: colors.textPrimary, minWidth: 20, textAlign: 'center' },
})
