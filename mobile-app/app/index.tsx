import React from 'react'
import { View, ActivityIndicator, Image, StyleSheet } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { colors } from '@/theme/colors'

export default function Index() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    )
  }

  return <Redirect href={session ? '/(tabs)/home' : '/(auth)/login'} />
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.midnight, alignItems: 'center', justifyContent: 'center' },
})
