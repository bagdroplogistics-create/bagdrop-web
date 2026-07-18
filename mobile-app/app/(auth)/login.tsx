import React, { useState } from 'react'
import { View, Text, StyleSheet, Image, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAuth } from '@/context/AuthContext'

export default function Login() {
  const { requestOtp } = useAuth()
  const [mode, setMode] = useState<'phone' | 'email'>('phone')
  const [contact, setContact] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleContinue() {
    setError('')
    const trimmed = contact.trim()
    if (mode === 'phone' && !/^[6-9]\d{9}$/.test(trimmed.replace(/\D/g, ''))) {
      setError('Enter a valid 10-digit Indian mobile number.')
      return
    }
    if (mode === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      const fullContact = mode === 'phone' ? '+91' + trimmed.replace(/\D/g, '') : trimmed.toLowerCase()
      const { fallbackOtp } = await requestOtp(mode, fullContact)
      router.push({
        pathname: '/(auth)/verify',
        params: { type: mode, contact: fullContact, fallbackOtp: fallbackOtp ?? '' },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      </View>

      <Text style={styles.heading}>Welcome back</Text>
      <Text style={styles.sub}>Sign in with a one-time code — no password needed.</Text>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, mode === 'phone' && styles.tabActive]} onPress={() => setMode('phone')}>
          <Text style={[styles.tabText, mode === 'phone' && styles.tabTextActive]}>Phone</Text>
        </Pressable>
        <Pressable style={[styles.tab, mode === 'email' && styles.tabActive]} onPress={() => setMode('email')}>
          <Text style={[styles.tabText, mode === 'email' && styles.tabTextActive]}>Email</Text>
        </Pressable>
      </View>

      {mode === 'phone' ? (
        <TextField
          label="Mobile number"
          placeholder="98765 43210"
          keyboardType="phone-pad"
          maxLength={10}
          value={contact}
          onChangeText={setContact}
          error={error}
        />
      ) : (
        <TextField
          label="Email address"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={contact}
          onChangeText={setContact}
          error={error}
        />
      )}

      <Button label="Send code" onPress={handleContinue} loading={loading} />

      <Text style={styles.terms}>
        By continuing, you agree to Bagdrop's Terms of Service and Privacy Policy.
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
  logo: { width: 150, height: 195 },
  heading: { ...type.displaySm, color: colors.textPrimary, marginBottom: 4 },
  sub: { ...type.body, color: colors.textMuted, marginBottom: 20 },
  tabs: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: 10, padding: 4, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.surface },
  tabText: { ...type.smallBold, color: colors.textMuted },
  tabTextActive: { color: colors.textPrimary },
  terms: { ...type.small, color: colors.textMuted, textAlign: 'center', marginTop: 16 },
})
