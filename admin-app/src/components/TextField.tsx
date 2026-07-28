import React from 'react'
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'

interface Props extends TextInputProps {
  label?: string
  error?: string
}

export function TextField({ label, error, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.neutralLight}
        style={[styles.input, error && styles.inputError, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { ...type.smallBold, color: colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error },
  error: { ...type.small, color: colors.error, marginTop: 4 },
})
