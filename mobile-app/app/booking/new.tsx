import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { StepHeader } from '@/components/StepHeader'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { BookingFooter } from '@/components/BookingFooter'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { SERVICE_TYPES, BOOKING_LOCATIONS } from '@/shared/constants'
import { useBooking } from '@/context/BookingContext'
import { isStep1Valid } from '@/shared/booking-types'

const OTHERS_VALUE = '__others__'

export default function NewBooking() {
  const { state, update } = useBooking()
  const [fromOthers, setFromOthers] = useState(false)
  const [toOthers, setToOthers] = useState(false)

  const knownCityIds = useMemo(() => BOOKING_LOCATIONS.map(c => c.id as string), [])

  // Both dropdowns list every serviced location (minus whichever city is
  // already picked on the other side, to prevent same-city bookings), plus
  // an "Others" option that reveals a free-text field — matches the website.
  const fromOptions = useMemo(() => [
    ...BOOKING_LOCATIONS.filter(l => l.id !== state.toCity).map(l => ({ value: l.id, label: l.label })),
    { value: OTHERS_VALUE, label: 'Others' },
  ], [state.toCity])

  const toOptions = useMemo(() => [
    ...BOOKING_LOCATIONS.filter(l => l.id !== state.fromCity).map(l => ({ value: l.id, label: l.label })),
    { value: OTHERS_VALUE, label: 'Others' },
  ], [state.fromCity])

  const fromSelectValue = fromOthers
    ? OTHERS_VALUE
    : (state.fromCity && knownCityIds.includes(state.fromCity) ? state.fromCity : null)
  const toSelectValue = toOthers
    ? OTHERS_VALUE
    : (state.toCity && knownCityIds.includes(state.toCity) ? state.toCity : null)

  function handleFromChange(v: string) {
    if (v === OTHERS_VALUE) {
      setFromOthers(true)
      update({ fromCity: null })
    } else {
      setFromOthers(false)
      const cityId = v as typeof state.fromCity
      update({ fromCity: cityId, toCity: state.toCity === cityId ? null : state.toCity })
    }
  }

  function handleToChange(v: string) {
    if (v === OTHERS_VALUE) {
      setToOthers(true)
      update({ toCity: null })
    } else {
      setToOthers(false)
      update({ toCity: v as typeof state.toCity })
    }
  }

  function swapCities() {
    const wasFromOthers = fromOthers
    const wasToOthers = toOthers
    setFromOthers(wasToOthers)
    setToOthers(wasFromOthers)
    update({ fromCity: state.toCity, toCity: state.fromCity })
  }

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
          label="Pickup city / location"
          placeholder="Select pickup location"
          value={fromSelectValue}
          options={fromOptions}
          onChange={handleFromChange}
        />
        {fromOthers ? (
          <TextField
            placeholder="Enter your city or location"
            value={state.fromCity ?? ''}
            onChangeText={v => update({ fromCity: (v || null) as typeof state.fromCity })}
          />
        ) : null}

        <Pressable style={styles.swapRow} onPress={swapCities} hitSlop={8}>
          <Ionicons name="swap-vertical" size={16} color={colors.textMuted} />
          <Text style={styles.swapText}>Swap locations</Text>
        </Pressable>

        <SelectField
          label="Drop city / location"
          placeholder="Select drop location"
          value={toSelectValue}
          options={toOptions}
          onChange={handleToChange}
        />
        {toOthers ? (
          <TextField
            placeholder="Enter your city or location"
            value={state.toCity ?? ''}
            onChangeText={v => update({ toCity: (v || null) as typeof state.toCity })}
          />
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
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 8, marginBottom: 4 },
  swapText: { ...type.small, color: colors.textMuted },
})
