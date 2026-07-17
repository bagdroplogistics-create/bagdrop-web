import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'

export default function Confirmation() {
  const { trackingId } = useLocalSearchParams<{ trackingId: string }>()

  return (
    <Screen>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={72} color={colors.success} />
      </View>
      <Text style={styles.title}>Booking confirmed!</Text>
      <Text style={styles.sub}>
        Our team has received your booking request. We'll be in touch shortly to confirm pickup details and share your quote — no payment is needed right now.
      </Text>

      <Card style={styles.idCard}>
        <Text style={styles.idLabel}>TRACKING ID</Text>
        <Text style={styles.idValue}>{trackingId}</Text>
        <Text style={styles.idHint}>Save this — you'll need it to track your booking.</Text>
      </Card>

      <Button label="Track this booking" onPress={() => router.replace({ pathname: '/(tabs)/track', params: { trackingId } })} />
      <View style={{ height: 12 }} />
      <Button label="Back to home" onPress={() => router.replace('/(tabs)/home')} variant="outline" />
    </Screen>
  )
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', marginTop: 40, marginBottom: 16 },
  title: { ...type.displaySm, color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  sub: { ...type.body, color: colors.textMuted, textAlign: 'center', marginBottom: 24 },
  idCard: { alignItems: 'center', marginBottom: 24, backgroundColor: colors.brandLight, borderColor: colors.brand },
  idLabel: { ...type.caption, color: colors.brandDark, marginBottom: 6 },
  idValue: { ...type.displayMd, color: colors.brand, letterSpacing: 2 },
  idHint: { ...type.small, color: colors.textMuted, marginTop: 8, textAlign: 'center' },
})
