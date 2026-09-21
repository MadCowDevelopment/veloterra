import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrefsState {
  mapStyle: string
  rideMapZoom: number
  exploreMapCenter: [number, number]
  exploreMapZoom: number
  headingUp: boolean
  setMapStyle: (id: string) => void
  setRideMapZoom: (zoom: number) => void
  setExploreMapView: (center: [number, number], zoom: number) => void
  setHeadingUp: (active: boolean) => void
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      mapStyle: 'dark',
      rideMapZoom: 16.5,
      exploreMapCenter: [10, 28],
      exploreMapZoom: 1.4,
      headingUp: false,
      setMapStyle: (id) => set({ mapStyle: id }),
      setRideMapZoom: (zoom) => set({ rideMapZoom: zoom }),
      setExploreMapView: (exploreMapCenter, exploreMapZoom) => set({ exploreMapCenter, exploreMapZoom }),
      setHeadingUp: (active) => set({ headingUp: active }),
    }),
    { name: 'veloterra-prefs' },
  ),
)
