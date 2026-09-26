import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { clearAllLivePresence } from '../lib/teams'

// OAuth returns here (must be in Supabase Auth → Redirect allowlist).
const redirectTo = window.location.origin + import.meta.env.BASE_URL

function readOAuthError(): string | null {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const message = hash.get('error_description') ?? query.get('error_description')
  const code = hash.get('error') ?? query.get('error')
  if (!message && !code) return null
  window.history.replaceState({}, document.title, window.location.pathname)
  return message ?? `Authentication failed (${code}).`
}

interface AuthState {
  user: User | null // a real (non-anonymous) signed-in user
  ready: boolean
  authError: string | null
  init: () => void
  signInGoogle: () => Promise<void>
  signInMicrosoft: () => Promise<void>
  signOut: () => Promise<void>
}

let initialized = false

// Anonymous sessions are treated as "not signed in" — signed-out = device-local.
const realUser = (u: User | null | undefined) => (u && !u.is_anonymous ? u : null)

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  authError: null,

  init: () => {
    if (initialized) return
    initialized = true
    const callbackError = readOAuthError()
    supabase.auth
      .getSession()
      .then(({ data, error }) => set({
        user: realUser(data.session?.user),
        ready: true,
        authError: callbackError ?? error?.message ?? null,
      }))
    supabase.auth.onAuthStateChange((_event, session) =>
      set({
        user: realUser(session?.user),
        ready: true,
        ...(session ? { authError: null } : {}),
      }),
    )
  },

  signInGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    if (error) set({ authError: error.message })
  },

  signInMicrosoft: async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'azure', options: { redirectTo, scopes: 'email' } })
    if (error) set({ authError: error.message })
  },

  signOut: async () => {
    await clearAllLivePresence().catch(() => undefined)
    await supabase.auth.signOut()
  },
}))
