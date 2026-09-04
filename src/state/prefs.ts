import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrefsState {
  mapStyle: string
  setMapStyle: (id: string) => void
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      mapStyle: 'dark',
      setMapStyle: (id) => set({ mapStyle: id }),
    }),
    { name: 'veloterra-prefs' },
  ),
)
