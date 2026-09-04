import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RideMap } from '../../map/RideMap'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useWakeLock } from '../../hooks/useWakeLock'
import { haversine, formatDistance, formatDuration, type LngLat } from '../../lib/geo'
import { useWallet } from '../../state/wallet'
import { useExplored } from '../../state/explored'
import { usePrefs } from '../../state/prefs'
import { MAP_STYLES } from '../../map/styles'
import { MAX_ACCURACY_M } from '../../domain/economy'
import './Ride.css'

interface CoinPop {
  id: number
  amount: number
}

export function Ride() {
  const navigate = useNavigate()
  const { fix, status } = useGeolocation({ enabled: true })
  useWakeLock(true)

  const [distanceM, setDistanceM] = useState(0)
  const [coinsThisRide, setCoinsThisRide] = useState(0)
  const [pops, setPops] = useState<CoinPop[]>([])
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(Date.now())
  const [hudVisible, setHudVisible] = useState(true)
  const lastPoint = useRef<LngLat | null>(null)
  const popId = useRef(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const addCoins = useWallet((s) => s.add)
  const addDistance = useWallet((s) => s.addDistance)
  const finishRide = useWallet((s) => s.finishRide)
  const loadExplored = useExplored((s) => s.load)
  const reveal = useExplored((s) => s.reveal)

  // Load previously explored cells so the fog reflects past rides.
  useEffect(() => {
    loadExplored()
  }, [loadExplored])

  // Tick the clock.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // On each fix: accumulate distance, reveal fog, award coins.
  useEffect(() => {
    if (!fix || fix.accuracy > MAX_ACCURACY_M) return

    const point = { lng: fix.lng, lat: fix.lat }
    if (lastPoint.current) {
      const step = haversine(lastPoint.current, point)
      if (step >= 3 && step < 300) {
        setDistanceM((d) => d + step)
        addDistance(step)
      }
    }
    lastPoint.current = point

    const { coins } = reveal(fix)
    if (coins > 0) {
      addCoins(coins)
      setCoinsThisRide((c) => c + coins)
      const id = ++popId.current
      setPops((p) => [...p, { id, amount: coins }])
      setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1100)
    }
  }, [fix, reveal, addCoins, addDistance])

  const speedKmh = useMemo(() => {
    if (fix?.speed != null && fix.speed >= 0) return fix.speed * 3.6
    return 0
  }, [fix])

  // Keep the map the focus: reveal the HUD on tap, fade it after a few seconds.
  const revealHud = () => {
    setHudVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setHudVisible(false), 4000)
  }

  useEffect(() => {
    revealHud()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  const stop = () => {
    finishRide()
    navigate('/')
  }

  const hidden = hudVisible ? '' : ' is-hidden'

  return (
    <div className="ride" onPointerDown={revealHud}>
      <RideMap fix={fix} />

      <div className={`ride__hud ride__hud--top${hidden}`}>
        <button className="pill-btn" onClick={stop} aria-label="End ride">
          ✕
        </button>
        <div className="ride__top-right">
          <StatusBadge status={status} accuracy={fix?.accuracy} />
          <StylePicker />
        </div>
      </div>

      <div className={`ride__hud ride__hud--bottom${hidden}`}>
        <div className="hud-card hud-card--coins">
          <div className="coin-pops">
            {pops.map((p) => (
              <span key={p.id} className="coin-pop">
                +{p.amount}
              </span>
            ))}
          </div>
          <div className="hud-card__value">
            {coinsThisRide.toLocaleString()} <span className="hud-card__coin" />
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

function StylePicker() {
  const [open, setOpen] = useState(false)
  const mapStyle = usePrefs((s) => s.mapStyle)
  const setMapStyle = usePrefs((s) => s.setMapStyle)
  return (
    <div className="stylepick">
      <button
        className="pill-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Map style"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 2 2 7l10 5 10-5-10-5Z" />
          <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </button>
      {open && (
        <div className="stylepick__menu">
          {MAP_STYLES.map((s) => (
            <button
              key={s.id}
              className={`stylepick__item ${s.id === mapStyle ? 'is-active' : ''}`}
              onClick={() => {
                setMapStyle(s.id)
                setOpen(false)
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
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
