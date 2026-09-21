import { useEffect, useRef } from 'react'
import { Map as MlMap, Marker, NavigationControl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToLatLng, getResolution } from 'h3-js'
import type { GeoFix } from '../hooks/useGeolocation'
import { useExplored } from '../state/explored'
import { usePrefs } from '../state/prefs'
import { styleUrl } from './styles'
import { buildFog } from '../lib/fog'
import { HEX_RES } from '../domain/economy'

interface Props {
  fix: GeoFix | null
  follow: boolean
  headingUp?: boolean
  path?: [number, number][]
  onPositionPick?: (lng: number, lat: number) => void
}

const DEFAULT_MAP_CENTER: [number, number] = [10.45, 51.16]
const DEFAULT_MAP_ZOOM = 5.5

/** Bearing in degrees (0 = north, clockwise) from a → b. */
function bearing(a: GeoFix, b: GeoFix): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(Δλ) * Math.cos(φ2)
  const y = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(x, y)
  return ((θ * 180) / Math.PI + 360) % 360
}

export function RideMap({ fix, follow, headingUp = false, path = [], onPositionPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const readyRef = useRef(false)
  const centeredRef = useRef(false)
  const followRef = useRef(follow)
  const latestFix = useRef<GeoFix | null>(null)
  const prevFix = useRef<GeoFix | null>(null)
  const latestHeading = useRef<number | null>(null)
  const headingUpRef = useRef(headingUp)
  const positionPickRef = useRef(onPositionPick)

  const revision = useExplored((s) => s.revision)
  const mapStyle = usePrefs((s) => s.mapStyle)
  const rideMapZoom = usePrefs((s) => s.rideMapZoom)
  const setRideMapZoom = usePrefs((s) => s.setRideMapZoom)
  const styleIdRef = useRef(mapStyle)
  const rideMapZoomRef = useRef(rideMapZoom)
  const setRideMapZoomRef = useRef(setRideMapZoom)

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
      if (getResolution(h3) !== HEX_RES) continue // ignore cells from another resolution
      const [lat, lng] = cellToLatLng(h3)
      if (lat >= s && lat <= n && lng >= w && lng <= e) inView.push(h3)
    }

    const { fill, edges } = buildFog(inView)
  ;(map.getSource('fog') as GeoJSONSource | undefined)?.setData(fill)
  ;(map.getSource('fog-edges') as GeoJSONSource | undefined)?.setData(edges)
  }

  // (Re)attach custom sources/layers — runs on first load and after setStyle.
  const addOverlays = () => {
    const map = mapRef.current
    if (!map) return
    if (!map.getSource('ride-path')) {
      map.addSource('ride-path', {
        type: 'geojson',
        lineMetrics: true,
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: path },
        },
      })
    }
    if (!map.getLayer('ride-path-glow')) {
      map.addLayer({
        id: 'ride-path-glow',
        type: 'line',
        source: 'ride-path',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#22e3c4',
          'line-width': 10,
          'line-blur': 7,
          'line-opacity': 0.28,
        },
      })
    }
    if (!map.getLayer('ride-path-line')) {
      map.addLayer({
        id: 'ride-path-line',
        type: 'line',
        source: 'ride-path',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': 4,
          'line-gradient': [
            'interpolate',
            ['linear'],
            ['line-progress'],
            0,
            '#147d78',
            0.65,
            '#22e3c4',
            1,
            '#ffd257',
          ],
        },
      })
    }
    if (!map.getSource('fog')) {
      map.addSource('fog', { type: 'geojson', data: buildFog([]).fill })
    }
    if (!map.getSource('fog-edges')) {
      map.addSource('fog-edges', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
    }
    if (!map.getLayer('fog-fill')) {
      map.addLayer({
        id: 'fog-fill',
        type: 'fill',
        source: 'fog',
        paint: { 'fill-color': '#05070d', 'fill-opacity': 0.82 },
      })
    }
    if (!map.getLayer('fog-frontier')) {
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
    }
    readyRef.current = true
    const f = latestFix.current
    if (!centeredRef.current && f) {
      map.jumpTo({ center: [f.lng, f.lat], zoom: rideMapZoomRef.current })
      markerRef.current?.setLngLat([f.lng, f.lat])
      centeredRef.current = true
    }
    updateFog()
  }

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new MlMap({
      container: containerRef.current,
      style: styleUrl(styleIdRef.current),
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapRef.current = map
    map.addControl(
      new NavigationControl({ showCompass: true, showZoom: false, visualizePitch: false }),
      'top-right',
    )

    const el = document.createElement('div')
    el.className = 'rider-dot'
    el.innerHTML = `
      <svg class="rider-arrow" viewBox="0 0 24 24" aria-hidden="true">
        <path class="rider-arrow__solid" d="M12 0.5 L2.5 21 Q7.6 18.2 12 14 Z" />
        <path class="rider-arrow__outline" d="M12 0.5 L21.5 21 Q16.4 18.2 12 14 Z" />
      </svg>
    `
    markerRef.current = new Marker({ element: el }).setLngLat(DEFAULT_MAP_CENTER).addTo(map)

    // Rotate the arrow to face the travel direction (0° = north, clockwise).
    const applyHeading = (heading: number | null) => {
      const arrow = markerRef.current
        ?.getElement()
        ?.querySelector('.rider-arrow') as SVGSVGElement | null
      if (!arrow) return
      if (heading == null) {
        arrow.style.opacity = '1'
        return
      }
      arrow.style.opacity = '1'
      arrow.style.transformOrigin = '12px 12px'
      arrow.style.transform = `rotate(${((heading + 360) % 360)}deg)`
    }
    ;(globalThis as any).__applyHeading = applyHeading

    // Fires on initial load and after every setStyle().
    map.on('style.load', addOverlays)
    map.on('moveend', updateFog)
    map.on('zoomend', () => {
      if (centeredRef.current) setRideMapZoomRef.current(map.getZoom())
    })
    map.on('click', (event) => {
      positionPickRef.current?.(event.lngLat.lng, event.lngLat.lat)
    })

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      readyRef.current = false
    }
  }, [])

  useEffect(() => {
    positionPickRef.current = onPositionPick
  }, [onPositionPick])

  // Switch basemap style when the preference changes (fog is re-added on load).
  useEffect(() => {
    const map = mapRef.current
    if (!map || mapStyle === styleIdRef.current) return
    styleIdRef.current = mapStyle
    readyRef.current = false
    // diff:false forces a full reload so 'style.load' re-fires; re-add fog on idle.
    map.setStyle(styleUrl(mapStyle), { diff: false })
    map.once('idle', addOverlays)
  }, [mapStyle])

  useEffect(() => {
    const source = mapRef.current?.getSource('ride-path') as GeoJSONSource | undefined
    source?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: path },
    })
  }, [path])

  // Rebuild fog when new cells are revealed.
  useEffect(() => {
    updateFog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  // Update the marker every fix; recenter once initially, then only while following.
  useEffect(() => {
    latestFix.current = fix
    const map = mapRef.current
    if (!map || !fix) return
    const lngLat: [number, number] = [fix.lng, fix.lat]
    markerRef.current?.setLngLat(lngLat)

    // Prefer GPS heading; fall back to bearing from the last two positions.
    let heading = fix.heading
    if (heading == null && prevFix.current) {
      heading = bearing(prevFix.current, fix)
    }
    latestHeading.current = heading
    const mapBearing = headingUpRef.current && heading != null ? heading : map.getBearing()
    ;(globalThis as any).__applyHeading?.(heading == null ? null : heading - mapBearing)
    prevFix.current = fix

    if (!centeredRef.current) {
      map.jumpTo({ center: lngLat, zoom: rideMapZoomRef.current })
      centeredRef.current = true
    } else if (followRef.current) {
      map.easeTo({
        center: lngLat,
        bearing: headingUpRef.current && heading != null ? heading : map.getBearing(),
        duration: 500,
      })
    }
  }, [fix])

  useEffect(() => {
    headingUpRef.current = headingUp
    const map = mapRef.current
    if (!map) return
    const heading = latestHeading.current
    const bearing = headingUp && heading != null ? heading : 0
    map.easeTo({ bearing, duration: 400 })
    ;(globalThis as any).__applyHeading?.(heading == null ? null : heading - bearing)
  }, [headingUp])

  // When following turns on, snap back to the rider (in case the map was panned).
  useEffect(() => {
    followRef.current = follow
    const map = mapRef.current
    const f = latestFix.current
    if (follow && map && f) {
      map.easeTo({ center: [f.lng, f.lat], duration: 500 })
    }
  }, [follow])

  return (
    <div className={`ride-map${onPositionPick ? ' ride-map--position-pick' : ''}`}>
      <div ref={containerRef} className="ride-map__canvas" />
      <div className="ride-scrim" aria-hidden />
    </div>
  )
}
