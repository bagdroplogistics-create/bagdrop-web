import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { PhoneInput } from '@/components/PhoneInput'
import { DateField } from '@/components/DateField'
import { Button } from '@/components/Button'
import { BackHeader } from '@/components/BackHeader'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { createLead, AdminApiError } from '@/lib/api'
import { LEAD_SERVICE_TYPES, leadNeedsFlightInfo } from '@/shared/leads'
import { PICKUP_LOCATIONS, OTHERS_VALUE } from '@/shared/locations'
import { TIME_OPTIONS } from '@/shared/time-options'
import { toE164 } from '@/shared/phone-format'
import { DEFAULT_COUNTRY_ISO2 } from '@/shared/phone-countries'

export default function NewLead() {
  const { adminKey } = useAdminAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [countryIso2, setCountryIso2] = useState(DEFAULT_COUNTRY_ISO2)
  const [email, setEmail] = useState('')
  const [serviceInterest, setServiceInterest] = useState<string | null>(null)

  // Route & schedule — same location pickers, date pickers, and time
  // dropdown as the New Quote form, so admins fill this out identically
  // whether they're logging an inquiry or generating a quote.
  const [fromLocationId, setFromLocationId] = useState<string | null>(null)
  const [fromOtherText, setFromOtherText] = useState('')
  const [toLocationId, setToLocationId] = useState<string | null>(null)
  const [toOtherText, setToOtherText] = useState('')
  const [bagsCount, setBagsCount] = useState('1')
  const [pickupDate, setPickupDate] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [dropAddress, setDropAddress] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [pnr, setPnr] = useState('')

  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fromCity = fromLocationId === OTHERS_VALUE
    ? fromOtherText
    : (PICKUP_LOCATIONS.find(l => l.id === fromLocationId)?.label ?? '')
  const toCity = toLocationId === OTHERS_VALUE
    ? toOtherText
    : (PICKUP_LOCATIONS.find(l => l.id === toLocationId)?.label ?? '')

  const fromLocationOptions = [
    ...PICKUP_LOCATIONS.filter(l => l.id !== toLocationId).map(l => ({ value: l.id, label: l.label })),
    { value: OTHERS_VALUE, label: 'Others (type manually)' },
  ]
  const toLocationOptions = [
    ...PICKUP_LOCATIONS.filter(l => l.id !== fromLocationId).map(l => ({ value: l.id, label: l.label })),
    { value: OTHERS_VALUE, label: 'Others (type manually)' },
  ]

  function handleFromChange(v: string) {
    setFromLocationId(v)
    if (v !== OTHERS_VALUE) setFromOtherText('')
    if (v !== OTHERS_VALUE && v === toLocationId) setToLocationId(null)
  }
  function handleToChange(v: string) {
    setToLocationId(v)
    if (v !== OTHERS_VALUE) setToOtherText('')
    if (v !== OTHERS_VALUE && v === fromLocationId) setFromLocationId(null)
  }
  function swapLocations() {
    const fId = fromLocationId, fText = fromOtherText
    setFromLocationId(toLocationId); setFromOtherText(toOtherText)
    setToLocationId(fId); setToOtherText(fText)
  }

  const valid = !!(name.trim() && phone.trim())

  async function handleCreate(forceDuplicate = false) {
    if (!adminKey || !valid) return
    setError('')
    setSaving(true)
    try {
      await createLead(adminKey, {
        name: name.trim(),
        phone: toE164(phone, countryIso2),
        phone_country_code: countryIso2,
        phone_national: phone.trim(),
        email: email.trim() || undefined,
        service_interest: serviceInterest ?? undefined,
        from_city: fromCity.trim() || undefined,
        to_city: toCity.trim() || undefined,
        bags_count: Number(bagsCount) || 1,
        pickup_date: pickupDate.trim() || undefined,
        pickup_time: pickupTime.trim() || undefined,
        delivery_date: deliveryDate.trim() || undefined,
        pickup_address: pickupAddress.trim() || undefined,
        drop_address: dropAddress.trim() || undefined,
        flight_number: flightNumber.trim() || undefined,
        pnr: pnr.trim() || undefined,
        notes: notes.trim() || undefined,
        source: 'admin',
        force_duplicate: forceDuplicate,
      })
      router.back()
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 409) {
        Alert.alert(
          'Duplicate phone number',
          'A lead already exists for this phone number. Create another one anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Create anyway', onPress: () => handleCreate(true) },
          ]
        )
      } else {
        setError(e instanceof Error ? e.message : 'Could not create this inquiry.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <BackHeader />
      <Text style={styles.title}>New lead</Text>
      <Text style={styles.sub}>Same route, schedule, and item fields as the New Quote form.</Text>

      <Text style={styles.sectionTitle}>Contact</Text>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="Customer name" />
      <PhoneInput
        label="Phone"
        countryIso2={countryIso2}
        nationalNumber={phone}
        onCountryChange={setCountryIso2}
        onNumberChange={setPhone}
        placeholder="9876543210"
      />
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <SelectField
        label="Service Type"
        placeholder="Select service type"
        value={serviceInterest}
        options={LEAD_SERVICE_TYPES.map(s => ({ value: s.value, label: s.label }))}
        onChange={setServiceInterest}
      />

      <Text style={styles.sectionTitle}>Route & Schedule</Text>
      <SelectField
        label="Pickup city / location"
        placeholder="Select pickup location"
        value={fromLocationId}
        options={fromLocationOptions}
        onChange={handleFromChange}
      />
      {fromLocationId === OTHERS_VALUE ? (
        <TextField placeholder="Enter pickup city or location" value={fromOtherText} onChangeText={setFromOtherText} />
      ) : null}

      <Pressable style={styles.swapRow} onPress={swapLocations} hitSlop={8}>
        <Ionicons name="swap-vertical" size={16} color={colors.textMuted} />
        <Text style={styles.swapText}>Swap locations</Text>
      </Pressable>

      <SelectField
        label="Drop city / location"
        placeholder="Select drop location"
        value={toLocationId}
        options={toLocationOptions}
        onChange={handleToChange}
      />
      {toLocationId === OTHERS_VALUE ? (
        <TextField placeholder="Enter drop city or location" value={toOtherText} onChangeText={setToOtherText} />
      ) : null}

      <TextField label="No. of Bags" value={bagsCount} onChangeText={setBagsCount} keyboardType="number-pad" />

      <View style={styles.rowFields}>
        <View style={{ flex: 1, marginRight: 8 }}><DateField label="Pickup Date" value={pickupDate} onChange={setPickupDate} /></View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <SelectField label="Pickup Time" placeholder="Select time" value={pickupTime || null} options={TIME_OPTIONS} onChange={setPickupTime} />
        </View>
      </View>
      <DateField label="Delivery Date" value={deliveryDate} onChange={setDeliveryDate} />

      <View style={styles.rowFields}>
        <View style={{ flex: 1, marginRight: 8 }}><TextField label="Flight Number" value={flightNumber} onChangeText={setFlightNumber} autoCapitalize="characters" /></View>
        <View style={{ flex: 1, marginLeft: 8 }}><TextField label="PNR" value={pnr} onChangeText={setPnr} autoCapitalize="characters" /></View>
      </View>

      <TextField label="Pickup Address" value={pickupAddress} onChangeText={setPickupAddress} multiline placeholder="Terminal 2, CSIA, Mumbai" />
      <TextField label="Drop / Delivery Address" value={dropAddress} onChangeText={setDropAddress} multiline placeholder="Hotel / Home address" />

      <Text style={styles.sectionTitle}>Notes</Text>
      <TextField value={notes} onChangeText={setNotes} multiline placeholder="Anything the team should know" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 24 }}>
        <View style={{ flex: 1 }}>
          <Button label="Cancel" variant="outline" onPress={() => router.back()} />
        </View>
        <View style={{ flex: 2 }}>
          <Button label="Create lead" onPress={() => handleCreate(false)} loading={saving} disabled={!valid} />
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.displaySm, color: colors.textPrimary, marginBottom: 2 },
  sub: { ...type.small, color: colors.textMuted, marginBottom: 16 },
  sectionTitle: { ...type.h2, color: colors.textPrimary, marginTop: 8, marginBottom: 12 },
  error: { ...type.small, color: colors.error, textAlign: 'center', marginVertical: 8 },
  rowFields: { flexDirection: 'row' },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, marginTop: -4 },
  swapText: { ...type.smallBold, color: colors.textMuted },
})
