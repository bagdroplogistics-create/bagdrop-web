import React from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AdminAuthProvider } from '@/context/AdminAuthContext'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AdminAuthProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(admin)" />
            <Stack.Screen name="leads" />
            <Stack.Screen name="quotes" />
            <Stack.Screen name="bookings" />
          </Stack>
        </AdminAuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
