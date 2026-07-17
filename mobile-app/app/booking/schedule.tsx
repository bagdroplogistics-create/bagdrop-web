import React from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/Screen'
import { StepHeader } from '@/components/StepHeader'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { DateField } from '@/components/DateField'
import { BookingFooter } from '@/components/BookingFooter'
import { TIME_SLOTS } from '@/shared/constants'
import { useBooking } from '@/context/BookingContext'
import { isStep3Valid } from '@/shared/booking-types'

// Minimum bookable date = tomorrow (matches the website's step-schedule.tsx).
function minDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export default function Schedule() {
  const { state, update } = useBooking()
  const tomorrow = minDate()

  function setPickupDate(v: string) {
    const updates: { date: string; deliveryDate?: string } = { date: v }
    // Clear delivery date if it's now before the new pickup date.
    if (state.deliveryDate && state.deliveryDate < v) updates.deliveryDate = ''
    update(updates)
  }

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <StepHeader step={3} total={4} title="When and where?" />

        <DateField
          label="Pickup date"
          value={state.date}
          minDate={tomorrow}
          onChange={setPickupDate}
        />
        <DateField
          label="Expected delivery date (optional)"
          value={state.deliveryDate}
          minDate={state.date || tomorrow}
          onChange={v => update({ deliveryDate: v })}
        />
        <SelectField
          label="Pickup time slot"
          value={state.timeSlotId}
          options={TIME_SLOTS.map(t => ({ value: t.id, label: `${t.label} (${t.range})` }))}
          onChange={v => update({ timeSlotId: v })}
        />
        <TextField
          label="Pickup address"
          placeholder="Flat / house no., street, area, city"
          value={state.pickupAddress}
          onChangeText={v => update({ pickupAddress: v })}
          multiline
        />
        <TextField
          label="Delivery address"
          placeholder="Flat / house no., street, area, city"
          value={state.dropAddress}
          onChangeText={v => update({ dropAddress: v })}
          multiline
        />
      </View>

      <BookingFooter
        onBack={() => router.back()}
        onNext={() => router.push('/booking/review')}
        nextDisabled={!isStep3Valid(state)}
      />
    </Screen>
  )
}
