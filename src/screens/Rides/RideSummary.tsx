import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SubPage } from '../../components/SubPage'
import { CoinAmount } from '../../components/CoinAmount'
import { RouteMap } from '../../map/RouteMap'
import { getRide } from '../../lib/rides'
import { formatDistance, formatDuration } from '../../lib/geo'
import type { RideRow } from '../../data/db'
import './Rides.css'

export function RideSummary() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ride, setRide] = useState<RideRow | null | undefined>(undefined)

  useEffect(() => {
    if (id) getRide(id).then((r) => setRide(r ?? null))
  }, [id])

  return (
    <SubPage title="Ride Summary" back="/rides">
      {ride === undefined ? null : ride === null ? (
        <div className="muted">Ride not found.</div>
      ) : (
        <>
          <div className="ride-date">{new Date(ride.startedAt).toLocaleString()}</div>

          {ride.path && ride.path.length >= 2 && <RouteMap path={ride.path} />}

          <div className="summary-grid">
            <div className="summary-cell">
              <div className="summary-cell__value">{formatDistance(ride.distanceM)}</div>
              <div className="summary-cell__label">Distance</div>
            </div>
            <div className="summary-cell">
              <div className="summary-cell__value">{formatDuration(ride.durationMs)}</div>
              <div className="summary-cell__label">Duration</div>
            </div>
            <div className="summary-cell">
              <div className="summary-cell__value">{avgSpeed(ride).toFixed(1)}</div>
              <div className="summary-cell__label">Avg km/h</div>
            </div>
            <div className="summary-cell">
              <div className="summary-cell__value">{(ride.maxSpeedKmh ?? 0).toFixed(1)}</div>
              <div className="summary-cell__label">Max km/h</div>
            </div>
            <div className="summary-cell">
              <div className="summary-cell__value">{ride.newCells.toLocaleString()}</div>
              <div className="summary-cell__label">New tiles</div>
            </div>
            <div className="summary-cell summary-cell--coins">
              <CoinAmount copper={ride.coins} size="md" />
              <div className="summary-cell__label">Earned</div>
            </div>
          </div>

          <button className="btn btn--primary summary-done" onClick={() => navigate('/')}>
            Done
          </button>
        </>
      )}
    </SubPage>
  )
}

function avgSpeed(ride: RideRow): number {
  if (ride.durationMs <= 0) return 0
  return (ride.distanceM / (ride.durationMs / 1000)) * 3.6
}
