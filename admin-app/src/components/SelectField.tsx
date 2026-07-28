import React, { useState } from 'react'
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'

export interface SelectOption { value: string; label: string }

interface Props {
  label?: string
  placeholder?: string
  value: string | null
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

export function SelectField({ label, placeholder = 'Select…', value, options, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[styles.field, disabled && styles.disabled]}
        onPress={() => !disabled && setOpen(true)}
      >
        <Text style={[styles.value, !selected && styles.placeholder]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.neutralMid} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{label ?? 'Select an option'}</Text>
            <FlatList
              data={options}
              keyExtractor={o => o.value}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => { onChange(item.value); setOpen(false) }}
                >
                  <Text style={[styles.optionText, item.value === value && styles.optionTextActive]}>
                    {item.label}
                  </Text>
                  {item.value === value ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No options available.</Text>}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { ...type.smallBold, color: colors.textSecondary, marginBottom: 6 },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.5 },
  value: { ...type.body, color: colors.textPrimary },
  placeholder: { color: colors.neutralLight },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { ...type.h1, color: colors.textPrimary, marginBottom: 12 },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { ...type.body, color: colors.textPrimary },
  optionTextActive: { color: colors.brand, fontWeight: '700' },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: 20 },
})
