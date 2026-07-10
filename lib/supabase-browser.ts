import { createClient } from '@supabase/supabase-js'

/**
 * Browser-safe Supabase client.
 * Uses the public anon key — safe to ship to the client.
 * Respects Row Level Security (RLS).
 */
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
