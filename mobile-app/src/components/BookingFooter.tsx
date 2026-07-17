import React from 'react'
import { View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/theme/colors'
import { Button } from './Button'

interface Props {
  onNext: () => void
  onBack?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  loading?: boolean
}

export function BookingFooter({ onNext, onBack, nextLabel = 'Continue', nextDisabled, loading }: Props) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.wrap}>
      <View style={styles.row}>
        {onBack ? (
          <View style={{ flex: 1 }}>
            <Button label="Back" onPress={onBack} variant="outline" />
          </View>
        ) : null}
        <View style={{ flex: 2 }}>
          <Button label={nextLabel} onPress={onNext} disabled={nextDisabled} loading={loading} />
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 12 },
  row: { flexDirection: 'row', gap: 12 },
})
