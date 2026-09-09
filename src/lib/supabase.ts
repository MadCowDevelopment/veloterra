import { createClient } from '@supabase/supabase-js'

// These are the public project URL + publishable (anon) key. They are safe to
// ship in client code — access is enforced server-side by Row-Level Security.
const SUPABASE_URL = 'https://wpipejrueluloduxueho.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kWQZ7DXVK48QxhlVrSKK1g_RhhSwlug'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
