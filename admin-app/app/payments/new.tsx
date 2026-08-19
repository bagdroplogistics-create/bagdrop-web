import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { DateField } from '@/components/DateField'
import { Button } from '@/components/Button'
import { BackHeader } from '@/components/BackHeader'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import { fetchAdminBookings, createPayment, uploadPaymentAttachment, AdminBooking } from '@/lib/api'
import { rupees } from '@/shared/quotes'
import { formatCustomerName } from '@/shared/format'

const METHOD_OPTIONS = [
  { value: 'upi', label: 'UPI' },
  { value: 'qr', label: 'QR Code' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
]

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
]

interface StagedFile { uri: string; name: string; type: string }

// Mirrors app/(admin)/admin/payments/page.tsx's RecordPaymentModal — same
// POST /api/admin/payments, same "stage attachments locally, upload after
// the payment row is created" flow the website uses. Simplified from the
// website's Customer/Invoice-tab picker down to a single Booking search
// (covers the common case — logging a payment against a specific booking);
// customer_name/phone can still be typed by hand for a payment with no
// booking behind it.
export default function RecordPayment() {
  const params = useLocalSearchParams<{ booking_id?: string; customer_name?: string; customer_phone?: string; amount?: string }>()
  const { adminKey } = useAdminAuth()

  const [bookingId, setBookingId] = useState(params.booking_id ?? '')
  const [customerName, setCustomerName] = useState(params.customer_name ?? '')
  const [customerPhone, setCustomerPhone] = useState(params.customer_phone ?? '')
  const [amount, setAmount] = useState(params.amount ?? '')
  const [method, setMethod] = useState('upi')
  const [status, setStatus] = useState('pending')
  const [reference, setReference] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [bankCharges, setBankCharges] = useState('')
  const [tdsDeducted, setTdsDeducted] = useState(false)
  const [tdsAmount, setTdsAmount] = useState('')
  const [notes, setNotes] = useState('')

  const [bookingQuery, setBookingQuery] = useState('')
  const [bookingResults, setBookingResults] = useState<AdminBooking[]>([])
  const [showBookingResults, setShowBookingResults] = useState(false)

  const [files, setFiles] = useState<StagedFile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const searchBookings = useCallback(async (q: string) => {
    if (!adminKey || q.trim().length < 2) { setBookingResults([]); return }
    try {
      const res = await fetchAdminBookings(adminKey, { search: q.trim(), limit: 15 })
      setBookingResults(res.bookings)
    } catch { setBookingResults([]) }
  }, [adminKey])

  useEffect(() => {
    const t = setTimeout(() => searchBookings(bookingQuery), 300)
    return () => clearTimeout(t)
  }, [bookingQuery, searchBookings])

  function selectBooking(b: AdminBooking) {
    setBookingId(b.id)
    setCustomerName(formatCustomerName(b.title, b.customer_name) || b.customer_name)
    setCustomerPhone(b.customer_phone ?? '')
    if (!amount) setAmount(String(b.total_amount ?? ''))
    setBookingQuery(''); setBookingResults([]); setShowBookingResults(false)
  }

  async function pickFile(source: 'camera' | 'library' | 'document') {
    setError('')
    try {
      if (source === 'document') {
        const res = await DocumentPicker.getDocumentAsync({
          type: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
          copyToCacheDirectory: true,
        })
        if (res.canceled || !res.assets?.[0]) return
        const asset = res.assets[0]
        setFiles(f => [...f, { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' }])
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
        setFiles(f => [...f, { uri: asset.uri, name: asset.fileName ?? `photo-${Date.now()}.jpg`, type: asset.mimeType ?? 'image/jpeg' }])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not attach file.')
    }
  }

  function removeFile(idx: number) { setFiles(f => f.filter((_, i) => i !== idx)) }

  async function save() {
    if (!adminKey) return
    if (!customerName.trim()) { setError('Enter or select a customer.'); return }
    if (!amount || Number(amount) <= 0) { setError('Enter a valid amount.'); return }

    setSaving(true); setError('')
    try {
      const { payment } = await createPayment(adminKey, {
        booking_id: bookingId || undefined,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        amount: Number(amount),
        payment_method: method,
        payment_status: status,
        payment_reference: reference.trim() || undefined,
        payment_date: paymentDate || undefined,
        notes: notes.trim() || undefined,
        bank_charges: bankCharges ? Number(bankCharges) : undefined,
        tds_deducted: tdsDeducted,
        tds_amount: tdsDeducted && tdsAmount ? Number(tdsAmount) : undefined,
      })

      for (const f of files) {
        try { await uploadPaymentAttachment(adminKey, payment.id, f) }
        catch (e) { console.warn('[RecordPayment] attachment upload failed (non-fatal):', e) }
      }

      router.replace(`/payments/${payment.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <BackHeader />
      <Text style={styles.title}>Record Payment</Text>

      <Card style={{ marginBottom: 14 }}>
        <Text style={styles.sectionTitle}>Customer</Text>
        <TextField
          label="Search Booking (optional)"
          placeholder="Name, phone, or tracking ID"
          value={bookingQuery}
          onChangeText={t => { setBookingQuery(t); setShowBookingResults(true) }}
          onFocus={() => setShowBookingResults(true)}
        />
        {showBookingResults && bookingResults.length > 0 && (
          <View style={styles.resultsBox}>
            <FlatList
              data={bookingResults}
              keyExtractor={b => b.id}
              style={{ maxHeight: 220 }}
              renderItem={({ item }) => (
                <Pressable style={styles.resultRow} onPress={() => selectBooking(item)}>
                  <Text style={styles.resultName}>{formatCustomerName(item.title, item.customer_name) || item.customer_name}</Text>
                  <Text style={styles.resultMeta}>{item.tracking_id} · {item.customer_phone}</Text>
                </Pressable>
              )}
            />
          </View>
        )}
        {bookingId ? (
          <View style={styles.linkedBadge}>
            <Ionicons name="link" size={14} color={colors.brand} />
            <Text style={styles.linkedBadgeText}>Linked to booking</Text>
            <Pressable onPress={() => setBookingId('')}><Text style={styles.linkedBadgeClear}>Clear</Text></Pressable>
          </View>
        ) : null}
        <TextField label="Customer Name" value={customerName} onChangeText={setCustomerName} placeholder="Customer name" />
        <TextField label="Customer Phone" value={customerPhone} onChangeText={setCustomerPhone} placeholder="9876543210" keyboardType="phone-pad" />
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <TextField label="Amount *" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" />
        <SelectField label="Payment Mode" value={method} options={METHOD_OPTIONS} onChange={setMethod} />
        <SelectField label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <TextField label="Reference / UTR" value={reference} onChangeText={setReference} placeholder="Transaction ID" />
        <DateField label="Payment Date" value={paymentDate} onChange={setPaymentDate} />
        <TextField label="Bank Charges (optional)" value={bankCharges} onChangeText={setBankCharges} placeholder="0" keyboardType="decimal-pad" />
        <Pressable style={styles.checkboxRow} onPress={() => setTdsDeducted(v => !v)}>
          <Ionicons name={tdsDeducted ? 'checkbox' : 'square-outline'} size={20} color={tdsDeducted ? colors.brand : colors.neutralMid} />
          <Text style={styles.checkboxLabel}>Tax (TDS) deducted</Text>
        </Pressable>
        {tdsDeducted ? (
          <TextField label="TDS Amount" value={tdsAmount} onChangeText={setTdsAmount} placeholder="0" keyboardType="decimal-pad" />
        ) : null}
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Internal notes" multiline />
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <Text style={styles.sectionTitle}>Attachments</Text>
        {files.map((f, i) => (
          <View key={i} style={styles.fileRow}>
            <Ionicons name="attach" size={16} color={colors.textMuted} />
            <Text style={styles.fileRowText} numberOfLines={1}>{f.name}</Text>
            <Pressable onPress={() => removeFile(i)} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.error} />
            </Pressable>
          </View>
        ))}
        <View style={styles.uploadRow}>
          <Pressable style={styles.uploadBtn} onPress={() => pickFile('camera')}>
            <Ionicons name="camera" size={16} color={colors.brand} />
            <Text style={styles.uploadBtnText}>Camera</Text>
          </Pressable>
          <Pressable style={styles.uploadBtn} onPress={() => pickFile('library')}>
            <Ionicons name="image" size={16} color={colors.brand} />
            <Text style={styles.uploadBtnText}>Gallery</Text>
          </Pressable>
          <Pressable style={styles.uploadBtn} onPress={() => pickFile('document')}>
            <Ionicons name="folder" size={16} color={colors.brand} />
            <Text style={styles.uploadBtnText}>File</Text>
          </Pressable>
        </View>
      </Card>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Button label={saving ? 'Saving…' : 'Save Payment'} onPress={save} loading={saving} style={{ marginBottom: 24 }} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.displaySm, color: colors.textPrimary, marginBottom: 16 },
  sectionTitle: { ...type.smallBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  resultsBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: -8, marginBottom: 12, overflow: 'hidden' },
  resultRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultName: { ...type.smallBold, color: colors.textPrimary },
  resultMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  linkedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  linkedBadgeText: { ...type.caption, color: colors.brand, fontWeight: '700', flex: 1 },
  linkedBadgeClear: { ...type.caption, color: colors.textMuted, textDecorationLine: 'underline' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  checkboxLabel: { ...type.body, color: colors.textPrimary },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  fileRowText: { ...type.small, color: colors.textPrimary, flex: 1 },
  uploadRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  uploadBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10,
  },
  uploadBtnText: { ...type.smallBold, color: colors.brand },
  errorText: { ...type.small, color: colors.error, textAlign: 'center', marginVertical: 8 },
})
