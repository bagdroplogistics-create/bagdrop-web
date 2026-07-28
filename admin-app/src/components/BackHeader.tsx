import React from 'react'
import { Pressable, View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { colors } from '@/theme/colors'

// Shared back-navigation row used on every pushed (non-tab) screen — the
// five bottom-tab screens (Dashboard/Inquiries/Quotes/Bookings/Profile) are
// the root of the stack and intentionally have no back arrow, since there's
// nothing to go back to there.
export function BackHeader() {
  return (
    <View style={styles.row}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.btn}>
        <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  btn: { padding: 4, marginLeft: -4 },
})
