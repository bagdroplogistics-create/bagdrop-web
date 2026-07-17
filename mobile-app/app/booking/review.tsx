import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/Screen'
import { StepHeader } from '@/components/StepHeader'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { DateField } from '@/components/DateField'
import { BookingFooter } from '@/components/BookingFooter'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useBooking } from '@/context/BookingContext'
import { useAuth } from '@/context/AuthContext'
import { isStep4Valid, COUNTRY_CODES } from '@/shared/booking-types'
import { BOOKING_LOCATIONS, ADDON_SERVICES, TIME_SLOTS } from '@/shared/constants'
import { formatCurrency } from '@/shared/format'
import { createBooking } from '@/lib/api'

// Matches the website's step-review.tsx exactly: no pricing or payment is
// shown or collected here. The booking is submitted as a request; pricing
// is computed and sent to the backend for internal use only, and your team
// follows up later with a quote (which is where payment actually happens).

function cityLabel(id: string | null) {
  return BOOKING_LOCATIONS.find(c => c.id === id)?.label ?? id ?? '—'
}

export default function Review() {
  const { state, update, pricing, reset } = useBooking()
  const { session } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const isAirport = state.serviceId === 'airport-delivery'

  // Prefill phone from the signed-in session if the customer's contact was via phone OTP.
  useEffect(() => {
    if (!state.phone && session?.user?.email?.startsWith('phone_')) {
      const digits = session.user.email.replace(/^phone_/, '').replace(/@auth\.bagdrop\.in$/, '')
      if (digits.length >= 10) update({ phone: digits.slice(-10) })
    }
    if (!state.email && session?.user?.email && !session.user.email.startsWith('phone_')) {
      update({ email: session.user.email })
    }
  }, [session])

  function toggleAddon(id: 'insurance') {
    const has = state.addonIds.includes(id)
    update({ addonIds: has ? state.addonIds.filter(a => a !== id) : [...state.addonIds, id] })
  }

  async function handleConfirm() {
    setError('')
    setSubmitting(true)
    try {
      const result = await createBooking(state, pricing)
      reset()
      router.replace({ pathname: '/booking/confirmation', params: { trackingId: result.trackingId } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your booking. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <StepHeader step={4} total={4} title="Your details & review" />

        <Card style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>Trip summary</Text>
          <Row label="Service" value={state.serviceId ?? '—'} />
          <Row label="Route" value={`${cityLabel(state.fromCity)} → ${cityLabel(state.toCity)}`} />
          <Row label="Bags" value={`${pricing.totalBags} bag${pricing.totalBags !== 1 ? 's' : ''}`} />
          <Row label="Pickup" value={`${state.date || '—'} · ${state.timeSlotId ?? '—'}`} />
          {state.deliveryDate ? <Row label="Delivery date" value={state.deliveryDate} /> : null}
          {state.flightNumber ? <Row label="Flight" value={state.flightNumber.toUpperCase()} /> : null}
        </Card>

        {isAirport ? (
          <Card style={{ marginBottom: 16, borderColor: colors.brand, backgroundColor: colors.brandLight }}>
            <Text style={[styles.sectionTitle, { color: colors.brandDark }]}>✈ Flight details</Text>
            <TextField
              label="Flight number / PNR"
              placeholder="e.g. AI302, 6E 204, or PNR: ABC123"
              autoCapitalize="characters"
              value={state.flightNumber}
              onChangeText={v => update({ flightNumber: v })}
            />
            <Text style={styles.fieldHintLoose}>Flight date &amp; time (optional — helps us time your pickup)</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <DateField
                  value={state.flightDateTime ? state.flightDateTime.slice(0, 10) : ''}
                  onChange={v => {
                    const timePart = state.flightDateTime ? state.flightDateTime.slice(11, 16) : ''
                    update({ flightDateTime: timePart ? `${v}T${timePart}` : v })
                  }}
                  placeholder="Date"
                />
              </View>
              <View style={{ flex: 1 }}>
                <SelectField
                  value={state.flightDateTime ? state.flightDateTime.slice(11, 16) : null}
                  placeholder="Time"
                  options={TIME_SLOTS.map(t => ({ value: t.id, label: t.label }))}
                  onChange={v => {
                    const datePart = state.flightDateTime ? state.flightDateTime.slice(0, 10) : ''
                    update({ flightDateTime: datePart ? `${datePart}T${v}` : v })
                  }}
                />
              </View>
            </View>
          </Card>
        ) : null}

        <Card style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>Add-ons</Text>
          {ADDON_SERVICES.map(a => (
            <View key={a.id} style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonLabel}>{a.label}</Text>
                <Text style={styles.addonDesc}>{a.description}</Text>
                <Text style={styles.addonPrice}>+{formatCurrency(a.price)}</Text>
              </View>
              <Text
                onPress={() => toggleAddon(a.id)}
                style={[styles.addonToggle, state.addonIds.includes(a.id) && styles.addonToggleActive]}
              >
                {state.addonIds.includes(a.id) ? 'Added ✓' : 'Add'}
              </Text>
            </View>
          ))}
        </Card>

        <Text style={styles.sectionTitleLoose}>Your details</Text>
        <TextField label="Full name" placeholder="Your name" value={state.name} onChangeText={v => update({ name: v })} />
        <SelectField
          label="Country code"
          value={state.countryCode}
          options={COUNTRY_CODES.map(c => ({ value: c.code, label: `${c.flag} ${c.label}` }))}
          onChange={v => update({ countryCode: v })}
        />
        <TextField
          label="Mobile number"
          placeholder="98765 43210"
          keyboardType="phone-pad"
          value={state.phone}
          onChangeText={v => update({ phone: v })}
        />
        <TextField
          label="Email (optional)"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={state.email}
          onChangeText={v => update({ email: v })}
        />
        <TextField
          label="Notes for our team (optional)"
          placeholder="Anything we should know?"
          value={state.notes}
          onChangeText={v => update({ notes: v })}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.noPayment}>No payment required now — our team will follow up with pickup details and a quote.</Text>
      </View>

      <BookingFooter
        onBack={() => router.back()}
        onNext={handleConfirm}
        nextLabel="Confirm Booking"
        nextDisabled={!isStep4Valid(state)}
        loading={submitting}
      />
    </Screen>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  sectionTitle: { ...type.h2, color: colors.textPrimary, marginBottom: 10 },
  sectionTitleLoose: { ...type.h2, color: colors.textPrimary, marginBottom: 12, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowLabel: { ...type.small, color: colors.textMuted },
  rowValue: { ...type.small, color: colors.textPrimary },
  addonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  addonLabel: { ...type.bodyBold, color: colors.textPrimary },
  addonDesc: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  addonPrice: { ...type.smallBold, color: colors.textPrimary, marginTop: 3 },
  fieldHintLoose: { ...type.smallBold, color: colors.textSecondary, marginBottom: 6 },
  addonToggle: { ...type.smallBold, color: colors.brand, paddingHorizontal: 10, paddingVertical: 6 },
  addonToggleActive: { color: colors.success },
  error: { ...type.small, color: colors.error, textAlign: 'center', marginBottom: 8 },
  noPayment: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
})
