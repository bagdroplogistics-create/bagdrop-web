import React from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Redirect } from 'expo-router'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { colors } from '@/theme/colors'

export default function Index() {
  const { adminKey, loading } = useAdminAuth()

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    )
  }

  return <Redirect href={adminKey ? '/(admin)/dashboard' : '/login'} />
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.midnight, alignItems: 'center', justifyContent: 'center' },
})
