import React, { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { DateField } from '@/components/DateField'
import { Stepper } from '@/components/Stepper'
import { Button } from '@/components/Button'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { TIME_SLOTS, BAG_TYPES, type BagTypeId } from '@/shared/constants'
import { WEDDING_EVENT_TYPES } from '@/shared/booking-types'
import { updateMyBooking } from '@/lib/api'

// Reverse-maps the stored "time_slot" column (a formatted label like
// "Morning (6:00 AM – 1:00 PM)") back to the matching TIME_SLOTS id so the
// picker can pre-select it. Falls back to null if it doesn't match any
// preset (e.g. an older or admin-entered value).
function slotIdFromLabel(label: string): string | null {
  return TIME_SLOTS.find(t => `${t.label} (${t.range})` === label)?.id ?? null
}

function slotLabelFromId(id: string): string {
  const t = TIME_SLOTS.find(t => t.id === id)
  return t ? `${t.label} (${t.range})` : id
}

// Tomorrow — matches the same minimum booking date used everywhere else.
function minDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

interface StoredBagDetails {
  bags?: { type: string; quantity: number }[]
  weddingGuests?: number | null
  weddingEventType?: string | null
  weddingEventDate?: string | null
  weddingPickupLocation?: string | null
  weddingDropLocation?: string | null
  weddingSpecialInstructions?: string | null
}

export default function EditBooking() {
  const params = useLocalSearchParams<{
    id: string
    trackingId?: string
    serviceType?: string
    pickupAddress?: string
    dropAddress?: string
    pickupDate?: string
    deliveryDate?: string
    timeSlot?: string
    flightNumber?: string
    notes?: string
    totalBags?: string
    bagDetails?: string
  }>()

  const isAirport = params.serviceType === 'airport-delivery'
  const tomorrow = minDate()

  const parsedBagDetails: StoredBagDetails = (() => {
    try { return params.bagDetails ? JSON.parse(params.bagDetails) : {} } catch { return {} }
  })()
  const initialBags: Record<BagTypeId, number> = { travel: 0, wedding: 0 }
  if (Array.isArray(parsedBagDetails.bags) && parsedBagDetails.bags.length) {
    for (const b of parsedBagDetails.bags) {
      if (b.type === 'travel' || b.type === 'wedding') initialBags[b.type] = b.quantity
    }
  } else {
    // No breakdown on file (older booking) — fall back to a single travel bag count.
    initialBags.travel = Number(params.totalBags) > 0 ? Number(params.totalBags) : 1
  }

  const [pickupAddress, setPickupAddress] = useState(params.pickupAddress ?? '')
  const [dropAddress, setDropAddress] = useState(params.dropAddress ?? '')
  const [pickupDate, setPickupDate] = useState(params.pickupDate ?? '')
  const [deliveryDate, setDeliveryDate] = useState(params.deliveryDate ?? '')
  const [timeSlotId, setTimeSlotId] = useState<string | null>(params.timeSlot ? slotIdFromLabel(params.timeSlot) : null)
  const [flightNumber, setFlightNumber] = useState(params.flightNumber ?? '')
  const [notes, setNotes] = useState(params.notes ?? '')
  const [bagCounts, setBagCounts] = useState<Record<BagTypeId, number>>(initialBags)
  const [weddingGuests, setWeddingGuests] = useState(parsedBagDetails.weddingGuests ? String(parsedBagDetails.weddingGuests) : '')
  const [weddingEventType, setWeddingEventType] = useState(parsedBagDetails.weddingEventType ?? '')
  const [weddingEventDate, setWeddingEventDate] = useState(parsedBagDetails.weddingEventDate ?? '')
  const [weddingPickupLocation, setWeddingPickupLocation] = useState(parsedBagDetails.weddingPickupLocation ?? '')
  const [weddingDropLocation, setWeddingDropLocation] = useState(parsedBagDetails.weddingDropLocation ?? '')
  const [weddingSpecialInstructions, setWeddingSpecialInstructions] = useState(parsedBagDetails.weddingSpecialInstructions ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalBags = bagCounts.travel + bagCounts.wedding
  const hasWedding = bagCounts.wedding > 0
  const bagsValid = totalBags > 0 && (!hasWedding || !!(
    weddingGuests && weddingEventType && weddingEventDate &&
    weddingPickupLocation.trim() && weddingDropLocation.trim()
  ))
  const valid = !!(pickupAddress.trim() && dropAddress.trim() && pickupDate && timeSlotId) && bagsValid

  async function handleSave() {
    if (!valid || !params.id) return
    setError('')
    setSaving(true)
    try {
      await updateMyBooking(params.id, {
        pickup_address: pickupAddress.trim(),
        drop_address: dropAddress.trim(),
        pickup_date: pickupDate,
        delivery_date: deliveryDate, // '' clears it — normalized to null server-side
        time_slot: timeSlotId ? slotLabelFromId(timeSlotId) : undefined,
        flight_number: isAirport ? flightNumber.trim() : undefined,
        notes: notes.trim(),
        bags: (['travel', 'wedding'] as BagTypeId[])
          .filter(t => bagCounts[t] > 0)
          .map(t => ({ type: t, quantity: bagCounts[t] })),
        weddingGuests: hasWedding ? parseInt(weddingGuests, 10) : null,
        weddingEventType: hasWedding ? weddingEventType : null,
        weddingEventDate: hasWedding ? weddingEventDate : null,
        weddingPickupLocation: hasWedding ? weddingPickupLocation.trim() : null,
        weddingDropLocation: hasWedding ? weddingDropLocation.trim() : null,
        weddingSpecialInstructions: hasWedding ? weddingSpecialInstructions.trim() : null,
      })
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Text style={styles.title}>Edit booking</Text>
        <Text style={styles.sub}>{params.trackingId}</Text>

        <Card style={{ marginTop: 16, marginBottom: 16, backgroundColor: colors.brandLight, borderColor: colors.brand }}>
          <Text style={styles.hint}>
            You can update these details until our team confirms and picks up your bags. Service and route can't be
            changed here — contact support for those.
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Bags</Text>
        {(Object.values(BAG_TYPES)).map(bag => (
          <Card key={bag.id} style={{ marginBottom: 12 }}>
            <View style={styles.bagRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bagLabel}>{bag.label}</Text>
                <Text style={styles.bagMeta}>{bag.description}</Text>
              </View>
              <Stepper value={bagCounts[bag.id]} onChange={v => setBagCounts(prev => ({ ...prev, [bag.id]: v }))} />
            </View>
          </Card>
        ))}

        {hasWedding ? (
          <Card style={{ marginBottom: 16 }}>
            <Text style={styles.sectionTitle}>Wedding event details</Text>
            <TextField
              label="Number of guests"
              placeholder="e.g. 150"
              keyboardType="number-pad"
              value={weddingGuests}
              onChangeText={setWeddingGuests}
            />
            <SelectField
              label="Event type"
              value={weddingEventType || null}
              options={WEDDING_EVENT_TYPES.map(t => ({ value: t, label: t }))}
              onChange={setWeddingEventType}
            />
            <TextField
              label="Event date (YYYY-MM-DD)"
              placeholder="2026-08-15"
              value={weddingEventDate}
              onChangeText={setWeddingEventDate}
            />
            <TextField
              label="Wedding pickup location"
              placeholder="Venue / hotel name & city"
              value={weddingPickupLocation}
              onChangeText={setWeddingPickupLocation}
            />
            <TextField
              label="Wedding drop location"
              placeholder="Venue / hotel name & city"
              value={weddingDropLocation}
              onChangeText={setWeddingDropLocation}
            />
            <TextField
              label="Special instructions (optional)"
              placeholder="Fragile décor, specific timing, etc."
              value={weddingSpecialInstructions}
              onChangeText={setWeddingSpecialInstructions}
              multiline
            />
          </Card>
        ) : null}

        <Text style={styles.sectionTitle}>Schedule &amp; addresses</Text>
        <DateField label="Pickup date" value={pickupDate} minDate={tomorrow} onChange={setPickupDate} />
        <DateField label="Expected delivery date (optional)" value={deliveryDate} minDate={pickupDate || tomorrow} onChange={setDeliveryDate} />
        <SelectField
          label="Pickup time slot"
          value={timeSlotId}
          options={TIME_SLOTS.map(t => ({ value: t.id, label: `${t.label} (${t.range})` }))}
          onChange={setTimeSlotId}
        />
        <TextField
          label="Pickup address"
          placeholder="Flat / house no., street, area, city"
          value={pickupAddress}
          onChangeText={setPickupAddress}
          multiline
        />
        <TextField
          label="Delivery address"
          placeholder="Flat / house no., street, area, city"
          value={dropAddress}
          onChangeText={setDropAddress}
          multiline
        />

        {isAirport ? (
          <TextField
            label="Flight number / PNR"
            placeholder="e.g. AI302, 6E 204, or PNR: ABC123"
            autoCapitalize="characters"
            value={flightNumber}
            onChangeText={setFlightNumber}
          />
        ) : null}

        <TextField
          label="Notes for our team (optional)"
          placeholder="Anything we should know?"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 24 }}>
          <View style={{ flex: 1 }}>
            <Button label="Cancel" variant="outline" onPress={() => router.back()} />
          </View>
          <View style={{ flex: 2 }}>
            <Button label="Save changes" onPress={handleSave} disabled={!valid} loading={saving} />
          </View>
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.displaySm, color: colors.textPrimary, marginTop: 8 },
  sub: { ...type.small, color: colors.textMuted, marginTop: 2 },
  hint: { ...type.small, color: colors.brandDark },
  sectionTitle: { ...type.h2, color: colors.textPrimary, marginBottom: 12, marginTop: 4 },
  bagRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bagLabel: { ...type.bodyBold, color: colors.textPrimary },
  bagMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  error: { ...type.small, color: colors.error, textAlign: 'center', marginTop: 4, marginBottom: 8 },
})
