import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { BackHeader } from '@/components/BackHeader'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchInvoice, generateInvoiceForBooking, invoicePdfUrl, fetchAdminBooking, AdminInvoice, AdminBooking } from '@/lib/api'
import { paymentStatusMeta } from '@/shared/statuses'
import { rupees } from '@/shared/quotes'
import { formatDateTime, formatCustomerName } from '@/shared/format'

// Handles both a real invoice id and a synthetic `pending-<bookingId>` id
// (the "completed booking, no invoice generated yet" placeholder rows from
// GET /api/admin/invoices — see admin-app/app/(admin)/invoices.tsx). Real
// invoices render the full receipt; placeholder ids show a lightweight
// "Generate Invoice" screen instead, backed by the exact same
// POST /api/admin/invoices booking-derived branch the website's own
// "Generate Invoice" button uses.
export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { adminKey } = useAdminAuth()
  const isPlaceholder = (id ?? '').startsWith('pending-')
  const bookingId = isPlaceholder ? (id ?? '').replace('pending-', '') : null

  const [invoice, setInvoice] = useState<AdminInvoice | null>(null)
  const [booking, setBooking] = useState<AdminBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    if (!adminKey || !id) return
    setError('')
    try {
      if (isPlaceholder && bookingId) {
        const { booking: b } = await fetchAdminBooking(adminKey, bookingId)
        setBooking(b)
      } else {
        const { invoice: inv } = await fetchInvoice(adminKey, id)
        setInvoice(inv)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this invoice.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, id, isPlaceholder, bookingId])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    if (!adminKey || !bookingId) return
    setGenerating(true); setError('')
    try {
      const { invoice: inv } = await generateInvoiceForBooking(adminKey, bookingId)
      router.replace(`/invoices/${inv.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate invoice.')
      setGenerating(false)
    }
  }

  async function handleDownload() {
    if (!adminKey || !invoice) return
    setDownloading(true); setError('')
    try {
      const filename = `${invoice.invoice_number ?? 'invoice'}.pdf`
      const localUri = FileSystem.documentDirectory + filename
      const res = await FileSystem.downloadAsync(invoicePdfUrl(invoice.id), localUri, {
        headers: { 'x-admin-key': adminKey },
      })
      if (res.status !== 200) throw new Error(`Download failed (${res.status})`)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: 'application/pdf', dialogTitle: filename })
      } else {
        setError(`Saved to ${res.uri} — sharing isn't available on this device.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download the PDF.')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return <Screen><BackHeader /><ActivityIndicator color={colors.brand} /></Screen>
  }

  // ── Placeholder: booking completed, no invoice yet ──────────────────
  if (isPlaceholder) {
    if (!booking) return <Screen><BackHeader /><Text style={styles.errorText}>{error || 'Booking not found.'}</Text></Screen>
    return (
      <Screen>
        <BackHeader />
        <Text style={styles.title}>{formatCustomerName(booking.title, booking.customer_name) || booking.customer_name}</Text>
        <Text style={styles.sub}>{booking.tracking_id}</Text>

        <Card style={{ marginTop: 16, marginBottom: 16 }}>
          <View style={styles.kv}><Text style={styles.k}>Route</Text><Text style={styles.v}>{booking.from_city || '—'} → {booking.to_city || '—'}</Text></View>
          <View style={styles.kv}><Text style={styles.k}>Amount</Text><Text style={[styles.v, { fontWeight: '800', color: colors.brand, fontSize: 16 }]}>{rupees(Number(booking.total_amount ?? 0))}</Text></View>
        </Card>

        <Card style={{ marginBottom: 16, backgroundColor: colors.errorBg, borderColor: '#fecaca' }}>
          <Text style={[styles.sectionTitle, { color: '#991b1b' }]}>No Invoice Generated Yet</Text>
          <Text style={styles.notesText}>This booking is completed but no invoice has been created for it.</Text>
        </Card>

        <Button label="Generate Invoice" onPress={handleGenerate} loading={generating} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Screen>
    )
  }

  // ── Real invoice ──────────────────────────────────────────────────
  if (!invoice) return <Screen><BackHeader /><Text style={styles.errorText}>{error || 'Invoice not found.'}</Text></Screen>

  const meta = paymentStatusMeta(invoice.payment_status)
  const balanceDue = invoice.payment_status === 'paid' ? 0 : Number(invoice.total_amount)
  const lineItems = invoice.line_items ?? []

  return (
    <Screen>
      <BackHeader />
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.invoiceNo}>{invoice.invoice_number}</Text>
          <Text style={styles.title}>{formatCustomerName(invoice.title, invoice.customer_name) || invoice.customer_name}</Text>
          <Text style={styles.sub}>{formatDateTime(invoice.invoice_date)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Route & Booking</Text>
        <View style={styles.kv}><Text style={styles.k}>Route</Text><Text style={styles.v}>{invoice.from_city || '—'} → {invoice.to_city || '—'}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Bags</Text><Text style={styles.v}>{invoice.total_bags ?? '—'}</Text></View>
        {invoice.consignment_no ? <View style={styles.kv}><Text style={styles.k}>Consignment No</Text><Text style={styles.v}>{invoice.consignment_no}</Text></View> : null}
        {invoice.due_date ? <View style={styles.kv}><Text style={styles.k}>Due Date</Text><Text style={styles.v}>{invoice.due_date}</Text></View> : null}
      </Card>

      {lineItems.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Items</Text>
          {lineItems.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it.name}</Text>
                <Text style={styles.itemMeta}>{it.quantity} × {rupees(it.rate)}</Text>
              </View>
              <Text style={styles.itemAmount}>{rupees(it.amount)}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Totals</Text>
        <View style={styles.kv}><Text style={styles.k}>Subtotal</Text><Text style={styles.v}>{rupees(invoice.base_amount)}</Text></View>
        {invoice.cgst > 0 ? <View style={styles.kv}><Text style={styles.k}>CGST</Text><Text style={styles.v}>{rupees(invoice.cgst)}</Text></View> : null}
        {invoice.sgst > 0 ? <View style={styles.kv}><Text style={styles.k}>SGST</Text><Text style={styles.v}>{rupees(invoice.sgst)}</Text></View> : null}
        {(invoice.igst ?? 0) > 0 ? <View style={styles.kv}><Text style={styles.k}>IGST</Text><Text style={styles.v}>{rupees(invoice.igst ?? 0)}</Text></View> : null}
        <View style={[styles.kv, { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }]}>
          <Text style={[styles.k, { ...type.smallBold, color: colors.textPrimary }]}>Total</Text>
          <Text style={[styles.v, { fontWeight: '800', color: colors.brand, fontSize: 16 }]}>{rupees(invoice.total_amount)}</Text>
        </View>
        <View style={styles.kv}><Text style={styles.k}>Balance Due</Text><Text style={[styles.v, balanceDue > 0 && { color: '#d97706', fontWeight: '700' }]}>{rupees(balanceDue)}</Text></View>
      </Card>

      {invoice.notes ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{invoice.notes}</Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <Button
          label={downloading ? 'Preparing…' : 'Download / Share PDF'}
          onPress={handleDownload}
          loading={downloading}
          style={{ flex: 1 }}
        />
      </View>

      {balanceDue > 0 && (
        <Pressable
          style={styles.recordPaymentBtn}
          onPress={() => router.push({
            pathname: '/payments/new',
            params: {
              booking_id: invoice.booking_id ?? '',
              customer_name: formatCustomerName(invoice.title, invoice.customer_name) || invoice.customer_name,
              customer_phone: invoice.customer_phone ?? '',
              amount: String(balanceDue),
            },
          })}
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.brand} />
          <Text style={styles.recordPaymentBtnText}>Record Payment</Text>
        </Pressable>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  invoiceNo: { ...type.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  title: { ...type.displaySm, color: colors.textPrimary },
  sub: { ...type.small, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { ...type.smallBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  k: { ...type.small, color: colors.textMuted, flex: 1 },
  v: { ...type.smallBold, color: colors.textPrimary, flex: 1, textAlign: 'right' },
  notesText: { ...type.small, color: colors.textPrimary },
  badge: { borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { ...type.caption, fontWeight: '700' },
  errorText: { ...type.small, color: colors.error, textAlign: 'center', marginVertical: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { ...type.smallBold, color: colors.textPrimary },
  itemMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  itemAmount: { ...type.smallBold, color: colors.textPrimary },
  recordPaymentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 24, paddingVertical: 10 },
  recordPaymentBtnText: { ...type.smallBold, color: colors.brand },
})
