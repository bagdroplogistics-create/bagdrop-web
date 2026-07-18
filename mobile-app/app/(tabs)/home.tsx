import React from 'react'
import { View, Text, StyleSheet, Pressable, Linking, Image } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { SERVICE_TYPES, SITE } from '@/shared/constants'
import { useBooking } from '@/context/BookingContext'
import { useAuth } from '@/context/AuthContext'

export default function Home() {
  const { reset, update } = useBooking()
  const { session } = useAuth()

  const firstName = (session?.user?.user_metadata?.name as string | undefined)?.split(' ')[0]

  function startBooking(serviceId: (typeof SERVICE_TYPES)[number]['id']) {
    reset()
    update({ serviceId })
    router.push('/booking/new')
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hello{firstName ? `, ${firstName}` : ''} 👋</Text>
          <Text style={styles.title}>Where are your bags headed?</Text>
        </View>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      </View>

      <Card style={styles.heroCard}>
        <Text style={styles.heroTitle}>Book a pickup in minutes</Text>
        <Text style={styles.heroSub}>{SITE.tagline}</Text>
        <Pressable style={styles.heroCta} onPress={() => router.push('/booking/new')}>
          <Text style={styles.heroCtaText}>Start a booking</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </Pressable>
      </Card>

      <Text style={styles.sectionTitle}>Our services</Text>
      <View style={styles.grid}>
        {SERVICE_TYPES.map(s => (
          <Pressable key={s.id} style={styles.serviceCard} onPress={() => startBooking(s.id)}>
            <View style={styles.serviceIcon}>
              <Ionicons name={s.icon as any} size={22} color={colors.brand} />
            </View>
            <Text style={styles.serviceLabel}>{s.label}</Text>
            <Text style={styles.serviceDesc}>{s.description}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Need help?</Text>
      <Pressable
        style={styles.helpRow}
        onPress={() => Linking.openURL(`https://wa.me/${SITE.whatsapp}`)}
      >
        <Ionicons name="logo-whatsapp" size={22} color={colors.success} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.helpTitle}>Chat with us on WhatsApp</Text>
          <Text style={styles.helpSub}>Usually replies within minutes</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.neutralMid} />
      </Pressable>
      <Pressable style={styles.helpRow} onPress={() => router.push('/(tabs)/track')}>
        <Ionicons name="location" size={22} color={colors.brand} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.helpTitle}>Track a booking</Text>
          <Text style={styles.helpSub}>Enter your tracking ID for live status</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.neutralMid} />
      </Pressable>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  hello: { ...type.small, color: colors.textMuted, marginBottom: 2 },
  title: { ...type.displaySm, color: colors.textPrimary, maxWidth: 240 },
  logo: { width: 36, height: 47 },
  heroCard: { backgroundColor: colors.midnight, borderColor: colors.midnight, marginBottom: 24 },
  heroTitle: { ...type.h1, color: '#fff', marginBottom: 4 },
  heroSub: { ...type.small, color: 'rgba(255,255,255,0.7)', marginBottom: 14 },
  heroCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand, alignSelf: 'flex-start',
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.md,
  },
  heroCtaText: { ...type.smallBold, color: '#fff' },
  sectionTitle: { ...type.h2, color: colors.textPrimary, marginBottom: 12, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  serviceCard: {
    width: '47%', backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  serviceIcon: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  serviceLabel: { ...type.bodyBold, color: colors.textPrimary, marginBottom: 2 },
  serviceDesc: { ...type.caption, color: colors.textMuted },
  helpRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 10,
  },
  helpTitle: { ...type.bodyBold, color: colors.textPrimary },
  helpSub: { ...type.caption, color: colors.textMuted, marginTop: 1 },
})
