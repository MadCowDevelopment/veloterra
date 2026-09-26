import { useEffect, useMemo, useRef } from 'react'
import { Map as MlMap, Marker, NavigationControl, Popup, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToBoundary, cellToLatLng, getResolution, latLngToCell } from 'h3-js'
import { landmarkProgress, landmarkState, type Landmark, type LandmarkBounds } from '../domain/landmarks'
import { useExplored } from '../state/explored'
import { useAuth } from '../state/auth'
import { useLandmarks } from '../state/landmarks'
import { usePrefs } from '../state/prefs'
import type { CellRow } from '../data/db'
import { HEX_RES } from '../domain/economy'
import { buildFog } from '../lib/fog'
import { constructionLandmarkIcon, restoredLandmarkIcons, unrestoredLandmarkIcon } from './landmarkIcons'
import { styleUrl } from './styles'

interface Props {
  selectedLandmarkId: string | null
  onSelectLandmark: (landmark: Landmark) => void
  teamCells?: string[]
  teamView?: boolean
  presence?: Array<{ id: string; label: string; latitude: number; longitude: number }>
}

const LANDMARK_ZOOM = 12

function visibleBounds(map: MlMap): LandmarkBounds {
  const bounds = map.getBounds()
  return { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }
}

function activeLandmarks(landmarks: Landmark[], exploredCells: Map<string, unknown>): Landmark[] {
  return landmarks.filter((landmark) => exploredCells.has(latLngToCell(landmark.latitude, landmark.longitude, HEX_RES)))
}

