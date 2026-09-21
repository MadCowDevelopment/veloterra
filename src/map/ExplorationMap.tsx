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

const DETAIL_ZOOM = 12

function visibleBounds(map: MlMap): LandmarkBounds {
  const bounds = map.getBounds()
  return { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }
}

function activeLandmarks(landmarks: Landmark[], exploredCells: Map<string, unknown>): Landmark[] {
  return landmarks.filter((landmark) => exploredCells.has(latLngToCell(landmark.latitude, landmark.longitude, HEX_RES)))
}

export function ExplorationMap({ onSelectLandmark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const landmarkMarkersRef = useRef<Marker[]>([])
  const revision = useExplored((state) => state.revision)
  const cells = useExplored((state) => state.cells)
  const user = useAuth((state) => state.user)
  const landmarks = useLandmarks((state) => state.landmarks)
  const landmarkRevision = useLandmarks((state) => state.revision)
  const loadLandmarks = useLandmarks((state) => state.loadBounds)
  const mapStyle = usePrefs((state) => state.mapStyle)
  const exploreMapCenter = usePrefs((state) => state.exploreMapCenter)
  const exploreMapZoom = usePrefs((state) => state.exploreMapZoom)
  const setExploreMapView = usePrefs((state) => state.setExploreMapView)
  const styleIdRef = useRef(mapStyle)
  const exploreMapCenterRef = useRef(exploreMapCenter)
  const exploreMapZoomRef = useRef(exploreMapZoom)
  const setExploreMapViewRef = useRef(setExploreMapView)
  const userRef = useRef(user)
  const loadLandmarksRef = useRef(loadLandmarks)
  const onSelectLandmarkRef = useRef(onSelectLandmark)
  userRef.current = user
  setExploreMapViewRef.current = setExploreMapView
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
      map.addLayer({
        id: 'explored-overview',
        type: 'heatmap',
        source: 'explored-points',
        maxzoom: DETAIL_ZOOM,
        paint: {
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 5, 8, 7, 11, 10],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.35, 8, 0.65, 11, 1],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 11, 0.7, DETAIL_ZOOM, 0],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(34, 227, 196, 0)',
            0.18, 'rgba(34, 227, 196, 0.35)',
            0.5, 'rgba(34, 227, 196, 0.75)',
            0.8, '#b9fff4',
            1, '#ffd257',
          ],
        },
      })
      map.addLayer({
        id: 'explored-hexes',
        type: 'fill',
        source: 'explored-polygons',
        minzoom: DETAIL_ZOOM,
        paint: {
          'fill-color': ['interpolate', ['linear'], ['get', 'visits'], 1, '#22e3c4', 5, '#ffd257', 20, '#ff7a68'],
          'fill-opacity': 0.58,
          'fill-outline-color': '#b9fff4',
        },
      })
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
    map.on('mouseenter', 'explored-hexes', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'explored-hexes', () => { map.getCanvas().style.cursor = '' })

    const updateLandmarkVisibility = () => {
      map.getContainer().classList.toggle('exploration-map--landmarks-hidden', map.getZoom() < DETAIL_ZOOM)
    }
    updateLandmarkVisibility()
    map.on('zoom', updateLandmarkVisibility)

    const refreshLandmarks = () => {
      const center = map.getCenter()
      setExploreMapViewRef.current([center.lng, center.lat], map.getZoom())
      if (!userRef.current || map.getZoom() < DETAIL_ZOOM) return
      void loadLandmarksRef.current(visibleBounds(map))
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
    if (!map || !user || map.getZoom() < DETAIL_ZOOM) return
    void loadLandmarks(visibleBounds(map))
  }, [landmarkRevision, loadLandmarks, user])

  useEffect(() => {
    const map = mapRef.current
    landmarkMarkersRef.current.forEach((marker) => marker.remove())
    landmarkMarkersRef.current = []
    if (!map || !user) return

    landmarkMarkersRef.current = displayedLandmarks.map((landmark) => {
      const state = landmarkState(landmark)
      const markerElement = document.createElement('div')
      markerElement.className = 'landmark-marker-anchor'
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
      markerElement.append(element)
      return new Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat([landmark.longitude, landmark.latitude])
        .addTo(map)
    })
  }, [displayedLandmarks, user])

  return <div ref={containerRef} className="exploration-map" />
}