import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrefsState {
  mapStyle: string
  rideMapZoom: number
  headingUp: boolean
  setMapStyle: (id: string) => void
  setRideMapZoom: (zoom: number) => void
  setHeadingUp: (active: boolean) => void
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      mapStyle: 'dark',
      rideMapZoom: 16.5,
      headingUp: false,
      setMapStyle: (id) => set({ mapStyle: id }),
      setRideMapZoom: (zoom) => set({ rideMapZoom: zoom }),
      setHeadingUp: (active) => set({ headingUp: active }),
    }),
    { name: 'veloterra-prefs' },
  ),
)
