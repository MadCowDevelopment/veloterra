import { useEffect, useRef } from 'react'
import maplibregl, { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { usePrefs } from '../state/prefs'
import { styleUrl } from './styles'

interface Props {
  path: [number, number][]
}

export function RouteMap({ path }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const mapStyle = usePrefs((s) => s.mapStyle)

  useEffect(() => {
    if (!containerRef.current || mapRef.current || path.length < 1) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(mapStyle),
      attributionControl: { compact: true },
      dragRotate: false,
    })
    mapRef.current = map

    map.on('load', () => {
      if (path.length >= 2) {
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path } },
        })
        map.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#22e3c4', 'line-width': 9, 'line-blur': 6, 'line-opacity': 0.45 },
        })
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#22e3c4', 'line-width': 4 },
        })
      }

      const start = path[0]
      const end = path[path.length - 1]
      map.addSource('ends', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { role: 'start' }, geometry: { type: 'Point', coordinates: start } },
            { type: 'Feature', properties: { role: 'end' }, geometry: { type: 'Point', coordinates: end } },
          ],
        },
      })
      map.addLayer({
        id: 'ends',
        type: 'circle',
        source: 'ends',
        paint: {
          'circle-radius': 6,
          'circle-color': ['match', ['get', 'role'], 'start', '#7cf25e', '#ff5470'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#04140f',
        },
      })

      const b = new maplibregl.LngLatBounds()
      for (const p of path) b.extend(p)
      map.fitBounds(b, { padding: 44, maxZoom: 16, duration: 0 })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (path.length < 1) return null
  return <div ref={containerRef} className="route-map" />
}
