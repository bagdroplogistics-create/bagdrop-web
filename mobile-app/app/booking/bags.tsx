import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/Screen'
import { StepHeader } from '@/components/StepHeader'
import { Card } from '@/components/Card'
import { Stepper } from '@/components/Stepper'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { BookingFooter } from '@/components/BookingFooter'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { BAG_TYPES, type BagTypeId } from '@/shared/constants'
import { useBooking } from '@/context/BookingContext'
import { isStep2Valid, WEDDING_EVENT_TYPES } from '@/shared/booking-types'

export default function Bags() {
  const { state, update } = useBooking()

  function setQty(type: BagTypeId, qty: number) {
    const others = state.bags.filter(b => b.type !== type)
    update({ bags: qty > 0 ? [...others, { type, quantity: qty }] : others })
  }

  function qtyOf(type: BagTypeId) {
    return state.bags.find(b => b.type === type)?.quantity ?? 0
  }

  const hasWedding = qtyOf('wedding') > 0

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <StepHeader step={2} total={4} title="Tell us about your bags" />

        {(Object.values(BAG_TYPES)).map(bag => (
          <Card key={bag.id} style={{ marginBottom: 12 }}>
            <View style={styles.bagRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bagLabel}>{bag.label}</Text>
                <Text style={styles.bagMeta}>{bag.description}</Text>
                <Text style={styles.bagMeta}>{bag.maxWeight}</Text>
                <Text style={styles.bagMeta}>{bag.dimensions}</Text>
              </View>
              <Stepper value={qtyOf(bag.id)} onChange={v => setQty(bag.id, v)} />
            </View>
          </Card>
        ))}

        {hasWedding ? (
          <Card style={{ marginTop: 4 }}>
            <Text style={styles.sectionTitle}>Wedding event details</Text>
            <TextField
              label="Number of guests"
              placeholder="e.g. 150"
              keyboardType="number-pad"
              value={state.weddingGuests ? String(state.weddingGuests) : ''}
              onChangeText={v => update({ weddingGuests: v ? parseInt(v, 10) : null })}
            />
            <SelectField
              label="Event type"
              value={state.weddingEventType || null}
              options={WEDDING_EVENT_TYPES.map(t => ({ value: t, label: t }))}
              onChange={v => update({ weddingEventType: v as typeof state.weddingEventType })}
            />
            <TextField
              label="Event date (YYYY-MM-DD)"
              placeholder="2026-08-15"
              value={state.weddingEventDate}
              onChangeText={v => update({ weddingEventDate: v })}
            />
            <TextField
              label="Wedding pickup location"
              placeholder="Venue / hotel name & city"
              value={state.weddingPickupLocation}
              onChangeText={v => update({ weddingPickupLocation: v })}
            />
            <TextField
              label="Wedding drop location"
              placeholder="Venue / hotel name & city"
              value={state.weddingDropLocation}
              onChangeText={v => update({ weddingDropLocation: v })}
            />
            <TextField
              label="Special instructions (optional)"
              placeholder="Fragile décor, specific timing, etc."
              value={state.weddingSpecialInstructions}
              onChangeText={v => update({ weddingSpecialInstructions: v })}
              multiline
            />
          </Card>
        ) : null}

        {state.bags.reduce((s, b) => s + b.quantity, 0) >= 3 ? (
          <Text style={styles.multiBagHint}>
            {state.bags.reduce((s, b) => s + b.quantity, 0)} items — our team will confirm the best rate for your booking
          </Text>
        ) : null}
      </View>

      <BookingFooter
        onBack={() => router.back()}
        onNext={() => router.push('/booking/schedule')}
        nextDisabled={!isStep2Valid(state)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  bagRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bagLabel: { ...type.bodyBold, color: colors.textPrimary },
  bagMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { ...type.h2, color: colors.textPrimary, marginBottom: 12 },
  multiBagHint: { ...type.smallBold, color: colors.success, textAlign: 'center', marginTop: 4, marginBottom: 8 },
})
