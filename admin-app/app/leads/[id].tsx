import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Alert } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { PhoneInput } from '@/components/PhoneInput'
import { Button } from '@/components/Button'
import { BackHeader } from '@/components/BackHeader'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchLead, updateLead, deleteLead, AdminLead } from '@/lib/api'
import { LEAD_STATUSES, LEAD_SERVICE_TYPES, leadNeedsFlightInfo } from '@/shared/leads'
import { formatDateTime } from '@/shared/format'
import { parseStoredPhone, toE164 } from '@/shared/phone-format'
import { DEFAULT_COUNTRY_ISO2 } from '@/shared/phone-countries'

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { adminKey } = useAdminAuth()
  const [lead, setLead] = useState<AdminLead | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Editable fields
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [countryIso2, setCountryIso2] = useState(DEFAULT_COUNTRY_ISO2)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('new')
  const [serviceInterest, setServiceInterest] = useState<string | null>(null)
  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [dropAddress, setDropAddress] = useState('')
  const [pickupDate, setPickupDate] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [pnr, setPnr] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    if (!adminKey || !id) return
    setError('')
    try {
      const { lead: l } = await fetchLead(adminKey, id)
      setLead(l)
      setName(l.name ?? '')
      // Re-parses the stored E.164 string so the correct flag/dial code
      // shows automatically instead of always assuming India.
      const parsedPhone = parseStoredPhone(l.phone)
      setPhone(l.phone_national || parsedPhone.nationalNumber)
      setCountryIso2(l.phone_country_code || parsedPhone.iso2)
      setEmail(l.email ?? '')
      setStatus(l.status ?? 'new')
      setServiceInterest(l.service_interest ?? l.service_type ?? null)
      setFromCity(l.from_city ?? '')
      setToCity(l.to_city ?? '')
      setPickupAddress(l.pickup_address ?? '')
      setDropAddress(l.drop_address ?? '')
      setPickupDate(l.pickup_date ?? '')
      setDeliveryDate(l.delivery_date ?? '')
      setFlightNumber(l.flight_number ?? '')
      setPnr(l.pnr ?? '')
      setNotes(l.notes ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this inquiry.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, id])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    if (!adminKey || !id) return
    setError('')
    setSaving(true)
    try {
      await updateLead(adminKey, id, {
        name: name.trim(),
        phone: toE164(phone, countryIso2),
        phone_country_code: countryIso2,
        phone_national: phone.trim(),
        email: email.trim() || undefined,
        status,
        service_interest: serviceInterest ?? undefined,
        from_city: fromCity.trim() || undefined,
        to_city: toCity.trim() || undefined,
        pickup_address: pickupAddress.trim() || undefined,
        drop_address: dropAddress.trim() || undefined,
        pickup_date: pickupDate.trim() || undefined,
        delivery_date: deliveryDate.trim() || undefined,
        flight_number: flightNumber.trim() || undefined,
        pnr: pnr.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  function handleDelete() {
    if (!adminKey || !id) return
    Alert.alert(
      'Delete inquiry?',
      'This soft-deletes the inquiry (it can be restored later) and cancels its linked booking if one was auto-created.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteLead(adminKey, id)
              router.back()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete this inquiry.')
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <Screen>
        <BackHeader />
        <Text style={styles.sub}>Loading…</Text>
      </Screen>
    )
  }

  if (!lead) {
    return (
      <Screen>
        <BackHeader />
        <Text style={styles.error}>{error || 'Inquiry not found.'}</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <BackHeader />
      <Text style={styles.title}>{lead.lead_number}</Text>
      <Text style={styles.sub}>Created {formatDateTime(lead.created_at)}</Text>

      <Text style={styles.sectionTitle}>Contact</Text>
      <TextField label="Name" value={name} onChangeText={setName} />
      <PhoneInput
        label="Phone"
        countryIso2={countryIso2}
        nationalNumber={phone}
        onCountryChange={setCountryIso2}
        onNumberChange={setPhone}
      />
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

      <Text style={styles.sectionTitle}>Service Details</Text>
      <SelectField
        label="Service Type"
        placeholder="Select service type"
        value={serviceInterest}
        options={LEAD_SERVICE_TYPES.map(s => ({ value: s.value, label: s.label }))}
        onChange={setServiceInterest}
      />
      <SelectField
        label="Status"
        value={status}
        options={LEAD_STATUSES.map(s => ({ value: s.key, label: s.label }))}
        onChange={setStatus}
      />
      <TextField label="From City" value={fromCity} onChangeText={setFromCity} placeholder="Mumbai" />
      <TextField label="To City" value={toCity} onChangeText={setToCity} placeholder="Delhi" />

      <Text style={styles.sectionTitle}>Addresses</Text>
      <TextField label="Pickup Address" value={pickupAddress} onChangeText={setPickupAddress} multiline />
      <TextField label="Drop Address" value={dropAddress} onChangeText={setDropAddress} multiline />

      <Text style={styles.sectionTitle}>Schedule</Text>
      <TextField label="Pickup Date (YYYY-MM-DD)" value={pickupDate} onChangeText={setPickupDate} placeholder="2026-08-01" />
      <TextField label="Delivery Date (YYYY-MM-DD)" value={deliveryDate} onChangeText={setDeliveryDate} placeholder="2026-08-05" />

      {leadNeedsFlightInfo(serviceInterest) ? (
        <>
          <Text style={styles.sectionTitle}>Flight Information</Text>
          <TextField label="Flight number" value={flightNumber} onChangeText={setFlightNumber} autoCapitalize="characters" />
          <TextField label="PNR" value={pnr} onChangeText={setPnr} autoCapitalize="characters" />
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Notes</Text>
      <TextField value={notes} onChangeText={setNotes} multiline placeholder="Internal notes" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ marginTop: 8, marginBottom: 12 }}>
        <Button label="Save changes" onPress={handleSave} loading={saving} disabled={!name.trim() || !phone.trim()} />
      </View>
      <View style={{ marginBottom: 12 }}>
        <Button
          label={lead.quote_number ? `View Quote (${lead.quote_number as string})` : 'Create Quote'}
          variant="secondary"
          onPress={() => router.push(
            lead.quote_number ? `/quotes/${lead.id}` : `/quotes/new?leadId=${lead.id}`
          )}
        />
      </View>
      {lead.booking_id ? (
        <View style={{ marginBottom: 12 }}>
          <Button
            label="View Booking Status"
            variant="secondary"
            onPress={() => router.push(`/bookings/${lead.booking_id}`)}
          />
        </View>
      ) : null}
      <Button label="Delete inquiry" variant="outline" onPress={handleDelete} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.displaySm, color: colors.textPrimary, marginBottom: 2 },
  sub: { ...type.small, color: colors.textMuted, marginBottom: 16 },
  sectionTitle: { ...type.h2, color: colors.textPrimary, marginTop: 8, marginBottom: 12 },
  error: { ...type.small, color: colors.error, textAlign: 'center', marginVertical: 8 },
})
