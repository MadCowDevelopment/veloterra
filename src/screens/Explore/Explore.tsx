import { useEffect, useState } from 'react'
import { cellToLatLng } from 'h3-js'
import { Link } from 'react-router-dom'
import { LandmarkPanel } from '../../components/LandmarkPanel'
import { MapStylePicker } from '../../components/MapStylePicker'
import { ExplorationMap } from '../../map/ExplorationMap'
import type { Landmark } from '../../domain/landmarks'
import { useAuth } from '../../state/auth'
import { useExplored } from '../../state/explored'
import { useLandmarks } from '../../state/landmarks'
import './Explore.css'

export function Explore() {
  const load = useExplored((state) => state.load)
  const exploredLoaded = useExplored((state) => state.loaded)
  const exploredCells = useExplored((state) => state.cells)
  const cellCount = useExplored((state) => state.cells.size)
  const revision = useExplored((state) => state.revision)
  const user = useAuth((state) => state.user)
  const landmarks = useLandmarks((state) => state.landmarks)
  const landmarkError = useLandmarks((state) => state.error)
  const discoverAround = useLandmarks((state) => state.discoverAround)
  const subscribe = useLandmarks((state) => state.subscribe)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = landmarks.find((landmark) => landmark.id === selectedId) ?? null

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!user) return
    return subscribe()
  }, [subscribe, user])

  useEffect(() => {
    if (!user || !exploredLoaded) return
    let cancelled = false
    const areas = new Map<string, [number, number]>()
    const recentCells = [...exploredCells.values()].sort((left, right) => right.lastVisited - left.lastVisited)
    for (const cell of recentCells) {
      const [latitude, longitude] = cellToLatLng(cell.h3)
      const key = `${Math.round(latitude / 0.02)}:${Math.round(longitude / 0.02)}`
      if (!areas.has(key)) areas.set(key, [latitude, longitude])
    }

    void (async () => {
      for (const [latitude, longitude] of areas.values()) {
        if (cancelled || !await discoverAround(latitude, longitude)) return
      }
    })()
    return () => { cancelled = true }
  }, [discoverAround, exploredCells, exploredLoaded, revision, user])

  return (
    <div className="explore">
      <ExplorationMap onSelectLandmark={(landmark: Landmark) => setSelectedId(landmark.id)} />
      <header className="explore__header">
        <Link to="/" className="explore__back" aria-label="Back to menu">‹</Link>
        <div className="explore__title">
          <strong>Explored world</strong>
          <span>{revision >= 0 ? cellCount.toLocaleString() : 0} hexes</span>
        </div>
      </header>
      <div className="explore__controls">
        <MapStylePicker />
      </div>
      {user && landmarkError && (
        <div className="explore__landmark-status explore__landmark-status--error">{landmarkError}</div>
      )}
      {!user && <div className="explore__landmark-status">Sign in to see global restorations.</div>}
      {cellCount === 0 && (
        <div className="explore__empty">Complete a ride to reveal your first place.</div>
      )}
      {selected && <LandmarkPanel landmark={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}