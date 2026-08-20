import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, Switch, ActivityIndicator, Platform } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { PhoneInput } from '@/components/PhoneInput'
import { DateField } from '@/components/DateField'
import { Button } from '@/components/Button'
import { BackHeader } from '@/components/BackHeader'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import { useAdminAuth } from '@/context/AdminAuthContext'
import {
  AdminApiError, AdminLead, GenerateQuoteResult, QuoteLineItemInput, SavedQuoteLineItem,
  calculateRoutePricing, createLead, fetchLead, generateQuote, updateLeadQuote,
} from '@/lib/api'
import { LEAD_SERVICE_TYPES } from '@/shared/leads'
import {
  DEFAULT_CUSTOMER_NOTES, DEFAULT_TERMS, PAYMENT_STATUSES, SAC_CODE, SALESPERSONS, rupees,
} from '@/shared/quotes'
import { PICKUP_LOCATIONS, OTHERS_VALUE, matchLocation, toRouteCityKey } from '@/shared/locations'
import { TIME_OPTIONS, timeLabel } from '@/shared/time-options'
import { buildQuoteHtml, openQuotePrint, downloadQuotePdfNative } from '@/shared/quotePrint'
import { parseStoredPhone, toE164 } from '@/shared/phone-format'
import { DEFAULT_COUNTRY_ISO2 } from '@/shared/phone-countries'
import { TITLE_OPTIONS, DEFAULT_TITLE, formatCustomerName } from '@/shared/format'

let _rowId = 0
const uid = () => `row_${++_rowId}_${Date.now()}`

interface Row {
  id: string; name: string; description: string; qty: string; rate: string
  // Optional flat-amount override — mirrors the website's quote form.
  // Set only on the auto-populated "Upto 2 Bags" route-pricing row so Qty
  // can show the real bag count (1 or 2) without that quantity
  // multiplying the flat "up to 2 bags" price (founder instruction,
  // 2026-08-20). Cleared the moment the admin manually edits that row's
  // Qty/Rate, same as on the web admin panel.
  amount?: number
}

function emptyRow(): Row {
  return { id: uid(), name: '', description: '', qty: '1', rate: '0' }
}

