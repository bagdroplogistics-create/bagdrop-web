// Mirrors lib/lead-source.ts on the website (same labels / filter options).
export const SOURCE_LABELS: Record<string, string> = {
  manual:         'Manual',
  admin:          'Manual',
  website:        'Website',
  'mobile-app':   'Mobile App',
  'contact-form': 'Contact Form',
  referral:       'Referral',
  b2b:            'B2B',
  'walk-in':      'Walk-in',
  skybird:        'Skybird',
  'group-wedding': 'Group/Wedding',
  'iconiqa-hotel': 'ICONIQA Hotel',
  'iconiqa-inquiry': 'ICONIQA Hotel',
  flamingo:       'Flamingo',
  whatsapp:       'WhatsApp',
  phone:          'Phone Call',
  instagram:      'Instagram',
  facebook:       'Facebook',
  'y2k-inquiry':     'Y2K Wedding',
  'wedding-inquiry': 'Wedding Inquiry',
  'skybird-leads':    'Skybird',
  'skybird-bookings': 'Skybird',
  'admin-leads':      'Manual',
  'repair-tool':      'Repair Tool',
}

export function sourceFilterOptions(): { value: string; label: string }[] {
  const byLabel = new Map<string, string[]>()
  for (const [k, l] of Object.entries(SOURCE_LABELS)) byLabel.set(l, [...(byLabel.get(l) ?? []), k])
  byLabel.delete('Repair Tool')   // internal repair-tool leads: label kept for display, hidden from the filter
  return [...byLabel.entries()].map(([label, keys]) => ({ value: keys.join(','), label }))
}

export function sourceCreateOptions(): { value: string; label: string }[] {
  const seen = new Set<string>()
  const out: { value: string; label: string }[] = []
  for (const [k, l] of Object.entries(SOURCE_LABELS)) {
    if (seen.has(l) || k.includes('-leads') || k.includes('-bookings') || k === 'repair-tool') continue
    seen.add(l); out.push({ value: k, label: l })
  }
  return out
}

export const SOURCE_LABEL_COLORS: Record<string, { color: string; bg: string }> = {
  Website:       { color: '#16a34a', bg: '#dcfce7' },
  Manual:        { color: '#2563eb', bg: '#dbeafe' },
  'Mobile App':  { color: '#ea580c', bg: '#ffedd5' },
  'Contact Form':{ color: '#0891b2', bg: '#cffafe' },
  Referral:      { color: '#7c3aed', bg: '#ede9fe' },
  B2B:           { color: '#7c3aed', bg: '#ede9fe' },
  'Walk-in':     { color: '#6b7280', bg: '#f3f4f6' },
  Skybird:       { color: '#0369a1', bg: '#e0f2fe' },
  'Group/Wedding': { color: '#be185d', bg: '#fce7f3' },
  'ICONIQA Hotel': { color: '#92400e', bg: '#fef3c7' },
  Flamingo:      { color: '#be123c', bg: '#ffe4e6' },
  'Y2K Wedding': { color: '#be185d', bg: '#fce7f3' },
  'Wedding Inquiry': { color: '#be185d', bg: '#fce7f3' },
}


export function resolveSource(source: string | null | undefined): { label: string; color: string; bg: string } {
  if (!source) return { label: 'Website', ...SOURCE_LABEL_COLORS.Website }
  const label = SOURCE_LABELS[source] ?? source
  const c = SOURCE_LABEL_COLORS[label]
  return c ? { label, ...c } : { label, color: '#6b7280', bg: '#f3f4f6' }
}
