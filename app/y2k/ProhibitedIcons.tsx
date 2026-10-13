// Prohibited-item icons for the Y2K booking form — teal line icons inside a red
// "no" circle with a diagonal slash, matching the BagDrop prohibited-items
// reference graphic. Plain inline SVG (no images), so they stay crisp at any
// size and add no network requests.

const TEAL = '#1F8A8F'
const RED  = '#E53935'

const ICON_PATHS: Record<string, string[]> = {
  'lighters': [
    'M7.5 10h8v11.5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1z', 'M7.5 10V8h8v2',
    'M11.5 2.5c1 1.2 1.7 2 1.7 3.1a1.7 1.7 0 0 1-3.4 0c0-1.1.7-1.9 1.7-3.1z',
  ],
  'flam-liquid': [
    'M12 3c3.2 4 5.2 6.6 5.2 9.6a5.2 5.2 0 0 1-10.4 0C6.8 9.6 8.8 7 12 3z',
    'M12 13.5c1 1.2 1.4 1.8 1.4 2.4a1.4 1.4 0 0 1-2.8 0c0-.6.4-1.2 1.4-2.4z',
  ],
  'toxic': [
    'M9.5 3h5M10.5 3v6L5.2 18.2a2 2 0 0 0 1.8 3h10a2 2 0 0 0 1.8-3L13.5 9V3',
    'M12 13.5v3M12 19v.1',
  ],
  'corrosive': [
    'M10 4.5l8 2.8-1 3-8-2.8z', 'M8 12.5c1 1.4 1.5 2.2 1.5 2.9a1.5 1.5 0 0 1-3 0c0-.7.5-1.5 1.5-2.9z',
    'M4 20.5h16M6.5 20.5v-2.5h11v2.5',
  ],
  'alcohol': [
    'M6.5 21V9.5l1.5-2.5V3h3v4l1.5 2.5V21z', 'M14.5 4h6l-.6 5a2.4 2.4 0 0 1-4.8 0zM17.5 11.5V19M15 20.5h5',
  ],
  'lithium': [
    'M3 8h18v12H3z', 'M7 8V6h3v2M14 8V6h3v2', 'M12.5 10.5L10 14h3.5L11 17.5',
  ],
  'flam-gas': [
    'M6 8h10l3 3v10.5H6z', 'M10 8V4.5h4V8',
    'M12.5 12.5c1.5 1.8 2 2.6 2 3.4a2 2 0 0 1-4 0c0-.8.5-1.6 2-3.4z',
  ],
  'e-cigarettes': [
    'M3.5 16.5l14-5 1.3 3.6-14 5z', 'M8 12c-1.2-1.5 1.2-2.5 0-4.5',
  ],
  'infectious': [
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
  ],
  'radioactive': [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z',
    'M12 10.5V4.5M10.5 12.9l-5.2 3M13.5 12.9l5.2 3',
  ],
  'explosives': [
    'M10.5 8.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z', 'M15 9.5l2-2.5', 'M18 3.5v2M21 6.5h-2M16.8 3.8l1 1',
  ],
  'power-banks': [
    'M7 3.5h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z',
    'M12.5 8.5L9.5 13h3L9.5 17.5', 'M17.5 8.5h2V13h-2',
  ],
}

export default function ProhibitedIcon({ id, size = 56 }: { id: string; size?: number }) {
  const paths = ICON_PATHS[id] ?? []
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false" style={{ display:'block' }}>
      <g transform="translate(13 13) scale(1.58)" fill="none" stroke={TEAL} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round">
        {paths.map((d, i) => <path key={i} d={d} />)}
      </g>
      <circle cx="32" cy="32" r="30" fill="none" stroke={RED} strokeWidth="2" />
      <line x1="11" y1="11" x2="53" y2="53" stroke={RED} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
