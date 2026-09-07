import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SubPage } from '../../components/SubPage'
import { CoinAmount } from '../../components/CoinAmount'
import { listRides } from '../../lib/rides'
import { formatDistance, formatDuration } from '../../lib/geo'
import type { RideRow } from '../../data/db'
import './Rides.css'

export function RidesHistory() {
  const [rides, setRides] = useState<RideRow[] | null>(null)

  useEffect(() => {
    listRides().then(setRides)
  }, [])

  return (
    <SubPage title="Rides">
      {rides === null ? null : rides.length === 0 ? (
        <div className="card muted">No rides yet — start a ride to see it here.</div>
      ) : (
        <div className="ride-list">
          {rides.map((r) => (
            <Link key={r.id} to={`/rides/${r.id}`} className="ride-item">
              <div>
                <div className="ride-item__date">
                  {new Date(r.startedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {' · '}
                  {new Date(r.startedAt).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div className="ride-item__stats">
                  {formatDistance(r.distanceM)} · {formatDuration(r.durationMs)}
                </div>
              </div>
              <CoinAmount copper={r.coins} size="sm" />
            </Link>
          ))}
        </div>
      )}
    </SubPage>
  )
}
