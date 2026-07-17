// Ported from the website's tailwind.config.ts — keep these two files
// in sync so the app always matches the site's branding.

export const colors = {
  midnight: '#080F1E',
  navy: '#0F2040',

  brand: '#FF6300',
  brandHover: '#E55A00',
  brandLight: '#FFF3EC',
  brandDark: '#CC5000',

  gold: '#C8A96E',
  goldLight: '#F9F3E8',

  neutralDark: '#545454',
  neutralMid: '#747474',
  neutralLight: '#A8A8A8',

  cream: '#FAFAF8',
  surface: '#FFFFFF',

  textPrimary: '#0B1426',
  textSecondary: '#545454',
  textMuted: '#747474',
  textInverse: '#FAFAF8',

  border: '#EAEAEA',
  borderStrong: '#D4D4D4',

  success: '#059669',
  successBg: '#ECFDF5',
  warning: '#D97706',
  warningBg: '#FFFBEB',
  error: '#DC2626',
  errorBg: '#FEF2F2',
} as const

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  '3xl': 32,
} as const

// Both the individual shadow* props (native) and boxShadow (web / RN new
// architecture) are set — each platform just ignores the one it doesn't use.
export const shadow = {
  card: {
    shadowColor: '#080F1E',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    boxShadow: '0px 2px 8px rgba(8,15,30,0.08)',
  },
  brand: {
    shadowColor: '#FF6300',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    boxShadow: '0px 4px 12px rgba(255,99,0,0.3)',
  },
} as const
