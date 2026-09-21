import { useEffect, useMemo, useRef } from 'react'
import { Map as MlMap, Marker, NavigationControl, Popup, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToBoundary, cellToLatLng, getResolution, latLngToCell } from 'h3-js'
import { landmarkProgress, landmarkState, type Landmark, type LandmarkBounds } from '../domain/landmarks'
import { useExplored } from '../state/explored'
import { useAuth } from '../state/auth'
import { useLandmarks } from '../state/landmarks'
import { usePrefs } from '../state/prefs'
import { HEX_RES } from '../domain/economy'
import { constructionLandmarkIcon, restoredLandmarkIcons, unrestoredLandmarkIcon } from './landmarkIcons'
import { styleUrl } from './styles'

interface Props {
  onSelectLandmark: (landmark: Landmark) => void
}

const discoveredAreas = new Set<string>()

function visibleBounds(map: MlMap): LandmarkBounds {
  const bounds = map.getBounds()
  return { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }
}

function discoveryBounds(map: MlMap): LandmarkBounds {
  const { lng, lat } = map.getCenter()
  return {
    west: Math.max(-180, lng - 0.075),
    south: Math.max(-90, lat - 0.06),
    east: Math.min(180, lng + 0.075),
    north: Math.min(90, lat + 0.06),
  }
}

function activeLandmarks(landmarks: Landmark[]): Landmark[] {
  const visible = landmarks.filter((landmark) => landmark.tier > 1 || landmark.totalContributed > 0)
  const untouchedLocalByArea = new Map<string, Landmark>()
  for (const landmark of landmarks) {
    if (landmark.tier !== 1 || landmark.totalContributed > 0) continue
    const area = latLngToCell(landmark.latitude, landmark.longitude, 7)
    const current = untouchedLocalByArea.get(area)
    if (!current || landmark.scopeMultiplier > current.scopeMultiplier
      || (landmark.scopeMultiplier === current.scopeMultiplier && landmark.name < current.name)) {
      untouchedLocalByArea.set(area, landmark)
    }
  }
  return [...visible, ...untouchedLocalByArea.values()]
}

export function ExplorationMap({ onSelectLandmark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const landmarkMarkersRef = useRef<Marker[]>([])
  const revision = useExplored((state) => state.revision)
  const cells = useExplored((state) => state.cells)
  const user = useAuth((state) => state.user)
  const landmarks = useLandmarks((state) => state.landmarks)
  const loadLandmarks = useLandmarks((state) => state.loadBounds)
  const mapStyle = usePrefs((state) => state.mapStyle)
  const styleIdRef = useRef(mapStyle)
  const userRef = useRef(user)
  const loadLandmarksRef = useRef(loadLandmarks)
  const onSelectLandmarkRef = useRef(onSelectLandmark)
  userRef.current = user
  loadLandmarksRef.current = loadLandmarks
  onSelectLandmarkRef.current = onSelectLandmark

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
  const displayedLandmarks = useMemo(() => activeLandmarks(landmarks), [landmarks])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new MlMap({
      container: containerRef.current,
      style: styleUrl(styleIdRef.current),
      center: [10, 28],
      zoom: 1.4,
      minZoom: 1,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(
      new NavigationControl({ showCompass: true, showZoom: false, visualizePitch: false }),
      'top-right',
    )

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

    const updateLandmarkVisibility = () => {
      map.getContainer().classList.toggle('exploration-map--landmarks-hidden', map.getZoom() < 10)
    }
    updateLandmarkVisibility()
    map.on('zoom', updateLandmarkVisibility)

    const refreshLandmarks = () => {
      if (!userRef.current || map.getZoom() < 10) return
      const center = map.getCenter()
      const areaKey = `${Math.round(center.lat / 0.04)}:${Math.round(center.lng / 0.04)}`
      const discover = map.getZoom() >= 12 && !discoveredAreas.has(areaKey)
      if (discover) discoveredAreas.add(areaKey)
      void loadLandmarksRef.current(discover ? discoveryBounds(map) : visibleBounds(map), discover)
    }
    map.on('moveend', refreshLandmarks)

    return () => {
      landmarkMarkersRef.current.forEach((marker) => marker.remove())
      landmarkMarkersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapStyle === styleIdRef.current) return
    styleIdRef.current = mapStyle
    map.setStyle(styleUrl(mapStyle), { diff: false })
  }, [mapStyle])

  useEffect(() => {
    ;(mapRef.current?.getSource('explored-polygons') as GeoJSONSource | undefined)?.setData(data.polygons)
    ;(mapRef.current?.getSource('explored-points') as GeoJSONSource | undefined)?.setData(data.points)
  }, [data])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !user || map.getZoom() < 10) return
    void loadLandmarks(visibleBounds(map))
  }, [loadLandmarks, user])

  useEffect(() => {
    const map = mapRef.current
    landmarkMarkersRef.current.forEach((marker) => marker.remove())
    landmarkMarkersRef.current = []
    if (!map || !user) return

    landmarkMarkersRef.current = displayedLandmarks.map((landmark) => {
      const state = landmarkState(landmark)
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `landmark-marker landmark-marker--${state}`
      element.title = landmark.name
      element.setAttribute('aria-label', landmark.name)
      element.style.setProperty('--landmark-progress', `${landmarkProgress(landmark) * 360}deg`)

      const categoryIcon = document.createElement('img')
      categoryIcon.src = state === 'restored' ? restoredLandmarkIcons[landmark.category] : unrestoredLandmarkIcon
      categoryIcon.alt = ''
      element.append(categoryIcon)

      if (state === 'constructing') {
        const constructionIcon = document.createElement('img')
        constructionIcon.className = 'landmark-marker__construction'
        constructionIcon.src = constructionLandmarkIcon
        constructionIcon.alt = ''
        element.append(constructionIcon)
      }

      element.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelectLandmarkRef.current(landmark)
      })
      return new Marker({ element, anchor: 'bottom' })
        .setLngLat([landmark.longitude, landmark.latitude])
        .addTo(map)
    })
  }, [displayedLandmarks, user])

  return <div ref={containerRef} className="exploration-map" />
}