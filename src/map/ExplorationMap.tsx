import { useEffect, useMemo, useRef } from 'react'
import { Map as MlMap, Popup, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToBoundary, cellToLatLng, getResolution } from 'h3-js'
import { HEX_RES } from '../domain/economy'
import { useExplored } from '../state/explored'
import { usePrefs } from '../state/prefs'
import { styleUrl } from './styles'

export function ExplorationMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const revision = useExplored((state) => state.revision)
  const cells = useExplored((state) => state.cells)
  const mapStyle = usePrefs((state) => state.mapStyle)

  const data = useMemo(() => {
    const rows = [...cells.values()].filter((row) => getResolution(row.h3) === HEX_RES)
    const properties = (row: (typeof rows)[number]) => ({
      h3: row.h3,
      visits: row.visits,
      firstVisited: row.firstVisited,
      lastVisited: row.lastVisited,
    })

    const polygons: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: rows.map((row) => ({
        type: 'Feature',
        id: row.h3,
        properties: properties(row),
        geometry: {
          type: 'Polygon',
          coordinates: [cellToBoundary(row.h3, true)],
        },
      })),
    }
    const points: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: rows.map((row) => {
        const [lat, lng] = cellToLatLng(row.h3)
        return {
          type: 'Feature',
          id: row.h3,
          properties: properties(row),
          geometry: { type: 'Point', coordinates: [lng, lat] },
        }
      }),
    }
    return { polygons, points }
  }, [cells, revision])
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new MlMap({
      container: containerRef.current,
      style: styleUrl(mapStyle),
      center: [10, 28],
      zoom: 1.4,
      minZoom: 1,
      attributionControl: { compact: true },
    })
    mapRef.current = map

    map.on('style.load', () => {
      map.addSource('explored-polygons', { type: 'geojson', data: dataRef.current.polygons })
      map.addSource('explored-points', {
        type: 'geojson',
        data: dataRef.current.points,
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 48,
      })
      map.addLayer({
        id: 'explored-clusters',
        type: 'circle',
        source: 'explored-points',
        filter: ['has', 'point_count'],
        maxzoom: 13,
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#22e3c4', 100, '#ffd257', 1000, '#ff7a68'],
          'circle-radius': ['step', ['get', 'point_count'], 17, 100, 22, 1000, 28],
          'circle-stroke-width': 3,
          'circle-stroke-color': 'rgba(5, 7, 13, 0.8)',
        },
      })
      map.addLayer({
        id: 'explored-cluster-count',
        type: 'symbol',
        source: 'explored-points',
        filter: ['has', 'point_count'],
        maxzoom: 13,
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#04140f' },
      })
      map.addLayer({
        id: 'explored-points',
        type: 'circle',
        source: 'explored-points',
        filter: ['!', ['has', 'point_count']],
        minzoom: 10,
        maxzoom: 13,
        paint: {
          'circle-color': '#22e3c4',
          'circle-radius': 4,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#04140f',
        },
      })
      map.addLayer({
        id: 'explored-hexes',
        type: 'fill',
        source: 'explored-polygons',
        minzoom: 12,
        paint: {
          'fill-color': ['interpolate', ['linear'], ['get', 'visits'], 1, '#22e3c4', 5, '#ffd257', 20, '#ff7a68'],
          'fill-opacity': 0.58,
          'fill-outline-color': '#b9fff4',
        },
      })
    })

    map.on('click', 'explored-clusters', async (event) => {
      const feature = event.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') return
      const clusterId = Number(feature.properties?.cluster_id)
      const zoom = await (map.getSource('explored-points') as GeoJSONSource).getClusterExpansionZoom(clusterId)
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom, duration: 500 })
    })
    map.on('click', 'explored-hexes', (event) => {
      const properties = event.features?.[0]?.properties
      if (!properties) return
      const visited = new Date(Number(properties.firstVisited)).toLocaleDateString()
      new Popup({ closeButton: false, offset: 8 })
        .setLngLat(event.lngLat)
        .setHTML(`<strong>${properties.visits} visit${properties.visits === 1 ? '' : 's'}</strong><br><span>First explored ${visited}</span>`)
        .addTo(map)
    })
    map.on('mouseenter', 'explored-clusters', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'explored-clusters', () => { map.getCanvas().style.cursor = '' })
    map.on('mouseenter', 'explored-hexes', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'explored-hexes', () => { map.getCanvas().style.cursor = '' })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [mapStyle])

  useEffect(() => {
    ;(mapRef.current?.getSource('explored-polygons') as GeoJSONSource | undefined)?.setData(data.polygons)
    ;(mapRef.current?.getSource('explored-points') as GeoJSONSource | undefined)?.setData(data.points)
  }, [data])

  return <div ref={containerRef} className="exploration-map" />
}