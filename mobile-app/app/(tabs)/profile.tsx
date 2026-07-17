import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, Switch, Linking, Alert, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAuth } from '@/context/AuthContext'
import { SITE } from '@/shared/constants'

const BIOMETRIC_PREF_KEY = 'bagdrop_biometric_enabled'

export default function Profile() {
  const { session, signOut } = useAuth()
  const [biometricSupported, setBiometricSupported] = useState(false)
  const [biometricEnabled, setBiometricEnabled] = useState(false)

  // SecureStore and native biometric hardware aren't available in a browser
  // preview (npx expo start --web) — guard so the Profile tab still loads.
  const isWeb = Platform.OS === 'web'

  useEffect(() => {
    if (isWeb) return
    LocalAuthentication.hasHardwareAsync().then(setBiometricSupported).catch(() => setBiometricSupported(false))
    SecureStore.getItemAsync(BIOMETRIC_PREF_KEY).then(v => setBiometricEnabled(v === 'true')).catch(() => {})
  }, [])

  async function toggleBiometric(next: boolean) {
    if (isWeb) return
    if (next) {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Enable Face ID / Fingerprint login' })
      if (!result.success) return
    }
    await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, String(next))
    setBiometricEnabled(next)
  }

  const contact = session?.user?.email?.startsWith('phone_')
    ? '+' + session.user.email.replace(/^phone_/, '').replace(/@auth\.bagdrop\.in$/, '')
    : session?.user?.email ?? '—'

  return (
    <Screen>
      <Text style={styles.title}>Profile</Text>

      <Card style={styles.identityCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.contact}>{contact}</Text>
          <Text style={styles.memberSince}>Bagdrop customer</Text>
        </View>
      </Card>

      <Section title="Account">
        <Row icon="location-outline" label="Saved addresses" hint="Coming soon" onPress={() => Alert.alert('Coming soon', 'Saved addresses will be available in a future update.')} />
        <Row icon="card-outline" label="Saved payment methods" hint="Coming soon" onPress={() => Alert.alert('Coming soon', 'Saved payment methods will be available in a future update.')} />
        <Row icon="notifications-outline" label="Notification preferences" onPress={() => Alert.alert('Coming soon', 'Notification preferences will be available in a future update.')} />
      </Section>

      <Section title="Security">
        <View style={styles.row}>
          <Ionicons name="finger-print-outline" size={20} color={colors.textSecondary} style={styles.rowIcon} />
          <Text style={styles.rowLabel}>Face ID / Fingerprint login</Text>
          <Switch
            value={biometricEnabled}
            onValueChange={toggleBiometric}
            disabled={!biometricSupported}
            trackColor={{ true: colors.brand, false: colors.border }}
          />
        </View>
        {!biometricSupported ? (
          <Text style={styles.hint}>{isWeb ? 'Not available in the browser preview — try this on your phone.' : 'Not available on this device.'}</Text>
        ) : null}
      </Section>

      <Section title="Support">
        <Row icon="logo-whatsapp" label="WhatsApp support" onPress={() => Linking.openURL(`https://wa.me/${SITE.whatsapp}`)} />
        <Row icon="help-circle-outline" label="FAQ" onPress={() => Linking.openURL(`${SITE.url}/faq`)} />
        <Row icon="mail-outline" label="Email us" onPress={() => Linking.openURL(`mailto:${SITE.supportEmail}`)} />
        <Row icon="call-outline" label={SITE.phone} onPress={() => Linking.openURL(`tel:${SITE.phone.replace(/\s/g, '')}`)} />
      </Section>

      <Button label="Sign out" onPress={signOut} variant="outline" style={{ marginTop: 8 }} />
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card style={{ paddingVertical: 4 }}>{children}</Card>
    </View>
  )
}

function Row({ icon, label, hint, onPress }: { icon: any; label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.neutralMid} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  title: { ...type.displaySm, color: colors.textPrimary, marginTop: 8, marginBottom: 16 },
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.midnight, alignItems: 'center', justifyContent: 'center' },
  contact: { ...type.bodyBold, color: colors.textPrimary },
  memberSince: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  section: { marginBottom: 18 },
  sectionTitle: { ...type.smallBold, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { marginRight: 12 },
  rowLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  rowHint: { ...type.caption, color: colors.textMuted, marginRight: 6 },
  hint: { ...type.caption, color: colors.textMuted, paddingBottom: 8 },
})
