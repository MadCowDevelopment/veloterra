import { useEffect, useRef } from 'react'
import maplibregl, { Map as MlMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToLatLng } from 'h3-js'
import type { GeoFix } from '../hooks/useGeolocation'
import { useExplored } from '../state/explored'
import { buildFog } from '../lib/fog'

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
  const readyRef = useRef(false)
  const centeredRef = useRef(false)

  const revision = useExplored((s) => s.revision)

  // Rebuild the fog polygon for the explored cells currently in view.
  const updateFog = () => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const b = map.getBounds()
    const pad = 0.02
    const w = b.getWest() - pad
    const e = b.getEast() + pad
    const s = b.getSouth() - pad
    const n = b.getNorth() + pad

    const inView: string[] = []
    for (const h3 of useExplored.getState().cells.keys()) {
      const [lat, lng] = cellToLatLng(h3)
      if (lat >= s && lat <= n && lng >= w && lng <= e) inView.push(h3)
    }

    const { fill, edges } = buildFog(inView)
    ;(map.getSource('fog') as maplibregl.GeoJSONSource | undefined)?.setData(fill)
    ;(map.getSource('fog-edges') as maplibregl.GeoJSONSource | undefined)?.setData(edges)
  }

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

    map.on('load', () => {
      map.addSource('fog', { type: 'geojson', data: buildFog([]).fill })
      map.addSource('fog-edges', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'fog-fill',
        type: 'fill',
        source: 'fog',
        paint: { 'fill-color': '#05070d', 'fill-opacity': 0.82 },
      })
      map.addLayer({
        id: 'fog-frontier',
        type: 'line',
        source: 'fog-edges',
        paint: {
          'line-color': '#22e3c4',
          'line-width': 2,
          'line-blur': 3,
          'line-opacity': 0.5,
        },
      })
      readyRef.current = true
      updateFog()
    })

    map.on('moveend', updateFog)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      readyRef.current = false
    }
  }, [])

  // Rebuild fog when new cells are revealed.
  useEffect(() => {
    updateFog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

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
      <div className="ride-scrim" aria-hidden />
    </div>
  )
}
