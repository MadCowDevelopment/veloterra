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
import { CoinAmount } from '../../components/CoinAmount'
import './Ride.css'

type Phase = 'idle' | 'tracking' | 'paused'

interface CoinPop {
  id: number
  amount: number
}

export function Ride() {
  const navigate = useNavigate()
  const { fix, status } = useGeolocation({ enabled: true })

  const [phase, setPhase] = useState<Phase>('idle')
  useWakeLock(phase !== 'idle')

  const [distanceM, setDistanceM] = useState(0)
  const [coinsThisRide, setCoinsThisRide] = useState(0)
  const [pops, setPops] = useState<CoinPop[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [hudVisible, setHudVisible] = useState(true)

  const runningSince = useRef<number | null>(null)
  const lastPoint = useRef<LngLat | null>(null)
  const popId = useRef(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef<Phase>('idle')

  const addCoins = useWallet((s) => s.add)
  const addDistance = useWallet((s) => s.addDistance)
  const finishRideStat = useWallet((s) => s.finishRide)
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

  // Only accumulate distance, reveal fog and award coins while tracking.
  useEffect(() => {
    if (phase !== 'tracking' || !fix || fix.accuracy > MAX_ACCURACY_M) return

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
  }, [fix, phase, reveal, addCoins, addDistance])

  const elapsed =
    elapsedMs + (phase === 'tracking' && runningSince.current ? now - runningSince.current : 0)

  const speedKmh = useMemo(() => {
    if (phase === 'tracking' && fix?.speed != null && fix.speed >= 0) return fix.speed * 3.6
    return 0
  }, [fix, phase])

  // Keep the map the focus: reveal the HUD on tap, fade it only while tracking.
  const revealHud = () => {
    setHudVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (phaseRef.current === 'tracking') {
      hideTimer.current = setTimeout(() => setHudVisible(false), 4000)
    }
  }

  useEffect(() => {
    phaseRef.current = phase
    revealHud()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    },
    [],
  )

  const start = () => {
    runningSince.current = Date.now()
    lastPoint.current = null
    setPhase('tracking')
  }

  const pause = () => {
    const since = runningSince.current
    if (since) setElapsedMs((e) => e + (Date.now() - since))
    runningSince.current = null
    setPhase('paused')
  }

  const resume = () => {
    runningSince.current = Date.now()
    lastPoint.current = null // don't count the gap while paused
    setPhase('tracking')
  }

  const leave = () => {
    if (phase !== 'idle') finishRideStat()
    navigate('/')
  }

  const hidden = hudVisible ? '' : ' is-hidden'
  const gpsReady = status === 'tracking'

  return (
    <div className="ride" onPointerDown={revealHud}>
      <RideMap fix={fix} follow={phase === 'tracking'} />

      <div className={`ride__hud ride__hud--top${hidden}`}>
        <button className="pill-btn" onClick={leave} aria-label="Back to menu">
          ✕
        </button>
        <div className="ride__top-right">
          <StatusBadge status={status} accuracy={fix?.accuracy} />
          <StylePicker />
        </div>
      </div>

      <div className={`ride__hud ride__hud--bottom${hidden}`}>
        {phase === 'idle' ? (
          <>
            <div className="ride__hint">Look around the map, then start your ride.</div>
            <button className="start-btn" onClick={start} disabled={!gpsReady}>
              {gpsReady ? 'Start Ride' : 'Getting GPS…'}
            </button>
          </>
        ) : (
          <>
            <div className="hud-card hud-card--coins">
              <div className="coin-pops">
                {pops.map((p) => (
                  <span key={p.id} className="coin-pop">
                    +{p.amount}
                  </span>
                ))}
              </div>
              <CoinAmount copper={coinsThisRide} size="lg" />
              <div className="hud-card__label">Earned this ride</div>
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
                <div className="hud-card__value">{formatDuration(elapsed)}</div>
                <div className="hud-card__label">Time</div>
              </div>
            </div>

            {phase === 'tracking' ? (
              <button className="pause-btn" onClick={pause}>
                Pause
              </button>
            ) : (
              <div className="ride__pauserow">
                <button className="resume-btn" onClick={resume}>
                  Resume
                </button>
                <button className="finish-btn" onClick={leave}>
                  Finish
                </button>
              </div>
            )}
          </>
        )}
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
