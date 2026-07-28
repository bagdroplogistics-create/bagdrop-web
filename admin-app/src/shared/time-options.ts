// Ported verbatim from the website's lib/time-options.ts so the admin
// app's time picker offers the exact same 48 half-hour slots, same order
// (06:00 AM ... 11:30 PM, then 12:00 AM ... 05:30 AM), same 24h values.

function to12h(h24: number, m: number): string {
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return `${String(h12).padStart(2, '0')}:${m === 0 ? '00' : '30'} ${period}`
}

const morning: [number, number][] = Array.from({ length: 36 }, (_, i) => [
  Math.floor((i + 12) / 2),
  (i + 12) % 2 === 0 ? 0 : 30,
] as [number, number])
const earlyMorn: [number, number][] = Array.from({ length: 12 }, (_, i) => [
  Math.floor(i / 2),
  i % 2 === 0 ? 0 : 30,
] as [number, number])

export interface TimeOption { value: string; label: string }

export const TIME_OPTIONS: TimeOption[] = [...morning, ...earlyMorn].map(([h, m]) => ({
  value: `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`,
  label: to12h(h, m),
}))

export function timeLabel(value: string): string {
  return TIME_OPTIONS.find(t => t.value === value)?.label ?? value
}
