import React, { useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'

// react-native-community/datetimepicker has no web implementation, so the
// web branch below renders a plain HTML <input type="date"> instead — the
// same control the website itself uses. Only required on native.
const DateTimePicker =
  Platform.OS === 'web'
    ? null
    : (require('@react-native-community/datetimepicker').default as typeof import('@react-native-community/datetimepicker').default)

interface Props {
  label?: string
  value: string // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void
  minDate?: string // 'YYYY-MM-DD'
  placeholder?: string
}

function toDate(v: string): Date {
  return v ? new Date(v + 'T00:00:00') : new Date()
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function displayDate(v: string): string {
  if (!v) return ''
  return new Date(v + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function DateField({ label, value, onChange, minDate, placeholder = 'Select date' }: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const [draft, setDraft] = useState<Date>(toDate(value))

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {React.createElement('input', {
          type: 'date',
          value,
          min: minDate,
          onChange: (e: any) => onChange(e.target.value),
          style: webInputStyle,
        })}
      </View>
    )
  }

  function openPicker() {
    setDraft(toDate(value))
    setShowPicker(true)
  }

  function handleChange(event: { type: string }, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      setShowPicker(false)
      if (event.type === 'set' && selectedDate) onChange(toISODate(selectedDate))
      return
    }
    if (selectedDate) setDraft(selectedDate)
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.field} onPress={openPicker}>
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? displayDate(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={colors.neutralMid} />
      </Pressable>

      {Platform.OS === 'android' && showPicker && DateTimePicker ? (
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display="default"
          minimumDate={minDate ? toDate(minDate) : undefined}
          onChange={handleChange}
        />
      ) : null}

      {Platform.OS === 'ios' && DateTimePicker ? (
        <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShowPicker(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{label ?? 'Select date'}</Text>
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                minimumDate={minDate ? toDate(minDate) : undefined}
                onChange={handleChange}
              />
              <Pressable
                style={styles.doneBtn}
                onPress={() => { onChange(toISODate(draft)); setShowPicker(false) }}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  )
}

const webInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  paddingLeft: 14,
  paddingRight: 14,
  paddingTop: 12,
  paddingBottom: 12,
  fontSize: 15,
  color: colors.textPrimary,
  backgroundColor: colors.surface,
  fontFamily: 'inherit',
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { ...type.smallBold, color: colors.textSecondary, marginBottom: 6 },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: colors.surface,
  },
  value: { ...type.body, color: colors.textPrimary },
  placeholder: { color: colors.neutralLight },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, alignItems: 'center' },
  sheetTitle: { ...type.h1, color: colors.textPrimary, marginBottom: 8, alignSelf: 'flex-start' },
  doneBtn: { marginTop: 12, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 32 },
  doneText: { ...type.bodyBold, color: colors.textInverse },
})
