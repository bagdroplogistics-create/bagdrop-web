import React from 'react'
import { View, ScrollView, StyleSheet, ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/theme/colors'

interface Props {
  children: React.ReactNode
  scroll?: boolean
  style?: ViewStyle
  padded?: boolean
}

export function Screen({ children, scroll = true, style, padded = true }: Props) {
  const Container = scroll ? ScrollView : View
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Container
        style={styles.flex}
        contentContainerStyle={
          scroll ? [padded && styles.padded, style] : undefined
        }
        {...(scroll ? { showsVerticalScrollIndicator: false, keyboardShouldPersistTaps: 'handled' as const } : {})}
      >
        {scroll ? children : <View style={[styles.flex, padded && styles.padded, style]}>{children}</View>}
      </Container>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  padded: { padding: 20 },
})
