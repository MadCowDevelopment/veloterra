import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// OAuth returns here (must be in Supabase Auth → Redirect allowlist).
const redirectTo = window.location.origin + import.meta.env.BASE_URL

interface AuthState {
  user: User | null // a real (non-anonymous) signed-in user
  ready: boolean
  init: () => void
  signInGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

let initialized = false

// Anonymous sessions are treated as "not signed in" — signed-out = device-local.
const realUser = (u: User | null | undefined) => (u && !u.is_anonymous ? u : null)

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,

  init: () => {
    if (initialized) return
    initialized = true
    supabase.auth
      .getSession()
      .then(({ data }) => set({ user: realUser(data.session?.user), ready: true }))
    supabase.auth.onAuthStateChange((_event, session) =>
      set({ user: realUser(session?.user), ready: true }),
    )
  },

  signInGoogle: async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  },

  signOut: async () => {
    await supabase.auth.signOut()
  },
}))
