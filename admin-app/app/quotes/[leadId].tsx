import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { BackHeader } from '@/components/BackHeader'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { AdminLead, SavedQuoteLineItem, fetchLead } from '@/lib/api'
import { rupees, rupeesDecimal } from '@/shared/quotes'
import { formatDateTime, formatCustomerName } from '@/shared/format'
import { buildQuoteHtml, openQuotePrint } from '@/shared/quotePrint'

const PAYMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  received: { label: 'Payment Received', color: '#15803d', bg: '#dcfce7' },
  pending: { label: 'Payment Pending', color: '#b45309', bg: '#fef3c7' },
}

export default function QuoteDetail() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>()
  const { adminKey } = useAdminAuth()
  const [lead, setLead] = useState<AdminLead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!adminKey || !leadId) return
    setError('')
    try {
      const { lead: l } = await fetchLead(adminKey, leadId)
      setLead(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this quote.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, leadId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <Screen><BackHeader /><ActivityIndicator color={colors.brand} /></Screen>
  }

  if (!lead || !lead.quote_number) {
    return (
      <Screen>
        <BackHeader />
        <Text style={styles.errorText}>{error || 'Quote not found.'}</Text>
      </Screen>
    )
  }

  const items = (lead.quote_line_items as SavedQuoteLineItem[] | null) ?? []
  const subtotal = Number(lead.quote_subtotal ?? 0)
  const discountAmt = Number(lead.quote_discount_amt ?? 0)
  const discountPct = Number(lead.quote_discount_pct ?? 0)
  const tax = Number(lead.quote_tax ?? 0)
  const total = Number(lead.quote_total ?? 0)
  const meta = PAYMENT_META[(lead.payment_status as string) ?? 'pending'] ?? PAYMENT_META.pending
  const hasReturnQuote = !!lead.return_quote_number

  function handleDownload() {
    if (!lead) return
    const quoteDate = lead.quote_date
      ? new Date(lead.quote_date as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined
    const html = buildQuoteHtml({
      quoteNumber: lead.quote_number as string,
      leadNumber: lead.lead_number,
      quoteDate,
      customerName: formatCustomerName(lead.title, lead.name) || lead.name,
      customerPhone: lead.phone,
      customerEmail: lead.email ?? undefined,
      fromCity: (lead.from_city as string) || '',
      toCity: (lead.to_city as string) || '',
      bagsCount: Number(lead.bags_count ?? 1),
      pickupDate: (lead.pickup_date as string) || undefined,
      pickupTime: (lead.pickup_time as string ?? '').slice(0, 5) || undefined,
      deliveryDate: (lead.delivery_date as string) || undefined,
      flightNumber: (lead.flight_number as string) || undefined,
      pnr: (lead.pnr as string) || undefined,
      pickupAddress: (lead.pickup_address as string) || undefined,
      dropAddress: (lead.drop_address as string) || undefined,
      items: items.map(it => ({
        name: it.name, description: it.description, quantity: it.quantity, rate: it.rate,
        taxPct: it.tax_pct, amount: it.amount ?? it.quantity * it.rate,
      })),
      subtotal, discountAmt, discountPct, tax, total,
      notes: (lead.quote_notes as string) || undefined,
      terms: (lead.quote_terms as string) || undefined,
      salesperson: (lead.salesperson_name as string) || undefined,
      agentName: (lead.agent_name as string) || undefined,
      expiryDate: (lead.quote_expiry_date as string) || undefined,
    })
    const opened = openQuotePrint(html)
    if (!opened) setError('Download is available from the web version of the admin app for now.')
  }

  return (
    <Screen>
      <BackHeader />
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.quoteNo}>{lead.quote_number as string}</Text>
          <Text style={styles.title}>{formatCustomerName(lead.title, lead.name) || lead.name}</Text>
          <Text style={styles.sub}>{lead.lead_number} · Created {lead.quote_date ? formatDateTime(lead.quote_date as string) : '—'}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Route & Schedule</Text>
        <View style={styles.kv}><Text style={styles.k}>Route</Text><Text style={styles.v}>{(lead.from_city as string) || '—'} → {(lead.to_city as string) || '—'}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Bags</Text><Text style={styles.v}>{lead.bags_count ?? 1}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Pickup</Text><Text style={styles.v}>{(lead.pickup_date as string) || '—'} {(lead.pickup_time as string ?? '').slice(0, 5)}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Delivery</Text><Text style={styles.v}>{(lead.delivery_date as string) || '—'}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Pickup Address</Text><Text style={styles.v}>{(lead.pickup_address as string) || '—'}</Text></View>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Items</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No line items saved.</Text>
        ) : items.map((it, idx) => (
          <View key={idx} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{it.name}</Text>
              {it.description ? <Text style={styles.itemDesc}>{it.description}</Text> : null}
              <Text style={styles.itemDesc}>{it.quantity} × {rupees(it.rate)}</Text>
            </View>
            <Text style={styles.itemAmt}>{rupees(it.amount ?? it.quantity * it.rate)}</Text>
          </View>
        ))}

        <View style={[styles.kv, { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }]}>
          <Text style={styles.k}>Subtotal</Text><Text style={styles.v}>{rupeesDecimal(subtotal)}</Text>
        </View>
        {discountAmt > 0 ? (
          <View style={styles.kv}>
            <Text style={styles.k}>Discount{discountPct > 0 ? ` (${discountPct}%)` : ''}</Text>
            <Text style={[styles.v, { color: colors.error }]}>−{rupeesDecimal(discountAmt)}</Text>
          </View>
        ) : null}
        <View style={styles.kv}><Text style={styles.k}>GST 5%</Text><Text style={styles.v}>{rupeesDecimal(tax)}</Text></View>
        <View style={[styles.kv, { marginTop: 4 }]}>
          <Text style={[styles.k, { fontWeight: '700', color: colors.textPrimary }]}>Total</Text>
          <Text style={[styles.v, { fontWeight: '800', color: colors.brand, fontSize: 17 }]}>{rupeesDecimal(total)}</Text>
        </View>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Quote Details</Text>
        {lead.quote_subject ? <View style={styles.kv}><Text style={styles.k}>Subject</Text><Text style={styles.v}>{lead.quote_subject as string}</Text></View> : null}
        {lead.salesperson_name ? <View style={styles.kv}><Text style={styles.k}>Salesperson</Text><Text style={styles.v}>{lead.salesperson_name as string}</Text></View> : null}
        {lead.agent_name ? <View style={styles.kv}><Text style={styles.k}>Agent / Reference</Text><Text style={styles.v}>{lead.agent_name as string}</Text></View> : null}
        {lead.quote_expiry_date ? <View style={styles.kv}><Text style={styles.k}>Expiry</Text><Text style={styles.v}>{lead.quote_expiry_date as string}</Text></View> : null}
        {lead.quote_notes ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.k}>Notes</Text>
            <Text style={[styles.v, { marginTop: 2 }]}>{lead.quote_notes as string}</Text>
          </View>
        ) : null}
      </Card>

      {hasReturnQuote ? (
        <Card style={{ marginBottom: 12, backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: '#92400e' }]}>Return Quote</Text>
              <Text style={styles.v}>{lead.return_quote_number as string}</Text>
            </View>
            <Text style={{ ...type.bodyBold, color: '#92400e' }}>{rupees(Number(lead.return_quote_total ?? 0))}</Text>
          </View>
        </Card>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={{ marginTop: 8, marginBottom: 24 }}>
        <Button label="Edit Quote" onPress={() => router.push(`/quotes/new?leadId=${lead.id}&edit=true`)} />
        <View style={{ height: 10 }} />
        <Button label="Download Quote (PDF)" variant="outline" onPress={handleDownload} />
        <View style={{ height: 10 }} />
        <Button label="Generate Return Quote" variant="outline" onPress={() => router.push(`/quotes/new?leadId=${lead.id}`)} />
        <View style={{ height: 10 }} />
        <Button label="View Inquiry" variant="ghost" onPress={() => router.push(`/leads/${lead.id}`)} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  quoteNo: { ...type.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  title: { ...type.displaySm, color: colors.textPrimary },
  sub: { ...type.small, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { ...type.smallBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  k: { ...type.small, color: colors.textMuted, flex: 1 },
  v: { ...type.smallBold, color: colors.textPrimary, flex: 1, textAlign: 'right' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { ...type.smallBold, color: colors.textPrimary },
  itemDesc: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  itemAmt: { ...type.smallBold, color: colors.textPrimary, marginLeft: 8 },
  emptyText: { ...type.small, color: colors.textMuted },
  badge: { borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { ...type.caption, fontWeight: '700' },
  errorText: { ...type.small, color: colors.error, textAlign: 'center', marginVertical: 8 },
})
