import Constants from 'expo-constants'

// Values come from app.json → expo.extra. Edit them there (see README.md
// "Setup" section) — do NOT hardcode secrets directly in source files.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  razorpayKeyId?: string
}

export const API_BASE_URL = extra.apiBaseUrl || 'https://bagdrop.co'
export const SUPABASE_URL = extra.supabaseUrl || ''
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey || ''
export const RAZORPAY_KEY_ID = extra.razorpayKeyId || ''

if (__DEV__ && (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_SUPABASE'))) {
  console.warn(
    '[config] Supabase URL/anon key not set in app.json → expo.extra. ' +
    'Auth (OTP login) will not work until you add them — see README.md.'
  )
}
