import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ExplorationMap } from '../../map/ExplorationMap'
import { useExplored } from '../../state/explored'
import './Explore.css'

export function Explore() {
  const load = useExplored((state) => state.load)
  const cellCount = useExplored((state) => state.cells.size)
  const revision = useExplored((state) => state.revision)

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="explore">
      <ExplorationMap />
      <header className="explore__header">
        <Link to="/" className="explore__back" aria-label="Back to menu">‹</Link>
        <div className="explore__title">
          <strong>Explored world</strong>
          <span>{revision >= 0 ? cellCount.toLocaleString() : 0} hexes</span>
        </div>
      </header>
      {cellCount === 0 && (
        <div className="explore__empty">Complete a ride to reveal your first place.</div>
      )}
    </div>
  )
}