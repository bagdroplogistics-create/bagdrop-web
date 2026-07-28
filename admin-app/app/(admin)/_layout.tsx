import React from 'react'
import { Tabs, Redirect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { colors } from '@/theme/colors'

export default function AdminTabsLayout() {
  const { adminKey, loading } = useAdminAuth()

  if (!loading && !adminKey) return <Redirect href="/login" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.neutralMid,
        tabBarStyle: { borderTopColor: colors.border, height: 58, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="inquiries"
        options={{ title: 'Leads', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="quotes"
        options={{ title: 'Quotes', tabBarIcon: ({ color, size }) => <Ionicons name="document-text" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      />
    </Tabs>
  )
}
