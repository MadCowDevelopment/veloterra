import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// OAuth returns here (must be in Supabase Auth → Redirect allowlist).
const redirectTo = window.location.origin + import.meta.env.BASE_URL

interface AuthState {
  user: User | null
  ready: boolean
  init: () => void
  signInGoogle: () => Promise<void>
  signInGuest: () => Promise<string | null>
  linkGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

let initialized = false

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,

  init: () => {
    if (initialized) return
    initialized = true
    supabase.auth
      .getSession()
      .then(({ data }) => set({ user: data.session?.user ?? null, ready: true }))
    supabase.auth.onAuthStateChange((_event, session) =>
      set({ user: session?.user ?? null, ready: true }),
    )
  },

  signInGoogle: async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  },

  signInGuest: async () => {
    const { error } = await supabase.auth.signInAnonymously()
    return error?.message ?? null
  },

  linkGoogle: async () => {
    await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo } })
  },

  signOut: async () => {
    await supabase.auth.signOut()
  },
}))
