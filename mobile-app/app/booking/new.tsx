import React, { useMemo } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { StepHeader } from '@/components/StepHeader'
import { SelectField } from '@/components/SelectField'
import { BookingFooter } from '@/components/BookingFooter'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { SERVICE_TYPES, BOOKING_LOCATIONS, VALID_ROUTES } from '@/shared/constants'
import { useBooking } from '@/context/BookingContext'
import { isStep1Valid } from '@/shared/booking-types'

export default function NewBooking() {
  const { state, update } = useBooking()

  const fromOptions = useMemo(() => {
    const froms = Array.from(new Set(VALID_ROUTES.map(r => r.from)))
    return BOOKING_LOCATIONS.filter(l => froms.includes(l.id)).map(l => ({ value: l.id, label: l.label }))
  }, [])

  const toOptions = useMemo(() => {
    if (!state.fromCity) return []
    const tos = VALID_ROUTES.filter(r => r.from === state.fromCity).map(r => r.to)
    return BOOKING_LOCATIONS.filter(l => tos.includes(l.id)).map(l => ({ value: l.id, label: l.label }))
  }, [state.fromCity])

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.replace('/(tabs)/home')} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        <StepHeader step={1} total={4} title="What are we shipping, and where?" />

        <Text style={styles.label}>Service</Text>
        <View style={styles.serviceRow}>
          {SERVICE_TYPES.map(s => (
            <Pressable
              key={s.id}
              onPress={() => update({ serviceId: s.id })}
              style={[styles.serviceChip, state.serviceId === s.id && styles.serviceChipActive]}
            >
              <Text style={[styles.serviceChipText, state.serviceId === s.id && styles.serviceChipTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <SelectField
          label="Pickup city"
          placeholder="Select pickup city"
          value={state.fromCity}
          options={fromOptions}
          onChange={v => update({ fromCity: v as typeof state.fromCity, toCity: null })}
        />
        <SelectField
          label="Delivery city"
          placeholder={state.fromCity ? 'Select delivery city' : 'Select pickup city first'}
          value={state.toCity}
          options={toOptions}
          onChange={v => update({ toCity: v as typeof state.toCity })}
          disabled={!state.fromCity}
        />

        {state.fromCity && toOptions.length === 0 ? (
          <Text style={styles.hint}>
            No standard route found from this city yet — you can still continue and our team will send a custom quote.
          </Text>
        ) : null}
      </View>

      <BookingFooter
        onNext={() => router.push('/booking/bags')}
        nextDisabled={!isStep1Valid(state)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, alignItems: 'flex-end' },
  label: { ...type.smallBold, color: colors.textSecondary, marginBottom: 10 },
  serviceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  serviceChip: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  serviceChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  serviceChipText: { ...type.small, color: colors.textSecondary },
  serviceChipTextActive: { color: '#fff', fontWeight: '700' },
  hint: { ...type.small, color: colors.warning, marginTop: 4 },
})
