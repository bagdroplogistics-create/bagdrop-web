import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'

export default function Profile() {
  const { role, signOut } = useAdminAuth()

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <Screen>
      <Text style={styles.title}>Profile</Text>

      <Card style={{ marginBottom: 16 }}>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={22} color="#fff" />
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.roleText}>{role === 'admin' ? 'Administrator' : 'Staff'}</Text>
            <Text style={styles.roleMeta}>Signed in with admin key</Text>
          </View>
        </View>
      </Card>

      <Button label="Sign out" variant="outline" onPress={handleSignOut} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.displaySm, color: colors.textPrimary, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.midnight,
    alignItems: 'center', justifyContent: 'center',
  },
  roleText: { ...type.bodyBold, color: colors.textPrimary, textTransform: 'capitalize' },
  roleMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
})
