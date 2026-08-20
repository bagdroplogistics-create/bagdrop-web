import Constants from 'expo-constants'

// Values come from app.json → expo.extra.
const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string }

export const API_BASE_URL = extra.apiBaseUrl || 'https://www.bagdrop.co'
