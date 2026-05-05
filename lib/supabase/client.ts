import { createBrowserClient } from '@supabase/ssr'

// Client-side Supabase client (composants React, hooks)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
