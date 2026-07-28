import React, { useState } from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'

// Mirrors the website's /admin/login page exactly: a single admin key,
// checked against the same ADMIN_SECRET_KEY / STAFF_SECRET_KEY the site
// uses (see lib/admin-auth.ts). There is no per-admin email/password
// account system on the backend today — this is not a gap in the mobile
// app, it's how the existing admin auth works everywhere.
export default function AdminLogin() {
  const { signIn } = useAdminAuth()
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    setError('')
    setLoading(true)
    try {
      await signIn(key)
      router.replace('/(admin)/dashboard')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen style={{ justifyContent: 'center', flexGrow: 1 }}>
      <View style={styles.hero}>
        <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.tagline}>Admin Dashboard</Text>
      </View>

      <Text style={styles.heading}>Sign in</Text>
      <Text style={styles.sub}>Enter your admin key to access the dashboard.</Text>

      <TextField
        label="Admin Secret Key"
        placeholder="Enter your admin key"
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        value={key}
        onChangeText={setKey}
        error={error}
      />

      <Text style={styles.showToggle} onPress={() => setShow(s => !s)}>
        {show ? 'Hide key' : 'Show key'}
      </Text>

      <Button label={loading ? 'Verifying…' : 'Access Dashboard'} onPress={handleLogin} loading={loading} disabled={!key.trim()} />

      <Text style={styles.footer}>Bagdrop Admin · Authorised personnel only</Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
  logo: { width: 150, height: 195 },
  tagline: { ...type.small, color: colors.textMuted, marginTop: 2 },
  heading: { ...type.displaySm, color: colors.textPrimary, marginBottom: 4 },
  sub: { ...type.body, color: colors.textMuted, marginBottom: 20 },
  showToggle: { ...type.smallBold, color: colors.brand, textAlign: 'right', marginTop: -8, marginBottom: 20 },
  footer: { ...type.small, color: colors.textMuted, textAlign: 'center', marginTop: 24 },
})
