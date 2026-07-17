import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/Button'
import { colors } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useBooking } from '@/context/BookingContext'
import { createRazorpayOrder, createBooking } from '@/lib/api'
import type { RazorpayOrder } from '@/shared/booking-types'
import { RAZORPAY_KEY_ID } from '@/lib/config'
import { formatCurrency } from '@/shared/format'

// NOTE: this screen is not part of the primary booking flow. The real
// website never collects payment at booking time — pricing/payment happens
// later when the Bagdrop team sends a quote (see app/booking/review.tsx,
// which now submits the booking directly with no pricing shown and no
// payment step). This screen is kept as ready-made infrastructure for a
// future "pay an outstanding quote" feature, reachable from My Bookings,
// once that flow is needed — not currently linked from anywhere.
//
// Reuses the same checkout as the website: Razorpay's own hosted Checkout.js,
// loaded here inside a WebView and driven by an order created through the
// existing /api/orders endpoint. No native payment SDK / separate payment
// code path — this is the same integration the website uses.
function checkoutHtml(order: RazorpayOrder, name: string, email: string, phone: string) {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;background:#FAFAF8;font-family:-apple-system,sans-serif;">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  function post(payload) { window.ReactNativeWebView.postMessage(JSON.stringify(payload)) }
  var options = {
    key: '${RAZORPAY_KEY_ID}',
    amount: '${order.amount}',
    currency: '${order.currency}',
    order_id: '${order.id}',
    name: 'Bagdrop',
    description: 'Baggage delivery booking',
    prefill: { name: '${name.replace(/'/g, '')}', email: '${email.replace(/'/g, '')}', contact: '${phone.replace(/'/g, '')}' },
    theme: { color: '#FF6300' },
    handler: function (response) {
      post({ type: 'success', response: response })
    },
    modal: {
      ondismiss: function () { post({ type: 'dismiss' }) }
    }
  }
  try {
    var rzp = new Razorpay(options)
    rzp.on('payment.failed', function (resp) { post({ type: 'failed', error: resp.error }) })
    rzp.open()
  } catch (e) {
    post({ type: 'error', message: String(e) })
  }
</script>
</body></html>`
}

// react-native-webview doesn't support the web platform — only require it
// on native, so the browser preview (npx expo start --web) doesn't try to
// bundle/run native-only code for this screen.
const isWeb = Platform.OS === 'web'
const WebView = isWeb ? null : (require('react-native-webview').WebView as typeof import('react-native-webview').WebView)

export default function Payment() {
  const { state, pricing, reset } = useBooking()
  const [order, setOrder] = useState<RazorpayOrder | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isWeb) return
    createRazorpayOrder(pricing.total, { service: state.serviceId ?? '', route: `${state.fromCity}-${state.toCity}` })
      .then(setOrder)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not start payment.'))
  }, [])

  const handleMessage = useCallback(
    async (raw: string) => {
      let msg: { type: string; response?: any; error?: any; message?: string }
      try { msg = JSON.parse(raw) } catch { return }

      if (msg.type === 'success') {
        setSubmitting(true)
        try {
          const result = await createBooking(state, pricing)
          reset()
          router.replace({ pathname: '/booking/confirmation', params: { trackingId: result.trackingId } })
        } catch (e) {
          setError(
            'Payment succeeded but we could not save your booking automatically. ' +
            'Please contact support with payment ID ' + (msg.response?.razorpay_payment_id ?? '') +
            ' — ' + (e instanceof Error ? e.message : 'unknown error')
          )
        } finally {
          setSubmitting(false)
        }
      } else if (msg.type === 'dismiss') {
        router.back()
      } else if (msg.type === 'failed' || msg.type === 'error') {
        setError(msg.error?.description ?? msg.message ?? 'Payment failed. Please try again.')
      }
    },
    [state, pricing]
  )

  if (isWeb) {
    return (
      <Screen>
        <Text style={styles.heading}>Payment preview unavailable in browser</Text>
        <Text style={styles.sub}>
          The in-app Razorpay checkout uses a native WebView, which only works in the mobile app —
          on your phone via Expo Go, or in a dev/production build. Everything up to this screen
          (booking flow, pricing, review) works the same in this browser preview.
        </Text>
        <Button label="Back to review" onPress={() => router.back()} variant="outline" />
      </Screen>
    )
  }

  if (RAZORPAY_KEY_ID.includes('YOUR_RAZORPAY') || !RAZORPAY_KEY_ID) {
    return (
      <Screen>
        <Text style={styles.heading}>Payment not configured</Text>
        <Text style={styles.sub}>
          Add your live Razorpay Key ID to app.json → expo.extra.razorpayKeyId (same value as
          NEXT_PUBLIC_RAZORPAY_KEY_ID on the website) to enable checkout.
        </Text>
        <Button label="Back" onPress={() => router.back()} variant="outline" />
      </Screen>
    )
  }

  if (error) {
    return (
      <Screen>
        <Text style={styles.heading}>Something went wrong</Text>
        <Text style={styles.sub}>{error}</Text>
        <Button label="Back to review" onPress={() => router.back()} variant="outline" />
      </Screen>
    )
  }

  if (!order || submitting) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.loadingText}>{submitting ? 'Confirming your booking…' : `Preparing checkout for ${formatCurrency(pricing.total)}…`}</Text>
      </View>
    )
  }

  // Safe: the isWeb branch above already returned, so WebView is non-null here (native only).
  const NativeWebView = WebView!
  return (
    <NativeWebView
      originWhitelist={['*']}
      source={{ html: checkoutHtml(order, state.name, state.email, state.countryCode + state.phone) }}
      onMessage={e => handleMessage(e.nativeEvent.data)}
      style={{ flex: 1 }}
    />
  )
}

const styles = StyleSheet.create({
  heading: { ...type.displaySm, color: colors.textPrimary, marginTop: 24, marginBottom: 8 },
  sub: { ...type.body, color: colors.textMuted, marginBottom: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream, gap: 12 },
  loadingText: { ...type.body, color: colors.textMuted },
})