export function ExplorationMap({
  selectedLandmarkId,
  onSelectLandmark,
  teamCells,
  teamView = false,
  presence = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const landmarkMarkersRef = useRef<Marker[]>([])
  const presenceMarkersRef = useRef<Marker[]>([])
  const revision = useExplored((state) => state.revision)
  const personalCells = useExplored((state) => state.cells)
  const user = useAuth((state) => state.user)
  const landmarks = useLandmarks((state) => state.landmarks)
  const landmarkRevision = useLandmarks((state) => state.revision)
  const loadLandmarks = useLandmarks((state) => state.loadBounds)
  const mapStyle = usePrefs((state) => state.mapStyle)
  const exploreMapCenter = usePrefs((state) => state.exploreMapCenter)
  const exploreMapZoom = usePrefs((state) => state.exploreMapZoom)
  const exploreHexZoom = usePrefs((state) => state.exploreHexZoom)
  const setExploreMapView = usePrefs((state) => state.setExploreMapView)
  const styleIdRef = useRef(mapStyle)
  const exploreMapCenterRef = useRef(exploreMapCenter)
  const exploreMapZoomRef = useRef(exploreMapZoom)
  const exploreHexZoomRef = useRef(exploreHexZoom)
  const setExploreMapViewRef = useRef(setExploreMapView)
  const userRef = useRef(user)
  const loadLandmarksRef = useRef(loadLandmarks)
  const onSelectLandmarkRef = useRef(onSelectLandmark)
  const teamViewRef = useRef(teamView)
  const cellsRef = useRef<Map<string, CellRow>>(personalCells)
  userRef.current = user
  setExploreMapViewRef.current = setExploreMapView
  loadLandmarksRef.current = loadLandmarks
  onSelectLandmarkRef.current = onSelectLandmark
  teamViewRef.current = teamView

  const cells = useMemo(() => {
    if (!teamView || teamCells == null) return personalCells
    return new Map(teamCells.map((h3) => [h3, {
      h3,
      firstVisited: 0,
      lastVisited: 0,
      visits: 1,
      coins: 0,
    } satisfies CellRow]))
  }, [personalCells, teamCells, teamView])
  cellsRef.current = cells

  const updateFog = () => {
    const map = mapRef.current
    if (!map?.getSource('exploration-fog')) return
    const bounds = map.getBounds()
    const padding = 0.02
    const visibleCells: string[] = []

    for (const h3 of cellsRef.current.keys()) {
      if (getResolution(h3) !== HEX_RES) continue
      const [latitude, longitude] = cellToLatLng(h3)
      if (
        latitude >= bounds.getSouth() - padding
        && latitude <= bounds.getNorth() + padding
        && longitude >= bounds.getWest() - padding
        && longitude <= bounds.getEast() + padding
      ) visibleCells.push(h3)
    }

    const { fill, edges } = buildFog(visibleCells)
    ;(map.getSource('exploration-fog') as GeoJSONSource).setData(fill)
    ;(map.getSource('exploration-frontier') as GeoJSONSource).setData(edges)
  }

  const data = useMemo(() => {
    const rows = [...cells.values()].filter((row) => getResolution(row.h3) === HEX_RES)
    const properties = (row: (typeof rows)[number]) => ({
      h3: row.h3,
      visits: teamView ? undefined : row.visits,
      firstVisited: teamView ? undefined : row.firstVisited,
      lastVisited: teamView ? undefined : row.lastVisited,
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
  }, [cells, revision, teamView])
  const dataRef = useRef(data)
  dataRef.current = data
  const displayedLandmarks = useMemo(
    () => activeLandmarks(landmarks, cells),
    [cells, landmarks, revision],
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new MlMap({
      container: containerRef.current,
      style: styleUrl(styleIdRef.current),
      center: exploreMapCenterRef.current,
      zoom: exploreMapZoomRef.current,
      minZoom: 1,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.setMissingStyleImageResolver((id) => {
      if (!map.hasImage(id)) {
        map.addImage(id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) })
      }
    })
    map.addControl(
      new NavigationControl({ showCompass: true, showZoom: false, visualizePitch: false }),
      'top-right',
    )

    map.on('style.load', () => {
      map.addSource('explored-polygons', { type: 'geojson', data: dataRef.current.polygons })
      map.addSource('explored-points', {
        type: 'geojson',
        data: dataRef.current.points,
      })
      const fog = buildFog([])
      map.addSource('exploration-fog', { type: 'geojson', data: fog.fill })
      map.addSource('exploration-frontier', { type: 'geojson', data: fog.edges })
      map.addLayer({
        id: 'explored-overview',
        type: 'heatmap',
        source: 'explored-points',
        maxzoom: exploreHexZoomRef.current,
        paint: {
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 5, 8, 7, 11, 10],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.35, 8, 0.65, 11, 1],
          'heatmap-opacity': 0.52,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(34, 227, 196, 0)',
            0.18, 'rgba(34, 227, 196, 0.45)',
            0.5, 'rgba(34, 227, 196, 0.6)',
            0.8, 'rgba(185, 255, 244, 0.68)',
            1, 'rgba(255, 210, 87, 0.72)',
          ],
        },
      })
      map.addLayer({
        id: 'exploration-fog-fill',
        type: 'fill',
        source: 'exploration-fog',
        paint: {
          'fill-color': '#05070d',
          'fill-opacity': 0.82,
        },
      })
      map.addLayer({
        id: 'exploration-frontier-line',
        type: 'line',
        source: 'exploration-frontier',
        minzoom: exploreHexZoomRef.current,
        paint: {
          'line-color': '#22e3c4',
          'line-width': 2,
          'line-blur': 3,
          'line-opacity': 0.5,
        },
      })
      map.moveLayer('explored-overview')
      map.addLayer({
        id: 'explored-hexes',
        type: 'fill',
        source: 'explored-polygons',
        minzoom: exploreHexZoomRef.current,
        paint: { 'fill-color': '#000000', 'fill-opacity': 0 },
      })
      updateFog()
    })

    map.on('click', 'explored-hexes', (event) => {
      const properties = event.features?.[0]?.properties
      if (!properties) return
      if (teamViewRef.current) {
        new Popup({ closeButton: false, offset: 8 })
          .setLngLat(event.lngLat)
          .setHTML('<strong>Team explored tile</strong><br><span>Shared exploration only</span>')
          .addTo(map)
        return
      }
      const visited = new Date(Number(properties.firstVisited)).toLocaleDateString()
      new Popup({ closeButton: false, offset: 8 })
        .setLngLat(event.lngLat)
        .setHTML(`<strong>${properties.visits} visit${properties.visits === 1 ? '' : 's'}</strong><br><span>First explored ${visited}</span>`)
        .addTo(map)
    })
    map.on('mouseenter', 'explored-hexes', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'explored-hexes', () => { map.getCanvas().style.cursor = '' })

    const updateLandmarkVisibility = () => {
      map.getContainer().classList.toggle('exploration-map--landmarks-hidden', map.getZoom() < LANDMARK_ZOOM)
    }
    updateLandmarkVisibility()
    map.on('zoom', updateLandmarkVisibility)
    map.on('moveend', updateFog)

    const refreshLandmarks = () => {
      const center = map.getCenter()
      setExploreMapViewRef.current([center.lng, center.lat], map.getZoom())
      if (!userRef.current || map.getZoom() < LANDMARK_ZOOM) return
      void loadLandmarksRef.current(visibleBounds(map))
    }
    map.on('moveend', refreshLandmarks)

    return () => {
      landmarkMarkersRef.current.forEach((marker) => marker.remove())
      landmarkMarkersRef.current = []
      presenceMarkersRef.current.forEach((marker) => marker.remove())
      presenceMarkersRef.current = []
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
    updateFog()
  }, [data])

  useEffect(() => {
    exploreHexZoomRef.current = exploreHexZoom
    const map = mapRef.current
    if (!map?.getLayer('explored-overview') || !map.getLayer('explored-hexes')) return
    map.setLayerZoomRange('explored-overview', 0, exploreHexZoom)
    map.setLayerZoomRange('exploration-fog-fill', 0, 24)
    map.setLayerZoomRange('exploration-frontier-line', exploreHexZoom, 24)
    map.setLayerZoomRange('explored-hexes', exploreHexZoom, 24)
  }, [exploreHexZoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !user || map.getZoom() < LANDMARK_ZOOM) return
    void loadLandmarks(visibleBounds(map))
  }, [landmarkRevision, loadLandmarks, user])

  useEffect(() => {
    const map = mapRef.current
    landmarkMarkersRef.current.forEach((marker) => marker.remove())
    landmarkMarkersRef.current = []
    if (!map || !user) return

    landmarkMarkersRef.current = displayedLandmarks.map((landmark) => {
      const state = landmarkState(landmark)
      const isSelected = landmark.id === selectedLandmarkId
      const markerElement = document.createElement('div')
      markerElement.className = `landmark-marker-anchor landmark-marker-anchor--${state}${isSelected ? ' landmark-marker-anchor--selected' : ''}`
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `landmark-marker landmark-marker--${state}${isSelected ? ' landmark-marker--selected' : ''}`
      element.title = landmark.name
      element.setAttribute('aria-label', landmark.name)
      element.setAttribute('aria-pressed', String(isSelected))
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
      markerElement.append(element)
      return new Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat([landmark.longitude, landmark.latitude])
        .addTo(map)
    })
  }, [displayedLandmarks, selectedLandmarkId, user])

  useEffect(() => {
    const map = mapRef.current
    presenceMarkersRef.current.forEach((marker) => marker.remove())
    presenceMarkersRef.current = []
    if (!map || !teamView) return

    presenceMarkersRef.current = presence.map((person) => {
      const element = document.createElement('div')
      element.className = 'team-presence-marker'
      element.title = `${person.label} is sharing a live position`
      element.setAttribute('aria-label', `${person.label} is sharing a live position`)
      const dot = document.createElement('span')
      dot.className = 'team-presence-marker__dot'
      const label = document.createElement('span')
      label.className = 'team-presence-marker__label'
      label.textContent = person.label
      element.append(dot, label)
      return new Marker({ element, anchor: 'bottom' })
        .setLngLat([person.longitude, person.latitude])
        .addTo(map)
    })

    return () => {
      presenceMarkersRef.current.forEach((marker) => marker.remove())
      presenceMarkersRef.current = []
    }
  }, [presence, teamView])

  return <div ref={containerRef} className="exploration-map" />
}