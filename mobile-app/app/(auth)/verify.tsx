import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TextInput } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/Button'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAuth } from '@/context/AuthContext'

export default function Verify() {
  const { type: contactType, contact, fallbackOtp } = useLocalSearchParams<{
    type: 'email' | 'phone'
    contact: string
    fallbackOtp?: string
  }>()
  const { confirmOtp, requestOtp } = useAuth()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(30)
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  async function handleVerify(value: string) {
    if (value.length !== 6) return
    setError('')
    setLoading(true)
    try {
      await confirmOtp(contactType, contact, value)
      router.replace('/(tabs)/home')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed. Please try again.')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setError('')
    try {
      await requestOtp(contactType, contact)
      setSeconds(30)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <Screen>
      <Text style={styles.heading}>Enter your code</Text>
      <Text style={styles.sub}>
        We sent a 6-digit code to{' '}
        <Text style={styles.contact}>{contactType === 'phone' ? contact : contact}</Text>
      </Text>

      {fallbackOtp ? (
        <View style={styles.devBanner}>
          <Text style={styles.devBannerText}>
            SMS delivery isn't configured yet — your code is: <Text style={{ fontWeight: '800' }}>{fallbackOtp}</Text>
          </Text>
        </View>
      ) : null}

      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={v => {
          const digits = v.replace(/\D/g, '').slice(0, 6)
          setCode(digits)
          if (digits.length === 6) handleVerify(digits)
        }}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        style={styles.codeInput}
        placeholder="000000"
        placeholderTextColor={colors.neutralLight}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button label="Verify & Continue" onPress={() => handleVerify(code)} loading={loading} disabled={code.length !== 6} />

      <View style={styles.resendRow}>
        {seconds > 0 ? (
          <Text style={styles.resendMuted}>Resend code in {seconds}s</Text>
        ) : (
          <Button label={resending ? 'Sending…' : 'Resend code'} onPress={handleResend} variant="ghost" loading={resending} />
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  heading: { ...type.displaySm, color: colors.textPrimary, marginTop: 24, marginBottom: 4 },
  sub: { ...type.body, color: colors.textMuted, marginBottom: 20 },
  contact: { color: colors.textPrimary, fontWeight: '700' },
  devBanner: { backgroundColor: colors.warningBg, borderRadius: 10, padding: 12, marginBottom: 16 },
  devBannerText: { ...type.small, color: colors.warning },
  codeInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    fontSize: 28, letterSpacing: 12, textAlign: 'center', paddingVertical: 16,
    color: colors.textPrimary, marginBottom: 12, backgroundColor: colors.surface,
  },
  error: { ...type.small, color: colors.error, marginBottom: 12, textAlign: 'center' },
  resendRow: { alignItems: 'center', marginTop: 16 },
  resendMuted: { ...type.small, color: colors.textMuted },
})
