import { useEffect, useState } from 'react'
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
  const cellCount = useExplored((state) => state.cells.size)
  const revision = useExplored((state) => state.revision)
  const user = useAuth((state) => state.user)
  const landmarks = useLandmarks((state) => state.landmarks)
  const landmarkError = useLandmarks((state) => state.error)
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