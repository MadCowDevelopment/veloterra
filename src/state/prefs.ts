import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const EXPLORE_HEX_ZOOM_MIN = 10
export const EXPLORE_HEX_ZOOM_MAX = 16

interface PrefsState {
  mapStyle: string
  rideMapZoom: number
  exploreMapCenter: [number, number]
  exploreMapZoom: number
  exploreHexZoom: number
  headingUp: boolean
  setMapStyle: (id: string) => void
  setRideMapZoom: (zoom: number) => void
  setExploreMapView: (center: [number, number], zoom: number) => void
  setExploreHexZoom: (zoom: number) => void
  setHeadingUp: (active: boolean) => void
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      mapStyle: 'dark',
      rideMapZoom: 16.5,
      exploreMapCenter: [10, 28],
      exploreMapZoom: 1.4,
      exploreHexZoom: 12,
      headingUp: false,
      setMapStyle: (id) => set({ mapStyle: id }),
      setRideMapZoom: (zoom) => set({ rideMapZoom: zoom }),
      setExploreMapView: (exploreMapCenter, exploreMapZoom) => set({ exploreMapCenter, exploreMapZoom }),
      setExploreHexZoom: (zoom) => set({
        exploreHexZoom: Math.max(EXPLORE_HEX_ZOOM_MIN, Math.min(EXPLORE_HEX_ZOOM_MAX, zoom)),
      }),
      setHeadingUp: (active) => set({ headingUp: active }),
    }),
    { name: 'veloterra-prefs' },
  ),
)
