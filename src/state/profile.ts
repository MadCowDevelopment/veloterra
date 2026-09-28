import { create } from 'zustand'
import { useAuth } from './auth'
import {
  claimUsername as claimUsernameRequest,
  loadMyProfile,
  saveMyProfile,
} from '../lib/profile'
import type { Profile } from '../domain/teams'

interface ProfileState {
  profile: Profile | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
  save: (displayName: string, avatarUrl: string | null) => Promise<void>
  claimUsername: (username: string) => Promise<void>
  clear: () => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not update your profile'
}

export const useProfile = create<ProfileState>((set) => ({
  profile: null,
  loading: false,
  error: null,

  load: async () => {
    const user = useAuth.getState().user
    if (!user) {
      set({ profile: null, loading: false, error: null })
      return
    }
    set({ loading: true, error: null })
    try {
      set({ profile: await loadMyProfile(user), loading: false })
    } catch (error) {
      set({ loading: false, error: message(error) })
    }
  },

  save: async (displayName, avatarUrl) => {
    set({ loading: true, error: null })
    try {
      set({ profile: await saveMyProfile(displayName, avatarUrl), loading: false })
    } catch (error) {
      const text = message(error)
      set({ loading: false, error: text })
      throw error
    }
  },

  claimUsername: async (username) => {
    set({ loading: true, error: null })
    try {
      set({ profile: await claimUsernameRequest(username), loading: false })
    } catch (error) {
      const text = message(error)
      set({ loading: false, error: text })
      throw error
    }
  },

  clear: () => set({ profile: null, loading: false, error: null }),
}))