export default function NewQuote() {
  const { leadId: leadIdParam, edit } = useLocalSearchParams<{ leadId?: string; edit?: string }>()
  const isEditMode = edit === 'true'
  const { adminKey } = useAdminAuth()

  const [lead, setLead] = useState<AdminLead | null>(null)
  const [loadingLead, setLoadingLead] = useState(!!leadIdParam)
  const [error, setError] = useState('')

  // Customer (editable only when no lead was passed in)
  const [custTitle, setCustTitle] = useState<string>(DEFAULT_TITLE)
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')       // national digits only
  const [custCountryIso2, setCustCountryIso2] = useState(DEFAULT_COUNTRY_ISO2)
  const [custEmail, setCustEmail] = useState('')
  const [serviceType, setServiceType] = useState<string | null>(null)

  // Route & schedule — location pickers (same 14 locations as the customer
  // booking form) with an "Others" free-text fallback for custom routes.
  const [fromLocationId, setFromLocationId] = useState<string | null>(null)
  const [fromOtherText, setFromOtherText] = useState('')
  const [toLocationId, setToLocationId] = useState<string | null>(null)
  const [toOtherText, setToOtherText] = useState('')
  const [bagsCount, setBagsCount] = useState('1')
  const [pickupDate, setPickupDate] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [pickupAddr, setPickupAddr] = useState('')
  const [dropAddr, setDropAddr] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [pnr, setPnr] = useState('')

  // Quote header
  const [agentName, setAgentName] = useState('')
  const [salesperson, setSalesperson] = useState<string | null>('Vijay Thacker')
  const [expiryDate, setExpiryDate] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<string | null>('pending')

  // Route pricing
  const [priceLoading, setPriceLoading] = useState(false)
  const [routeFound, setRouteFound] = useState<boolean | null>(null)
  const itemsFromPricing = useRef(false)

  // Items
  const [rows, setRows] = useState<Row[]>([emptyRow()])

  // Discount
  const [discountType, setDiscountType] = useState<'pct' | 'fixed'>('pct')
  const [discountPct, setDiscountPct] = useState('0')
  const [discountFixed, setDiscountFixed] = useState('0')

  // Estimate doc
  const [subject, setSubject] = useState('')
  const [custNotes, setCustNotes] = useState(DEFAULT_CUSTOMER_NOTES)
  const [terms, setTerms] = useState(DEFAULT_TERMS)
  const [sendEmail, setSendEmail] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<GenerateQuoteResult & { resolvedLeadId: string } | null>(null)
  const [downloadingQuote, setDownloadingQuote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Derived display labels used everywhere else in the form/payload.
  const fromCity = fromLocationId === OTHERS_VALUE
    ? fromOtherText
    : (PICKUP_LOCATIONS.find(l => l.id === fromLocationId)?.label ?? '')
  const toCity = toLocationId === OTHERS_VALUE
    ? toOtherText
    : (PICKUP_LOCATIONS.find(l => l.id === toLocationId)?.label ?? '')

  const fromLocationOptions = [
    ...PICKUP_LOCATIONS.filter(l => l.id !== toLocationId).map(l => ({ value: l.id, label: l.label })),
    { value: OTHERS_VALUE, label: 'Others (type manually)' },
  ]
  const toLocationOptions = [
    ...PICKUP_LOCATIONS.filter(l => l.id !== fromLocationId).map(l => ({ value: l.id, label: l.label })),
    { value: OTHERS_VALUE, label: 'Others (type manually)' },
  ]

  function handleFromChange(v: string) {
    setFromLocationId(v)
    if (v !== OTHERS_VALUE) setFromOtherText('')
    if (v !== OTHERS_VALUE && v === toLocationId) setToLocationId(null)
  }
  function handleToChange(v: string) {
    setToLocationId(v)
    if (v !== OTHERS_VALUE) setToOtherText('')
    if (v !== OTHERS_VALUE && v === fromLocationId) setFromLocationId(null)
  }
  function swapLocations() {
    const fId = fromLocationId, fText = fromOtherText
    setFromLocationId(toLocationId); setFromOtherText(toOtherText)
    setToLocationId(fId); setToOtherText(fText)
  }

  // ── Load lead if navigated from an inquiry ─────────────────────────
  const loadLead = useCallback(async () => {
    if (!adminKey || !leadIdParam) return
    try {
      const { lead: l } = await fetchLead(adminKey, leadIdParam)
      setLead(l)
      setCustTitle(l.title && TITLE_OPTIONS.includes(l.title as never) ? l.title : DEFAULT_TITLE)
      setCustName(l.name ?? '')
      // Re-parses the stored E.164 string so the correct flag/dial code
      // shows automatically instead of always assuming India.
      const parsedPhone = parseStoredPhone(l.phone)
      setCustPhone(l.phone_national || parsedPhone.nationalNumber)
      setCustCountryIso2(l.phone_country_code || parsedPhone.iso2)
      setCustEmail(l.email ?? '')
      setServiceType(l.service_interest ?? l.service_type ?? null)
      const fromMatch = matchLocation(l.from_city)
      setFromLocationId(fromMatch.id)
      setFromOtherText(fromMatch.otherText)
      const toMatch = matchLocation(l.to_city)
      setToLocationId(toMatch.id)
      setToOtherText(toMatch.otherText)
      setBagsCount(String(l.bags_count ?? 1))
      setPickupDate(l.pickup_date ?? '')
      setPickupTime((l.pickup_time as string ?? '').slice(0, 5))
      setDeliveryDate(l.delivery_date ?? '')
      setPickupAddr(l.pickup_address ?? '')
      setDropAddr(l.drop_address ?? '')
      setFlightNumber(l.flight_number ?? '')
      setPnr(l.pnr ?? '')

      if (isEditMode) {
        const savedItems = l.quote_line_items as SavedQuoteLineItem[] | null
        if (savedItems && savedItems.length > 0) {
          setRows(savedItems.map(li => ({
            id: uid(),
            name: li.name ?? '',
            description: li.description ?? '',
            qty: String(li.quantity ?? 1),
            rate: String(li.rate ?? 0),
          })))
          itemsFromPricing.current = true // don't let route-pricing overwrite saved items
        }
        const discAmt = l.quote_discount_amt as number | null
        const discPct = l.quote_discount_pct as number | null
        if (discAmt != null && discAmt > 0) { setDiscountType('fixed'); setDiscountFixed(String(discAmt)) }
        else if (discPct != null && discPct > 0) { setDiscountType('pct'); setDiscountPct(String(discPct)) }
        const ps = l.payment_status as string | null
        if (ps === 'pending' || ps === 'received') setPaymentStatus(ps)
        setSubject((l.quote_subject as string) ?? '')
        setCustNotes((l.quote_notes as string) ?? DEFAULT_CUSTOMER_NOTES)
        setTerms((l.quote_terms as string) ?? DEFAULT_TERMS)
        setExpiryDate(l.quote_expiry_date ? String(l.quote_expiry_date).slice(0, 10) : '')
        if (l.salesperson_name) setSalesperson(l.salesperson_name as string)
        setAgentName((l.agent_name as string) ?? '')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this inquiry.')
    } finally {
      setLoadingLead(false)
    }
  }, [adminKey, leadIdParam, isEditMode])

  useEffect(() => { loadLead() }, [loadLead])

  // ── Route pricing auto-populate (debounced), mirrors the website ──────
  // itemsFromPricing latches to `true` the first time items are auto-filled
  // (or loaded from a saved quote) and then stays true forever — it is NOT
  // reset by manual row edits. This is what stops the item table from being
  // silently overwritten every time the admin picks a different pickup/drop
  // location after they've already started customising the items. To
  // deliberately re-pull pricing for a new route, use the "Refill from route
  // pricing" button, which calls applyRoutePricing(true) below.
  const applyRoutePricing = useCallback(async (force: boolean) => {
    if (!adminKey || !fromCity.trim() || !toCity.trim()) { setRouteFound(null); return }
    setPriceLoading(true)
    try {
      const p = await calculateRoutePricing(
        adminKey, toRouteCityKey(fromCity), toRouteCityKey(toCity), Number(bagsCount) || 1
      )
      setRouteFound(p.found)
      if (p.found && p.base_price != null && (force || !itemsFromPricing.current)) {
        const bags = Number(bagsCount) || 1
        const items: Row[] = [{
          id: uid(),
          name: `Transportation of Goods (Upto 2 Bags) — ${fromCity} → ${toCity}`,
          // Description sub-line removed + Qty reflects real bag count
          // (capped at 2) — mirrors the same founder-requested fix
          // (2026-08-19) already applied on the website's quote form.
          // `rate` (p.base_price) is untouched — the flat "up to 2 bags"
          // price itself is not recalculated, only the displayed quantity.
          description: '',
          qty: String(Math.min(bags, 2)),
          rate: String(p.base_price),
          // Amount pinned to the flat p.base_price (not qty × rate) —
          // see the Row.amount doc comment above for why this exists.
          amount: p.base_price,
        }]
        if (bags > 2) {
          items.push({
            id: uid(),
            name: `Additional Bag(s) — ${fromCity} → ${toCity}`,
            description: '',
            qty: String(bags - 2),
            rate: String(p.per_bag_rate ?? 0),
          })
        }
        setRows(items)
        itemsFromPricing.current = true
      }
    } catch {
      setRouteFound(false)
    } finally {
      setPriceLoading(false)
    }
  }, [adminKey, fromCity, toCity, bagsCount])

  useEffect(() => {
    if (!adminKey || !fromCity.trim() || !toCity.trim()) { setRouteFound(null); return }
    const t = setTimeout(() => { applyRoutePricing(false) }, 500)
    return () => clearTimeout(t)
  }, [adminKey, fromCity, toCity, bagsCount, applyRoutePricing])

  function updateRow(id: string, field: keyof Omit<Row, 'id'>, value: string) {
    setRows(prev => prev.map(r => r.id === id
      // Manually touching Qty or Rate takes the row out of "flat amount"
      // mode — clear the override so Amount goes back to normal qty ×
      // rate (matches every other, non-auto-populated row).
      ? { ...r, [field]: value, ...(field === 'qty' || field === 'rate' ? { amount: undefined } : {}) }
      : r
    ))
    // Once the admin touches a row, lock the item table so future route
    // (location/bags) changes never silently overwrite their edits.
    itemsFromPricing.current = true
  }
  function addRow() { setRows(prev => [...prev, emptyRow()]); itemsFromPricing.current = true }
  function removeRow(id: string) { setRows(prev => prev.filter(r => r.id !== id)); itemsFromPricing.current = true }

  const subtotal = rows.reduce((s, r) => s + (r.amount ?? (Number(r.qty) || 0) * (Number(r.rate) || 0)), 0)
  const discountAmt = discountType === 'fixed'
    ? Math.min(Math.max(0, Number(discountFixed) || 0), subtotal)
    : parseFloat((subtotal * (Number(discountPct) || 0) / 100).toFixed(2))
  const taxableAmt = subtotal - discountAmt
  const taxAmt = taxableAmt * 0.05
  const total = taxableAmt + taxAmt

  async function handleGenerate() {
    if (!adminKey) return
    setError('')
    const effectiveName = lead?.name ?? custName.trim()
    const effectivePhone = lead?.phone ?? toE164(custPhone, custCountryIso2)
    const effectivePhoneCountryCode = lead?.phone_country_code ?? custCountryIso2
    const effectivePhoneNational    = lead?.phone_national     ?? custPhone.trim()
    if (!effectiveName) { setError('Customer name is required.'); return }
    if (!effectivePhone) { setError('Customer phone is required.'); return }
    if (!pickupAddr.trim()) { setError('Pickup address is required.'); return }
    const validRows = rows.filter(r => r.name.trim() && Number(r.rate) > 0)
    if (validRows.length === 0) { setError('Add at least one item with a name and rate.'); return }
    // Return Trip quote creation lives only in the web admin panel (Leads →
    // New Quote) — block here rather than let the shared backend's
    // auto-detect (a lead with an existing quote_number is treated as a
    // return quote) silently fire from the mobile app.
    if (!isEditMode && lead?.quote_number) {
      setError('This lead already has a quote. Return Trip quotes can only be created from the web admin panel — Leads → New Quote.')
      return
    }

    setGenerating(true)
    try {
      let resolvedLeadId = lead?.id ?? null

      if (!resolvedLeadId) {
        try {
          const created = await createLead(adminKey, {
            title: custTitle,
            name: effectiveName,
            phone: effectivePhone,
            phone_country_code: effectivePhoneCountryCode,
            phone_national: effectivePhoneNational,
            email: custEmail.trim() || undefined,
            service_interest: serviceType ?? undefined,
            from_city: fromCity.trim() || undefined,
            to_city: toCity.trim() || undefined,
            pickup_date: pickupDate.trim() || undefined,
            pickup_address: pickupAddr.trim() || undefined,
            drop_address: dropAddr.trim() || undefined,
            bags_count: Number(bagsCount) || 1,
            source: 'admin',
          })
          resolvedLeadId = created.lead.id
        } catch (e) {
          if (e instanceof AdminApiError && e.status === 409) {
            // The leads API returns duplicate_lead.id in the body, but our
            // thin client only surfaces `message` on 409 — ask the admin to
            // open the existing inquiry instead of guessing.
            setError('A lead already exists for this phone number. Open it from Inquiries and generate the quote from there.')
            setGenerating(false)
            return
          }
          throw e
        }
      }

      if (!resolvedLeadId) { setError('Could not resolve a lead to attach this quote to.'); setGenerating(false); return }

      const pickupDatetime = pickupDate.trim() && pickupTime.trim() ? `${pickupDate.trim()} ${pickupTime.trim()}` : undefined
      const explicit_line_items: QuoteLineItemInput[] = validRows.map(r => ({
        name: r.name.trim(),
        description: r.description.trim() || undefined,
        quantity: Number(r.qty) || 1,
        rate: Number(r.rate) || 0,
        hsn_or_sac: SAC_CODE,
        // Only set for the "Upto 2 Bags" route-pricing row — the server
        // respects it instead of recomputing quantity × rate. Every other
        // row omits it and prices exactly as before.
        amount: r.amount,
      }))

      const payload = {
        lead_id: resolvedLeadId,
        agent_name: agentName.trim() || undefined,
        salesperson_name: salesperson ?? undefined,
        expiry_date: expiryDate.trim() || undefined,
        subject: subject.trim() || undefined,
        customer_notes: custNotes.trim() || undefined,
        terms_conditions: terms.trim() || undefined,
        explicit_line_items,
        pickup_datetime: pickupDatetime,
        delivery_date: deliveryDate.trim() || undefined,
        pickup_address: pickupAddr.trim(),
        from_city: fromCity.trim() || undefined,
        to_city: toCity.trim() || undefined,
        bags_count: Number(bagsCount) || undefined,
        payment_status: (paymentStatus as 'pending' | 'received') ?? 'pending',
        send_email: sendEmail,
        ...(discountType === 'pct' && Number(discountPct) > 0
          ? { discount_pct: Number(discountPct), discount_type: 'pct' as const }
          : {}),
        ...(discountType === 'fixed' && Number(discountFixed) > 0
          ? { discount_fixed_amt: Number(discountFixed), discount_type: 'fixed' as const }
          : {}),
      }

      const res = await generateQuote(adminKey, payload)
      setResult({ ...res, resolvedLeadId })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate quote.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleDownloadQuote(source: (GenerateQuoteResult & { resolvedLeadId: string }) | null) {
    if (!source) return
    const html = buildQuoteHtml({
      quoteNumber: source.estimate_number || source.quote_number,
      leadNumber: lead?.lead_number,
      quoteDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      customerName: formatCustomerName(lead?.title ?? custTitle, lead?.name ?? custName) || (lead?.name ?? custName),
      customerPhone: lead?.phone ?? toE164(custPhone, custCountryIso2),
      customerEmail: (lead?.email ?? custEmail) || undefined,
      fromCity, toCity,
      bagsCount: Number(bagsCount) || 1,
      pickupDate: pickupDate || undefined,
      pickupTime: pickupTime ? timeLabel(pickupTime) : undefined,
      deliveryDate: deliveryDate || undefined,
      flightNumber: flightNumber || undefined,
      pnr: pnr || undefined,
      pickupAddress: pickupAddr || undefined,
      dropAddress: dropAddr || undefined,
      items: source.line_items.map(li => ({
        name: li.name, description: li.description, quantity: li.quantity, rate: li.rate,
        taxPct: li.tax_pct, amount: li.amount,
      })),
      subtotal: source.subtotal,
      discountAmt: source.discount_amt,
      discountPct: source.discount_pct,
      tax: source.tax,
      total: source.total,
      notes: custNotes || undefined,
      terms: terms || undefined,
      salesperson: salesperson ?? undefined,
      agentName: agentName || undefined,
      expiryDate: expiryDate || undefined,
    })
    if (Platform.OS === 'web') {
      const opened = openQuotePrint(html)
      if (!opened) setError('Could not open the print dialog.')
      return
    }

    setDownloadingQuote(true); setError('')
    try {
      await downloadQuotePdfNative(html, `${source.estimate_number || source.quote_number}.pdf`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the PDF.')
    } finally {
      setDownloadingQuote(false)
    }
  }

  async function handleSaveEdit() {
    if (!lead || !adminKey) return
    setError('')
    const validRows = rows.filter(r => r.name.trim() && Number(r.rate) > 0)
    if (validRows.length === 0) { setError('Add at least one item with a name and rate.'); return }

    setSaving(true)
    try {
      const savedItems: SavedQuoteLineItem[] = validRows.map(r => ({
        name: r.name.trim(),
        description: r.description.trim(),
        quantity: Number(r.qty) || 1,
        rate: Number(r.rate) || 0,
        tax_pct: 5,
        hsn_or_sac: SAC_CODE,
        amount: r.amount ?? (Number(r.qty) || 1) * (Number(r.rate) || 0),
      }))
      await updateLeadQuote(adminKey, lead.id, {
        quote_line_items: savedItems,
        quote_subtotal: subtotal,
        quote_discount_pct: (discountType === 'pct' && Number(discountPct) > 0) ? Number(discountPct) : null,
        quote_discount_amt: (discountType === 'fixed' && Number(discountFixed) > 0) ? discountAmt : null,
        quote_tax: taxAmt,
        quote_total: total,
        quote_subject: subject.trim() || null,
        quote_notes: custNotes.trim() || null,
        quote_terms: terms.trim() || null,
        quote_expiry_date: expiryDate.trim() || null,
        salesperson_name: salesperson || null,
        agent_name: agentName.trim() || null,
        payment_status: (paymentStatus as 'pending' | 'received') ?? 'pending',
      })
      setSaveSuccess(true)
      setTimeout(() => router.replace(`/quotes/${lead.id}`), 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingLead) {
    return (
      <Screen>
        <BackHeader />
        <ActivityIndicator color={colors.brand} />
      </Screen>
    )
  }

  if (saveSuccess) {
    return (
      <Screen>
        <BackHeader />
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={56} color={colors.success} />
        </View>
        <Text style={styles.successTitle}>Changes saved!</Text>
        <Text style={styles.successSub}>Returning to the quote…</Text>
      </Screen>
    )
  }

  if (result) {
    return (
      <Screen>
        <BackHeader />
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={56} color={colors.success} />
        </View>
        <Text style={styles.successTitle}>Quote Created!</Text>
        <Text style={styles.successSub}>
          Quote: <Text style={{ fontWeight: '700', color: colors.brand }}>{result.estimate_number}</Text>
        </Text>

        <Card style={{ marginTop: 20, marginBottom: 16 }}>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Customer</Text><Text style={styles.summaryValue}>{formatCustomerName(lead?.title ?? custTitle, lead?.name ?? custName) || (lead?.name ?? custName)}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Route</Text><Text style={styles.summaryValue}>{fromCity} → {toCity}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total</Text><Text style={[styles.summaryValue, { color: colors.brand, fontWeight: '800' }]}>{rupees(result.total)}</Text></View>
          {result.sent_to_customer ? (
            <View style={styles.sentBanner}>
              <Ionicons name="send" size={13} color="#15803d" />
              <Text style={styles.sentBannerText}>Estimate emailed to customer</Text>
            </View>
          ) : null}
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="View Quote" onPress={() => router.replace(`/quotes/${result.resolvedLeadId}`)} />
        <View style={{ height: 10 }} />
        <Button
          label={downloadingQuote ? 'Preparing…' : 'Download Quote (PDF)'}
          variant="outline"
          onPress={() => handleDownloadQuote(result)}
          loading={downloadingQuote}
        />
        <View style={{ height: 10 }} />
        <Button label="Back to Quotes" variant="outline" onPress={() => router.replace('/(admin)/quotes')} />
      </Screen>
    )
  }

  const custReadOnly = !!lead && !isEditMode

  return (
    <Screen>
      <BackHeader />
      <Text style={styles.title}>
        {isEditMode ? `Edit — ${lead?.quote_number as string ?? 'Quote'}` : 'New Quote'}
      </Text>
      <Text style={styles.sub}>Same pricing, tax, and line-item logic as the website&rsquo;s quote form.</Text>

      <Text style={styles.sectionTitle}>Customer</Text>
      <SelectField
        label="Title"
        value={custTitle}
        options={TITLE_OPTIONS.map(t => ({ value: t, label: t }))}
        onChange={setCustTitle}
        disabled={custReadOnly}
      />
      <TextField label="Full Name" value={custName} onChangeText={setCustName} editable={!custReadOnly} placeholder="Customer name" />
      <PhoneInput
        label="Phone"
        countryIso2={custCountryIso2}
        nationalNumber={custPhone}
        onCountryChange={setCustCountryIso2}
        onNumberChange={setCustPhone}
        disabled={custReadOnly}
      />
      <TextField label="Email" value={custEmail} onChangeText={setCustEmail} editable={!custReadOnly} keyboardType="email-address" autoCapitalize="none" />
      <SelectField
        label="Service Type"
        placeholder="Select service type"
        value={serviceType}
        options={LEAD_SERVICE_TYPES.map(s => ({ value: s.value, label: s.label }))}
        onChange={setServiceType}
        disabled={custReadOnly}
      />
      {lead?.lead_number ? (
        <View style={styles.leadPill}><Text style={styles.leadPillText}>{lead.lead_number as string}</Text></View>
      ) : null}

      <Text style={styles.sectionTitle}>Route & Schedule</Text>
      <SelectField
        label="Pickup city / location"
        placeholder="Select pickup location"
        value={fromLocationId}
        options={fromLocationOptions}
        onChange={handleFromChange}
      />
      {fromLocationId === OTHERS_VALUE ? (
        <TextField placeholder="Enter pickup city or location" value={fromOtherText} onChangeText={setFromOtherText} />
      ) : null}

      <Pressable style={styles.swapRow} onPress={swapLocations} hitSlop={8}>
        <Ionicons name="swap-vertical" size={16} color={colors.textMuted} />
        <Text style={styles.swapText}>Swap locations</Text>
      </Pressable>

      <SelectField
        label="Drop city / location"
        placeholder="Select drop location"
        value={toLocationId}
        options={toLocationOptions}
        onChange={handleToChange}
      />
      {toLocationId === OTHERS_VALUE ? (
        <TextField placeholder="Enter drop city or location" value={toOtherText} onChangeText={setToOtherText} />
      ) : null}

      <TextField label="No. of Bags" value={bagsCount} onChangeText={setBagsCount} keyboardType="number-pad" />
      {priceLoading ? <Text style={styles.priceHint}>Checking route pricing…</Text> : null}
      {!priceLoading && routeFound === true ? (
        <View style={styles.priceHintRow}>
          <Text style={[styles.priceHint, { color: '#15803d', marginBottom: 0 }]}>Route pricing found for this route.</Text>
          <Pressable onPress={() => applyRoutePricing(true)} hitSlop={8}>
            <Text style={styles.refillLink}>Refill items from pricing</Text>
          </Pressable>
        </View>
      ) : null}
      {!priceLoading && routeFound === false ? <Text style={[styles.priceHint, { color: colors.textMuted }]}>No saved pricing for this route — enter items manually.</Text> : null}

      <View style={styles.rowFields}>
        <View style={{ flex: 1, marginRight: 8 }}><DateField label="Pickup Date" value={pickupDate} onChange={setPickupDate} /></View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <SelectField label="Pickup Time" placeholder="Select time" value={pickupTime || null} options={TIME_OPTIONS} onChange={setPickupTime} />
        </View>
      </View>
      <DateField label="Delivery Date" value={deliveryDate} onChange={setDeliveryDate} />
      <View style={styles.rowFields}>
        <View style={{ flex: 1, marginRight: 8 }}><TextField label="Flight Number" value={flightNumber} onChangeText={setFlightNumber} autoCapitalize="characters" /></View>
        <View style={{ flex: 1, marginLeft: 8 }}><TextField label="PNR" value={pnr} onChangeText={setPnr} autoCapitalize="characters" /></View>
      </View>
      <TextField label="Pickup Address *" value={pickupAddr} onChangeText={setPickupAddr} multiline placeholder="Terminal 2, CSIA, Mumbai" />
      <TextField label="Drop / Delivery Address" value={dropAddr} onChangeText={setDropAddr} multiline placeholder="Hotel / Home address" />

      <Text style={styles.sectionTitle}>Quote Details</Text>
      <TextField label="Reference # (Agent / Partner)" value={agentName} onChangeText={setAgentName} placeholder="e.g. M/S Riya Travels" />
      <SelectField label="Salesperson" value={salesperson} options={SALESPERSONS.map(s => ({ value: s, label: s }))} onChange={setSalesperson} />
      <TextField label="Expiry Date (YYYY-MM-DD)" value={expiryDate} onChangeText={setExpiryDate} placeholder="2026-08-10" />
      <SelectField label="Payment Status" value={paymentStatus} options={PAYMENT_STATUSES} onChange={setPaymentStatus} />

      <Text style={styles.sectionTitle}>Item Table</Text>
      {rows.map(row => (
        <Card key={row.id} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <TextField
                value={row.name}
                onChangeText={v => updateRow(row.id, 'name', v)}
                placeholder="Item name"
                style={{ marginBottom: 8 }}
              />
              <TextField
                value={row.description}
                onChangeText={v => updateRow(row.id, 'description', v)}
                placeholder="Description (optional)"
                style={{ marginBottom: 8 }}
              />
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <TextField label="Qty" value={row.qty} onChangeText={v => updateRow(row.id, 'qty', v)} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <TextField label="Rate (₹)" value={row.rate} onChangeText={v => updateRow(row.id, 'rate', v)} keyboardType="decimal-pad" />
                </View>
              </View>
              <Text style={styles.rowAmount}>Amount: {rupees(row.amount ?? (Number(row.qty) || 0) * (Number(row.rate) || 0))}</Text>
            </View>
            <Pressable onPress={() => removeRow(row.id)} style={{ padding: 6 }}>
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </Card>
      ))}
      <Pressable onPress={addRow} style={styles.addRowBtn}>
        <Ionicons name="add" size={16} color={colors.brand} />
        <Text style={styles.addRowText}>Add row</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Discount</Text>
      <View style={styles.rowFields}>
        <Pressable
          style={[styles.discountToggle, discountType === 'pct' && styles.discountToggleActive]}
          onPress={() => setDiscountType('pct')}
        >
          <Text style={[styles.discountToggleText, discountType === 'pct' && styles.discountToggleTextActive]}>%</Text>
        </Pressable>
        <Pressable
          style={[styles.discountToggle, discountType === 'fixed' && styles.discountToggleActive, { marginLeft: 8 }]}
          onPress={() => setDiscountType('fixed')}
        >
          <Text style={[styles.discountToggleText, discountType === 'fixed' && styles.discountToggleTextActive]}>₹</Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          {discountType === 'pct' ? (
            <TextField value={discountPct} onChangeText={setDiscountPct} keyboardType="decimal-pad" placeholder="0" />
          ) : (
            <TextField value={discountFixed} onChangeText={setDiscountFixed} keyboardType="decimal-pad" placeholder="0" />
          )}
        </View>
      </View>

      <Card style={{ marginBottom: 16 }}>
        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{rupees(subtotal)}</Text></View>
        {discountAmt > 0 ? <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Discount</Text><Text style={[styles.summaryValue, { color: colors.error }]}>−{rupees(discountAmt)}</Text></View> : null}
        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>GST 5% (CGST 2.5 + SGST 2.5)</Text><Text style={styles.summaryValue}>{rupees(taxAmt)}</Text></View>
        <View style={[styles.summaryRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }]}>
          <Text style={[styles.summaryLabel, { fontWeight: '700', color: colors.textPrimary }]}>Total</Text>
          <Text style={[styles.summaryValue, { fontWeight: '800', color: colors.brand, fontSize: 18 }]}>{rows.length ? rupees(total) : '—'}</Text>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Subject</Text>
      <TextField value={subject} onChangeText={setSubject} placeholder="Let your customer know what this quote is for" />

      <Text style={styles.sectionTitle}>Customer Notes</Text>
      <TextField value={custNotes} onChangeText={setCustNotes} multiline />

      <Text style={styles.sectionTitle}>Terms & Conditions</Text>
      <TextField value={terms} onChangeText={setTerms} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} />

      {!isEditMode ? (
        <View style={styles.sendRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sendTitle}>Send estimate email to customer</Text>
            <Text style={styles.sendSub}>Emailed immediately after this quote is created.</Text>
          </View>
          <Switch value={sendEmail} onValueChange={setSendEmail} trackColor={{ true: colors.brand }} />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ marginTop: 8, marginBottom: 24 }}>
        {isEditMode ? (
          <>
            <Button label="Save Changes" onPress={handleSaveEdit} loading={saving} />
            <View style={{ height: 10 }} />
          </>
        ) : null}
        <Button
          label="Generate Quote"
          onPress={handleGenerate}
          loading={generating}
          variant={isEditMode ? 'outline' : 'primary'}
        />
        <View style={{ height: 10 }} />
        <Button label="Cancel" variant="outline" onPress={() => router.back()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.displaySm, color: colors.textPrimary, marginBottom: 2 },
  sub: { ...type.small, color: colors.textMuted, marginBottom: 16 },
  sectionTitle: { ...type.h2, color: colors.textPrimary, marginTop: 10, marginBottom: 12 },
  error: { ...type.small, color: colors.error, textAlign: 'center', marginVertical: 8 },
  rowFields: { flexDirection: 'row' },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, marginTop: -4 },
  swapText: { ...type.smallBold, color: colors.textMuted },
  priceHint: { ...type.caption, color: colors.textMuted, marginBottom: 10, marginTop: -6 },
  priceHintRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: -6 },
  refillLink: { ...type.caption, color: colors.brand, fontWeight: '700' },
  leadPill: { alignSelf: 'flex-start', backgroundColor: '#fff7f0', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  leadPillText: { ...type.caption, color: colors.brand, fontWeight: '700' },
  warnBanner: { flexDirection: 'row', gap: 8, backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#e9d5ff', borderRadius: radius.md, padding: 12, marginBottom: 16, alignItems: 'flex-start' },
  warnBannerText: { ...type.caption, color: '#7e22ce', flex: 1 },
  rowAmount: { ...type.caption, color: colors.textMuted, marginTop: 6 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  addRowText: { ...type.smallBold, color: colors.brand },
  discountToggle: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  discountToggleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  discountToggleText: { ...type.bodyBold, color: colors.textSecondary },
  discountToggleTextActive: { color: '#fff' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { ...type.small, color: colors.textMuted },
  summaryValue: { ...type.smallBold, color: colors.textPrimary },
  sendRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 16, gap: 12 },
  sendTitle: { ...type.smallBold, color: colors.textPrimary },
  sendSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  successIcon: { alignItems: 'center', marginTop: 24 },
  successTitle: { ...type.h1, color: colors.textPrimary, textAlign: 'center', marginTop: 12 },
  successSub: { ...type.small, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  sentBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderRadius: radius.sm, padding: 10, marginTop: 8 },
  sentBannerText: { ...type.caption, color: '#15803d', fontWeight: '700' },
})
