import { useEffect, useRef } from 'react'
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoFix } from '../hooks/useGeolocation'

// Keyless dark OSM vector basemap (OpenFreeMap). No API key, no signup.
// In M4 this is swapped for offline vector tiles (PMTiles).
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark'

interface Props {
  fix: GeoFix | null
}

export function RideMap({ fix }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const centeredRef = useRef(false)

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [0, 20],
      zoom: 2,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapRef.current = map

    const el = document.createElement('div')
    el.className = 'rider-dot'
    el.innerHTML = '<span class="rider-dot__pulse"></span><span class="rider-dot__core"></span>'
    markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([0, 20]).addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Follow the live position.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !fix) return
    const lngLat: [number, number] = [fix.lng, fix.lat]
    markerRef.current?.setLngLat(lngLat)

    if (!centeredRef.current) {
      map.easeTo({ center: lngLat, zoom: 16.5, duration: 800 })
      centeredRef.current = true
    } else {
      map.easeTo({ center: lngLat, duration: 500 })
    }
  }, [fix])

  return (
    <div className="ride-map">
      <div ref={containerRef} className="ride-map__canvas" />
      <div className="fog" aria-hidden />
    </div>
  )
}
