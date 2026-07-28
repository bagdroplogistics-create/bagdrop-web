import React, { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, Modal, FlatList, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius } from '@/theme/colors'
import { type } from '@/theme/typography'
import {
  ALL_COUNTRIES,
  PREFERRED_COUNTRIES,
  DEFAULT_COUNTRY_ISO2,
  findCountry,
  type CountryDialCode,
} from '@/shared/phone-countries'
import { isValidPhoneForCountry } from '@/shared/phone-format'

// BAGDROP ADMIN — src/components/PhoneInput.tsx
//
// International phone field: bottom-sheet country picker (flag + name +
// dial code, Bagdrop's top inquiry countries pinned above the alphabetical
// full list, searchable) + a national-number TextInput, validated per
// country via libphonenumber-js. Mirrors components/ui/phone-input.tsx on
// the website and follows this app's existing SelectField.tsx bottom-sheet
// pattern for visual consistency. Ported into mobile-app/src/components/
// as well — keep both in sync.

export interface PhoneInputProps {
  label?:           string
  countryIso2:      string
  nationalNumber:   string
  onCountryChange:  (iso2: string) => void
  onNumberChange:   (digits: string) => void
  placeholder?:     string
  disabled?:        boolean
  showValidation?:  boolean
}

export function PhoneInput({
  label,
  countryIso2,
  nationalNumber,
  onCountryChange,
  onNumberChange,
  placeholder = 'Phone number',
  disabled,
  showValidation = true,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const country: CountryDialCode = findCountry(countryIso2) ?? findCountry(DEFAULT_COUNTRY_ISO2)!

  const listData = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      const preferred = PREFERRED_COUNTRIES.map(iso => findCountry(iso)).filter(
        (c): c is CountryDialCode => !!c
      )
      const rest = ALL_COUNTRIES.filter(c => !PREFERRED_COUNTRIES.includes(c.iso2))
      return [...preferred, ...rest]
    }
    return ALL_COUNTRIES.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q.replace('+', '')) ||
        c.iso2.toLowerCase() === q
    )
  }, [search])

  const digitsEntered = nationalNumber.trim().length > 0
  const invalid = showValidation && digitsEntered && !isValidPhoneForCountry(nationalNumber, countryIso2)

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <Pressable
          style={[styles.codeField, disabled && styles.disabled]}
          onPress={() => !disabled && setOpen(true)}
        >
          <Text style={styles.flag}>{country.flag}</Text>
          <Text style={styles.codeText}>+{country.dialCode}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.neutralMid} />
        </Pressable>

        <TextInput
          value={nationalNumber}
          onChangeText={t => onNumberChange(t.replace(/[^\d]/g, ''))}
          placeholder={placeholder}
          placeholderTextColor={colors.neutralLight}
          keyboardType="phone-pad"
          editable={!disabled}
          style={[styles.input, invalid && styles.inputError, disabled && styles.disabled]}
        />
      </View>
      {invalid ? <Text style={styles.error}>Enter a valid {country.name} phone number</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select country</Text>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={colors.neutralMid} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search country or code"
                placeholderTextColor={colors.neutralLight}
                style={styles.searchInput}
                autoFocus
              />
            </View>
            <FlatList
              data={listData}
              keyExtractor={c => c.iso2}
              style={{ maxHeight: 380 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => { onCountryChange(item.iso2); setOpen(false); setSearch('') }}
                >
                  <Text style={styles.flag}>{item.flag}</Text>
                  <Text style={[styles.optionText, item.iso2 === country.iso2 && styles.optionTextActive]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.optionDial}>+{item.dialCode}</Text>
                  {item.iso2 === country.iso2 ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No countries match.</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { ...type.smallBold, color: colors.textSecondary, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  disabled: { opacity: 0.5 },
  codeField: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 10, backgroundColor: colors.cream,
  },
  flag: { fontSize: 16 },
  codeText: { ...type.smallBold, color: colors.textSecondary },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error },
  error: { ...type.small, color: colors.error, marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '80%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { ...type.h1, color: colors.textPrimary, marginBottom: 12 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
  },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, padding: 0 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { ...type.body, color: colors.textPrimary, flex: 1 },
  optionTextActive: { color: colors.brand, fontWeight: '700' },
  optionDial: { ...type.small, color: colors.textMuted },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: 20 },
})
