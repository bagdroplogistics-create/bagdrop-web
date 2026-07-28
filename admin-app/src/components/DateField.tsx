import React, { useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'

interface Props {
  label?: string
  placeholder?: string
  value: string // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void
  disabled?: boolean
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function parseDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) }
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function formatDisplay(value: string): string {
  const parsed = parseDate(value)
  if (!parsed) return ''
  return `${String(parsed.d).padStart(2, '0')} ${MONTH_NAMES[parsed.m].slice(0, 3)} ${parsed.y}`
}

export function DateField({ label, placeholder = 'Select date', value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const parsed = parseDate(value)
  const today = new Date()
  const [viewY, setViewY] = useState(parsed?.y ?? today.getFullYear())
  const [viewM, setViewM] = useState(parsed?.m ?? today.getMonth())

  function openPicker() {
    const p = parseDate(value)
    setViewY(p?.y ?? today.getFullYear())
    setViewM(p?.m ?? today.getMonth())
    setOpen(true)
  }

  function prevMonth() {
    if (viewM === 0) { setViewM(11); setViewY(y => y - 1) } else { setViewM(m => m - 1) }
  }
  function nextMonth() {
    if (viewM === 11) { setViewM(0); setViewY(y => y + 1) } else { setViewM(m => m + 1) }
  }

  const firstWeekday = new Date(viewY, viewM, 1).getDay()
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[styles.field, disabled && styles.disabled]}
        onPress={() => !disabled && openPicker()}
      >
        <Ionicons name="calendar-outline" size={16} color={colors.neutralMid} style={{ marginRight: 8 }} />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.calHeader}>
              <Pressable onPress={prevMonth} hitSlop={10}>
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.calHeaderText}>{MONTH_NAMES[viewM]} {viewY}</Text>
              <Pressable onPress={nextMonth} hitSlop={10}>
                <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map(w => (
                <Text key={w} style={styles.weekday}>{w}</Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, idx) => {
                if (day === null) return <View key={idx} style={styles.cell} />
                const isSelected = parsed?.y === viewY && parsed?.m === viewM && parsed?.d === day
                return (
                  <Pressable
                    key={idx}
                    style={[styles.cell, isSelected && styles.cellSelected]}
                    onPress={() => { onChange(formatDate(viewY, viewM, day)); setOpen(false) }}
                  >
                    <Text style={[styles.cellText, isSelected && styles.cellTextSelected]}>{day}</Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.footerRow}>
              <Pressable onPress={() => { onChange(''); setOpen(false) }}>
                <Text style={styles.footerBtn}>Clear</Text>
              </Pressable>
              <Pressable onPress={() => {
                const t = new Date()
                onChange(formatDate(t.getFullYear(), t.getMonth(), t.getDate()))
                setOpen(false)
              }}>
                <Text style={[styles.footerBtn, { color: colors.brand }]}>Today</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { ...type.smallBold, color: colors.textSecondary, marginBottom: 6 },
  field: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.5 },
  value: { ...type.body, color: colors.textPrimary },
  placeholder: { color: colors.neutralLight },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  calHeaderText: { ...type.h1, color: colors.textPrimary },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { ...type.caption, color: colors.textMuted, width: `${100 / 7}%`, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellSelected: { backgroundColor: colors.brand, borderRadius: 999 },
  cellText: { ...type.body, color: colors.textPrimary },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  footerBtn: { ...type.smallBold, color: colors.textMuted },
})
