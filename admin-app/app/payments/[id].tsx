import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Linking, Image } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { Button } from '@/components/Button'
import { BackHeader } from '@/components/BackHeader'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchPayment, updatePayment, uploadPaymentAttachment, PaymentDetailResult } from '@/lib/api'
import { paymentStatusMeta, PAYMENT_METHOD_LABELS } from '@/shared/statuses'
import { rupees } from '@/shared/quotes'
import { formatDateTime, formatCustomerName } from '@/shared/format'

// Mirrors app/(admin)/admin/payments/page.tsx's PaymentReceiptPanel, plus
// the Payment Proof & Verification approve/reject actions from
// app/(admin)/admin/quotes/view/[lead_id]/page.tsx (both write to the same
// `payments` row via the same PATCH /api/admin/payments/[id] endpoint).
export default function PaymentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { adminKey, role } = useAdminAuth()
  const [detail, setDetail] = useState<PaymentDetailResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState(false)

  const [showRefund, setShowRefund] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')

  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    if (!adminKey || !id) return
    setError('')
    try {
      const res = await fetchPayment(adminKey, id)
      setDetail(res)
      setRefundAmount(String(res.payment.amount))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this payment.')
    } finally {
      setLoading(false)
    }
  }, [adminKey, id])

  useEffect(() => { load() }, [load])

  async function act(patch: Parameters<typeof updatePayment>[2], successMsg: string) {
    if (!adminKey || !id) return
    setActing(true); setError(''); setMsg('')
    try {
      await updatePayment(adminKey, id, patch)
      setMsg(successMsg)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update this payment.')
    } finally {
      setActing(false)
    }
  }

  async function submitRefund() {
    if (!refundReason.trim()) { setError('Enter a refund reason.'); return }
    await act(
      { payment_status: 'refunded', refund_amount: Number(refundAmount) || undefined, refund_reason: refundReason.trim() },
      '✅ Payment refunded.'
    )
    setShowRefund(false)
  }

  async function pickAndUpload(source: 'camera' | 'library' | 'document') {
    if (!adminKey || !id) return
    setError(''); setMsg('')
    try {
      let file: { uri: string; name: string; type: string } | null = null

      if (source === 'document') {
        const res = await DocumentPicker.getDocumentAsync({
          type: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
          copyToCacheDirectory: true,
        })
        if (res.canceled || !res.assets?.[0]) return
        const asset = res.assets[0]
        file = { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' }
      } else {
        const perm = source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!perm.granted) { setError('Permission denied — enable camera/photo access in Settings.'); return }

        const res = source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ImagePicker.MediaTypeOptions.Images })
        if (res.canceled || !res.assets?.[0]) return
        const asset = res.assets[0]
        const name = asset.fileName ?? `photo-${Date.now()}.jpg`
        file = { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' }
      }

      if (!file) return
      setUploading(true)
      await uploadPaymentAttachment(adminKey, id, file)
      setMsg('✅ Attachment uploaded.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return <Screen><BackHeader /><ActivityIndicator color={colors.brand} /></Screen>
  }
  if (!detail) {
    return <Screen><BackHeader /><Text style={styles.errorText}>{error || 'Payment not found.'}</Text></Screen>
  }

  const { payment, invoice, unused_amount } = detail
  const meta = paymentStatusMeta(payment.payment_status)

  return (
    <Screen>
      <BackHeader />
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.paymentId}>{payment.payment_id}</Text>
          <Text style={styles.title}>{formatCustomerName(payment.title, payment.customer_name) || payment.customer_name}</Text>
          <Text style={styles.sub}>{payment.customer_phone}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <Card style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Payment Details</Text>
        <View style={styles.kv}><Text style={styles.k}>Amount</Text><Text style={[styles.v, { fontWeight: '800', color: colors.brand, fontSize: 16 }]}>{rupees(payment.amount)}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Mode</Text><Text style={styles.v}>{PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}</Text></View>
        {payment.payment_reference ? <View style={styles.kv}><Text style={styles.k}>Reference</Text><Text style={styles.v}>{payment.payment_reference}</Text></View> : null}
        <View style={styles.kv}><Text style={styles.k}>Date</Text><Text style={styles.v}>{formatDateTime(payment.payment_date ?? payment.created_at)}</Text></View>
        {payment.bank_charges ? <View style={styles.kv}><Text style={styles.k}>Bank Charges</Text><Text style={styles.v}>{rupees(payment.bank_charges)}</Text></View> : null}
        {payment.tds_deducted ? <View style={styles.kv}><Text style={styles.k}>TDS Deducted</Text><Text style={styles.v}>{rupees(payment.tds_amount ?? 0)}</Text></View> : null}
        {payment.verified_by ? <View style={styles.kv}><Text style={styles.k}>Verified By</Text><Text style={styles.v}>{payment.verified_by}</Text></View> : null}
      </Card>

      {invoice ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Applied Invoice</Text>
          <View style={styles.kv}><Text style={styles.k}>Invoice#</Text><Text style={styles.v}>{invoice.invoice_number}</Text></View>
          <View style={styles.kv}><Text style={styles.k}>Invoice Total</Text><Text style={styles.v}>{rupees(invoice.total_amount)}</Text></View>
          <View style={styles.kv}><Text style={styles.k}>Unused Amount</Text><Text style={[styles.v, unused_amount > 0 && { color: '#d97706', fontWeight: '700' }]}>{rupees(unused_amount)}</Text></View>
        </Card>
      ) : (
        <Card style={{ marginBottom: 12, backgroundColor: colors.warningBg, borderColor: '#fde68a' }}>
          <Text style={styles.sectionTitle}>No Invoice Applied</Text>
          <Text style={styles.notesText}>This entire payment ({rupees(unused_amount)}) is unused — no invoice has been generated for this booking yet.</Text>
        </Card>
      )}

      {payment.proof_url ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Payment Proof</Text>
          {payment.proof_type === 'pdf' ? (
            <Pressable onPress={() => Linking.openURL(payment.proof_url!)} style={styles.fileRow}>
              <Ionicons name="document-text" size={18} color={colors.brand} />
              <Text style={styles.fileRowText}>View PDF Receipt</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => Linking.openURL(payment.proof_url!)}>
              <Image source={{ uri: payment.proof_url }} style={styles.proofImage} resizeMode="cover" />
            </Pressable>
          )}
        </Card>
      ) : null}

      <Card style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Attachments</Text>
        </View>
        {(payment.attachments ?? []).length === 0 ? (
          <Text style={styles.notesText}>No attachments yet.</Text>
        ) : (
          (payment.attachments ?? []).map((a, i) => (
            <Pressable key={i} onPress={() => Linking.openURL(a.url)} style={styles.fileRow}>
              <Ionicons name="attach" size={16} color={colors.textMuted} />
              <Text style={styles.fileRowText} numberOfLines={1}>{a.filename}</Text>
            </Pressable>
          ))
        )}
        <View style={styles.uploadRow}>
          <Pressable style={styles.uploadBtn} onPress={() => pickAndUpload('camera')} disabled={uploading}>
            <Ionicons name="camera" size={16} color={colors.brand} />
            <Text style={styles.uploadBtnText}>Camera</Text>
          </Pressable>
          <Pressable style={styles.uploadBtn} onPress={() => pickAndUpload('library')} disabled={uploading}>
            <Ionicons name="image" size={16} color={colors.brand} />
            <Text style={styles.uploadBtnText}>Gallery</Text>
          </Pressable>
          <Pressable style={styles.uploadBtn} onPress={() => pickAndUpload('document')} disabled={uploading}>
            <Ionicons name="folder" size={16} color={colors.brand} />
            <Text style={styles.uploadBtnText}>File</Text>
          </Pressable>
        </View>
        {uploading ? <Text style={styles.notesText}>Uploading…</Text> : null}
      </Card>

      {payment.notes ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{payment.notes}</Text>
        </Card>
      ) : null}

      {!payment.is_synthetic && (
        <Card style={{ marginBottom: 24 }}>
          <Text style={styles.sectionTitle}>Actions</Text>

          {payment.payment_status === 'pending' && (
            <Button label="Mark as Paid" onPress={() => act({ payment_status: 'paid' }, '✅ Marked as paid.')} loading={acting} style={{ marginBottom: 10 }} />
          )}

          {payment.payment_status === 'pending_verification' && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <Button label="Approve" onPress={() => act({ payment_status: 'paid' }, '✅ Payment approved.')} loading={acting} style={{ flex: 1 }} />
              <Button label="Reject" variant="outline" onPress={() => act({ payment_status: 'rejected' }, 'Payment rejected.')} loading={acting} style={{ flex: 1 }} />
            </View>
          )}

          {payment.payment_status === 'paid' && role === 'admin' && !showRefund && (
            <Button label="Issue Refund" variant="outline" onPress={() => setShowRefund(true)} />
          )}

          {showRefund && (
            <View>
              <TextField label="Refund Amount" value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" />
              <TextField label="Refund Reason" value={refundReason} onChangeText={setRefundReason} placeholder="Why is this being refunded?" multiline />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Confirm Refund" onPress={submitRefund} loading={acting} style={{ flex: 1 }} />
                <Button label="Cancel" variant="ghost" onPress={() => setShowRefund(false)} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </Card>
      )}

      {msg ? <Text style={styles.successText}>{msg}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  paymentId: { ...type.caption, color: colors.brand, fontWeight: '700', marginBottom: 2 },
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
  successText: { ...type.small, color: colors.success, textAlign: 'center', marginVertical: 8 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  fileRowText: { ...type.small, color: colors.textPrimary, flexShrink: 1 },
  proofImage: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.border },
  uploadRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  uploadBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10,
  },
  uploadBtnText: { ...type.smallBold, color: colors.brand },
})
