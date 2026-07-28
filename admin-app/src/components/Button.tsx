import React from 'react'
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'

interface Props {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const isDisabled = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.brand} />
      ) : (
        <Text style={[styles.label, textVariantStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  label: { ...type.bodyBold },
  disabled: { opacity: 0.5 },
})

const variantStyles: Record<string, ViewStyle> = {
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.midnight },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
}

const textVariantStyles: Record<string, { color: string }> = {
  primary: { color: '#fff' },
  secondary: { color: '#fff' },
  outline: { color: colors.textPrimary },
  ghost: { color: colors.brand },
}
