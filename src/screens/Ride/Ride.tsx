import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RideMap } from '../../map/RideMap'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useWakeLock } from '../../hooks/useWakeLock'
import { haversine, formatDistance, formatDuration, type LngLat } from '../../lib/geo'
import { useWallet } from '../../state/wallet'
import './Ride.css'

export function Ride() {
  const navigate = useNavigate()
  const { fix, status } = useGeolocation({ enabled: true })
  useWakeLock(true)

  const [distanceM, setDistanceM] = useState(0)
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(Date.now())
  const lastPoint = useRef<LngLat | null>(null)

  const addDistance = useWallet((s) => s.addDistance)
  const finishRide = useWallet((s) => s.finishRide)

  // Tick the clock.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Accumulate distance from GPS fixes (ignore noisy low-accuracy jumps).
  useEffect(() => {
    if (!fix) return
    const point = { lng: fix.lng, lat: fix.lat }
    if (lastPoint.current && fix.accuracy <= 30) {
      const step = haversine(lastPoint.current, point)
      if (step >= 3 && step < 300) setDistanceM((d) => d + step)
    }
    lastPoint.current = point
  }, [fix])

  const speedKmh = useMemo(() => {
    if (fix?.speed != null && fix.speed >= 0) return fix.speed * 3.6
    return 0
  }, [fix])

  const stop = () => {
    addDistance(distanceM)
    finishRide()
    navigate('/')
  }

  return (
    <div className="ride">
      <RideMap fix={fix} />

      <div className="ride__hud ride__hud--top">
        <button className="pill-btn" onClick={stop} aria-label="End ride">
          ✕
        </button>
        <StatusBadge status={status} accuracy={fix?.accuracy} />
      </div>

      <div className="ride__hud ride__hud--bottom">
        <div className="hud-card hud-card--coins">
          <div className="hud-card__value">
            +0 <span className="hud-card__coin" />
          </div>
          <div className="hud-card__label">Coins this ride</div>
        </div>

        <div className="hud-row">
          <div className="hud-card">
            <div className="hud-card__value">{formatDistance(distanceM)}</div>
            <div className="hud-card__label">Distance</div>
          </div>
          <div className="hud-card">
            <div className="hud-card__value">{speedKmh.toFixed(1)}</div>
            <div className="hud-card__label">km/h</div>
          </div>
          <div className="hud-card">
            <div className="hud-card__value">{formatDuration(now - startedAt)}</div>
            <div className="hud-card__label">Time</div>
          </div>
        </div>

        <button className="stop-btn" onClick={stop}>
          Stop Ride
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status, accuracy }: { status: string; accuracy?: number }) {
  const label =
    status === 'tracking'
      ? accuracy != null
        ? `GPS ±${Math.round(accuracy)} m`
        : 'GPS locked'
      : status === 'locating'
        ? 'Locating…'
        : status === 'denied'
          ? 'Location denied'
          : status === 'unavailable'
            ? 'GPS unavailable'
            : 'GPS…'
  const ok = status === 'tracking'
  return (
    <div className={`gps-badge ${ok ? 'gps-badge--ok' : ''}`}>
      <span className="gps-badge__dot" />
      {label}
    </div>
  )
}
