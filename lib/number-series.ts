import { supabaseAdmin } from '@/lib/supabase'

// Atomic, race-safe number series — wraps next_series_number() (see
// supabase/migrations/20260817_atomic_number_series.sql), which upserts a
// per-series-per-year counter in a single statement instead of the old
// "SELECT MAX ... ORDER BY DESC LIMIT 1, then +1, then INSERT" pattern that
// used to live inline in each route. That old pattern could hand the same
// number to two near-simultaneous requests; this can't, because the
// increment happens inside Postgres's own row-level locking.
//
// Call this EXACTLY ONCE per genuinely NEW record (a new booking needing a
// tracking ID, a new lead needing a lead number) — never call it again for
// an existing record. Editing an existing lead/quote/booking, previewing,
// or resending must all reuse the number already stored on that row.
async function nextSeriesNumber(series: 'BDA' | 'BDL' | 'BDQ'): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('next_series_number', { p_series: series })
  if (error || !data) {
    throw new Error(
      `Could not generate a new ${series} number (database sequence call failed): ${error?.message ?? 'no value returned'}`
    )
  }
  return data as string
}

// BDA-YYYY-NNNN — tracking ID for a new booking. One per genuinely new
// inquiry/booking, even for a repeat customer — never derived from or
// reused off another booking/lead's number.
export function nextTrackingId(): Promise<string> {
  return nextSeriesNumber('BDA')
}

// BDL-YYYY-NNNN — lead number for a new lead row. One per genuinely new
// inquiry — never reused off an existing lead just because the phone
// number matches.
export function nextLeadNumber(): Promise<string> {
  return nextSeriesNumber('BDL')
}
