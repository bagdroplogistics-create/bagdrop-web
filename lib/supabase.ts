import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server-only client — uses service_role key, bypasses RLS
export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false },
})

// Browser-safe client — uses anon key, respects RLS
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'

export interface Booking {
  id:               string
  tracking_id:      string
  status:           BookingStatus
  customer_name:    string
  customer_email:   string
  customer_phone:   string
  service_type:     string
  service_label:    string
  from_city:        string
  to_city:          string
  pickup_address:   string | null
  drop_address:     string | null
  pickup_date:      string | null
  time_slot:        string | null
  flight_number:    string | null
  total_bags:       number
  bag_details:      unknown
  total_amount:     number
  currency:         string
  add_ons:          unknown
  notes:            string | null
  status_history:   Array<{ status: string; timestamp: string; note?: string }>
  created_at:       string
  updated_at:       string
}
