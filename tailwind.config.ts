import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ─── Dark backgrounds ───────────────────────
        midnight: '#080F1E',
        navy:     '#0F2040',

        // ─── Brand orange (primary CTA) ─────────────
        brand: {
          DEFAULT: '#FF6300',
          hover:   '#E55A00',
          light:   '#FFF3EC',
          dark:    '#CC5000',
        },

        // ─── Gold (secondary premium accent) ────────
        gold: {
          DEFAULT: '#C8A96E',
          light:   '#F9F3E8',
        },

        // ─── Neutral scale ───────────────────────────
        neutral: {
          dark:   '#545454',   // secondary text, icon strokes
          mid:    '#747474',   // placeholder, muted labels
          light:  '#A8A8A8',   // very muted text
        },

        // ─── Surfaces ───────────────────────────────
        cream:   '#FAFAF8',    // page background
        surface: '#FFFFFF',    // card / modal backgrounds

        // ─── Typography ─────────────────────────────
        text: {
          primary:   '#0B1426',
          secondary: '#545454',
          muted:     '#747474',
          inverse:   '#FAFAF8',
        },

        // ─── Borders ────────────────────────────────
        border: {
          DEFAULT: '#EAEAEA',
          strong:  '#D4D4D4',
        },

        // ─── Semantic ───────────────────────────────
        success: {
          DEFAULT: '#059669',
          bg:      '#ECFDF5',
        },
        warning: {
          DEFAULT: '#D97706',
          bg:      '#FFFBEB',
        },
        error: {
          DEFAULT: '#DC2626',
          bg:      '#FEF2F2',
        },
      },

      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-geist-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        mono:    ['var(--font-geist-mono)', 'JetBrains Mono', 'monospace'],
      },

      fontSize: {
        'display-2xl': ['4.5rem',   { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-xl':  ['3.5rem',   { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg':  ['3rem',     { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md':  ['2.25rem',  { lineHeight: '1.2',  letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-sm':  ['1.875rem', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' }],
      },

      borderRadius: {
        sm:  '4px',
        md:  '8px',
        lg:  '12px',
        xl:  '16px',
        '2xl': '24px',
        '3xl': '32px',
      },

      boxShadow: {
        xs:     '0 1px 2px rgba(8,15,30,0.06)',
        sm:     '0 2px 8px rgba(8,15,30,0.08)',
        md:     '0 4px 16px rgba(8,15,30,0.10)',
        lg:     '0 8px 32px rgba(8,15,30,0.12)',
        xl:     '0 16px 48px rgba(8,15,30,0.16)',
        gold:   '0 4px 24px rgba(200,169,110,0.25)',
        brand:  '0 4px 24px rgba(255,99,0,0.30)',
        'brand-lg': '0 8px 40px rgba(255,99,0,0.35)',
      },

      keyframes: {
        'count-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-brand': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,99,0,0.4)' },
          '50%':       { boxShadow: '0 0 0 8px rgba(255,99,0,0)' },
        },
      },

      animation: {
        'count-up':    'count-up 0.6s ease-out forwards',
        'fade-up':     'fade-up 0.5s ease-out forwards',
        'pulse-brand': 'pulse-brand 2s cubic-bezier(0.4,0,0.6,1) infinite',
      },

      // Max widths for consistent layout
      maxWidth: {
        content: '1280px',
        reading: '672px',
        narrow:  '480px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}

export default config
