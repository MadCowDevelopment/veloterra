import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RideMap } from '../../map/RideMap'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useWakeLock } from '../../hooks/useWakeLock'
import { haversine, formatDistance, formatDuration, type LngLat } from '../../lib/geo'
import { useWallet } from '../../state/wallet'
import { useExplored } from '../../state/explored'
import { useLandmarks } from '../../state/landmarks'
import { MAX_ACCURACY_M } from '../../domain/economy'
import { CoinAmount } from '../../components/CoinAmount'
import { MapStylePicker } from '../../components/MapStylePicker'
import { addRide } from '../../lib/rides'
import { syncNow } from '../../lib/sync'
import { usePrefs } from '../../state/prefs'
import { useAuth } from '../../state/auth'
import { useTeams } from '../../state/teams'
import type { Team } from '../../domain/teams'
import './Ride.css'

type Phase = 'idle' | 'tracking' | 'paused'

interface CoinPop {
  id: number
  amount: number
}

export function Ride() {
  const navigate = useNavigate()
  const { fix, status, simulated, setSimulatedPosition } = useGeolocation({ enabled: true })

  const [phase, setPhase] = useState<Phase>('idle')
  useWakeLock(phase !== 'idle')

  const [distanceM, setDistanceM] = useState(0)
  const [coinsThisRide, setCoinsThisRide] = useState(0)
  const [newCellsThisRide, setNewCellsThisRide] = useState(0)
  const [pops, setPops] = useState<CoinPop[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [hudVisible, setHudVisible] = useState(true)
  const [liveShareEnabled, setLiveShareEnabled] = useState(false)
  const [liveTeamId, setLiveTeamId] = useState('')
  const headingUp = usePrefs((state) => state.headingUp)
  const setHeadingUp = usePrefs((state) => state.setHeadingUp)

  const runningSince = useRef<number | null>(null)
  const startedAt = useRef<number>(0)
  const lastPoint = useRef<LngLat | null>(null)
  const path = useRef<[number, number][]>([])
  const maxSpeed = useRef(0)
  const popId = useRef(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const lastPresenceSent = useRef(0)

  const user = useAuth((state) => state.user)
  const teams = useTeams((state) => state.teams)
  const selectedTeamId = useTeams((state) => state.selectedTeamId)
  const refreshTeam = useTeams((state) => state.refreshTeam)
  const sendPresence = useTeams((state) => state.sendPresence)
  const stopPresence = useTeams((state) => state.stopPresence)
  const liveTeam = teams.find((team) => team.id === liveTeamId) ?? null
  const liveTeamPresence = useTeams((state) => liveTeamId ? state.presenceByTeam[liveTeamId] ?? [] : [])
  const liveTeamMembers = useTeams((state) => liveTeamId ? state.membersByTeam[liveTeamId] ?? [] : [])
  const livePresence = useMemo(() => {
    const members = new Map(liveTeamMembers.map((member) => [member.userId, member]))
    return liveTeamPresence
      .filter((presence) => presence.userId !== user?.id)
      .map((presence) => {
        const member = members.get(presence.userId)
        return {
          id: presence.userId,
          latitude: presence.latitude,
          longitude: presence.longitude,
          label: member?.username ? `@${member.username}` : 'Team member',
        }
      })
  }, [liveTeamMembers, liveTeamPresence, user?.id])
  const addCoins = useWallet((s) => s.add)
  const addDistance = useWallet((s) => s.addDistance)
  const finishRideStat = useWallet((s) => s.finishRide)
  const loadExplored = useExplored((s) => s.load)
  const reveal = useExplored((s) => s.reveal)
  const discoverLandmarks = useLandmarks((s) => s.discoverAround)
  const landmarks = useLandmarks((s) => s.landmarks)

  // Load previously explored cells so the fog reflects past rides.
  useEffect(() => {
    loadExplored()
  }, [loadExplored])

  useEffect(() => {
    if (liveTeamId && teams.some((team) => team.id === liveTeamId)) return
    setLiveTeamId(selectedTeamId && teams.some((team) => team.id === selectedTeamId) ? selectedTeamId : teams[0]?.id ?? '')
  }, [liveTeamId, selectedTeamId, teams])

  useEffect(() => {
    if (!user || !liveTeamId) return
    void refreshTeam(liveTeamId)
    const timer = window.setInterval(() => void refreshTeam(liveTeamId), 15_000)
    return () => window.clearInterval(timer)
  }, [liveTeamId, refreshTeam, user])

  // Tick the clock.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Only accumulate distance, reveal fog and award coins while tracking.
  useEffect(() => {
    if (phase !== 'tracking' || !fix || fix.accuracy > MAX_ACCURACY_M) return

    const point = { lng: fix.lng, lat: fix.lat }
    if (fix.speed != null && fix.speed >= 0) {
      const kmh = fix.speed * 3.6
      if (kmh > maxSpeed.current) maxSpeed.current = kmh
    }
    if (lastPoint.current) {
      const step = haversine(lastPoint.current, point)
      if (step >= 3 && step < 300) {
        setDistanceM((d) => d + step)
        addDistance(step)
        path.current.push([point.lng, point.lat])
      }
    } else {
      path.current.push([point.lng, point.lat]) // first point of a segment
    }
    lastPoint.current = point

    const { coins, newCells } = reveal(fix)
    if (newCells > 0) {
      setNewCellsThisRide((n) => n + newCells)
      if (!simulated) void discoverLandmarks(fix.lat, fix.lng)
    }
    if (coins > 0) {
      addCoins(coins)
      setCoinsThisRide((c) => c + coins)
      const id = ++popId.current
      setPops((p) => [...p, { id, amount: coins }])
      setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1100)
    }
  }, [fix, phase, reveal, addCoins, addDistance, discoverLandmarks, simulated])

  useEffect(() => {
    if (!liveShareEnabled || !liveTeamId || phase !== 'tracking' || !fix || !user) return
    if (Date.now() - lastPresenceSent.current < 10_000) return
    lastPresenceSent.current = Date.now()
    void sendPresence(liveTeamId, fix.lat, fix.lng).catch(() => {
      setLiveShareEnabled(false)
    })
  }, [fix, liveShareEnabled, liveTeamId, phase, sendPresence, user])

  useEffect(() => {
    if (!liveShareEnabled || liveTeam) return
    setLiveShareEnabled(false)
    if (liveTeamId) void stopPresence(liveTeamId).catch(() => undefined)
  }, [liveShareEnabled, liveTeam, liveTeamId, stopPresence])

  const elapsed =
    elapsedMs +
    (phase === 'tracking' && runningSince.current
      ? Math.max(0, now - runningSince.current)
      : 0)

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

  useEffect(() => () => {
    if (liveShareEnabled && liveTeamId) void stopPresence(liveTeamId)
  }, [liveShareEnabled, liveTeamId, stopPresence, user])

  const start = () => {
    startedAt.current = Date.now()
    runningSince.current = Date.now()
    lastPoint.current = null
    path.current = []
    maxSpeed.current = 0
    setLiveShareEnabled(false)
    lastPresenceSent.current = 0
    setPhase('tracking')
  }

  const pause = () => {
    const since = runningSince.current
    if (since) setElapsedMs((e) => e + (Date.now() - since))
    runningSince.current = null
    if (liveShareEnabled && liveTeamId) {
      void stopPresence(liveTeamId).catch(() => undefined)
      setLiveShareEnabled(false)
    }
    setPhase('paused')
  }

  const resume = () => {
    runningSince.current = Date.now()
    lastPoint.current = null // don't count the gap while paused
    setPhase('tracking')
  }

  const leave = async () => {
    if (liveShareEnabled && liveTeamId) {
      await stopPresence(liveTeamId).catch(() => undefined)
      setLiveShareEnabled(false)
    }
    if (phase !== 'idle') {
      const durationMs =
        elapsedMs + (runningSince.current ? Date.now() - runningSince.current : 0)
      finishRideStat()
      const id = await addRide({
        startedAt: startedAt.current,
        endedAt: Date.now(),
        durationMs,
        distanceM,
        coins: coinsThisRide,
        newCells: newCellsThisRide,
        path: path.current,
        maxSpeedKmh: Math.round(maxSpeed.current * 10) / 10,
      })
      if (!simulated) syncNow() // simulated progress must stay local
      navigate(`/rides/${id}`)
      return
    }
    navigate('/')
  }

  const toggleLiveSharing = async () => {
    if (!liveTeamId || !user) return
    if (liveShareEnabled) {
      await stopPresence(liveTeamId).catch(() => undefined)
      setLiveShareEnabled(false)
      return
    }
    setLiveShareEnabled(true)
    lastPresenceSent.current = 0
  }

  const changeLiveTeam = async (teamId: string) => {
    if (liveShareEnabled && liveTeamId) await stopPresence(liveTeamId).catch(() => undefined)
    setLiveTeamId(teamId)
    setLiveShareEnabled(false)
    lastPresenceSent.current = 0
  }

  const hidden = hudVisible ? '' : ' is-hidden'
  const gpsReady = status === 'tracking'

  return (
    <div className="ride" onPointerDown={revealHud}>
      <RideMap
        fix={fix}
        follow={phase === 'tracking'}
        headingUp={headingUp}
        path={[...path.current]}
        landmarks={landmarks}
        presence={livePresence}
        onPositionPick={simulated ? setSimulatedPosition : undefined}
      />

      <div className={`ride__hud ride__hud--top${hidden}`}>
        <button className="pill-btn" onClick={leave} aria-label="Back to menu">
          ✕
        </button>
        <div className="ride__top-right">
          <StatusBadge status={status} accuracy={fix?.accuracy} simulated={simulated} />
          <button
            className={`pill-btn heading-btn${headingUp ? ' is-active' : ''}`}
            onClick={() => setHeadingUp(!headingUp)}
            aria-label="Keep direction of travel up"
            aria-pressed={headingUp}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3 11 19-9-9 19-2-8-8-2Z" />
            </svg>
          </button>
          <MapStylePicker />
        </div>
      </div>

      <div className={`ride__hud ride__hud--bottom${hidden}`}>
        {phase === 'idle' ? (
          <>
            <div className="ride__hint">
              {simulated ? 'Click the map to place the rider.' : 'Look around the map, then start your ride.'}
            </div>
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
            {user && teams.length > 0 && liveTeam && (
              <LiveShareControl
                team={liveTeam}
                teams={teams}
                enabled={liveShareEnabled}
                onToggle={() => void toggleLiveSharing()}
                onTeamChange={(teamId) => void changeLiveTeam(teamId)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  accuracy,
  simulated,
}: {
  status: string
  accuracy?: number
  simulated: boolean
}) {
  const label =
    simulated
      ? 'Simulated GPS'
      : status === 'tracking'
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
    <div className={`gps-badge ${ok ? 'gps-badge--ok' : ''}${simulated ? ' gps-badge--simulated' : ''}`}>
      <span className="gps-badge__dot" />
      {label}
    </div>
  )
}

function LiveShareControl({
  team,
  teams,
  enabled,
  onToggle,
  onTeamChange,
}: {
  team: Team
  teams: Team[]
  enabled: boolean
  onToggle: () => void
  onTeamChange: (teamId: string) => void
}) {
  return (
    <div className={`live-share${enabled ? ' live-share--active' : ''}`}>
      {teams.length > 1 && (
        <select value={team.id} onChange={(event) => onTeamChange(event.target.value)} aria-label="Team that can see the live position">
          {teams.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      )}
      <label className="live-share__toggle">
        <span>Share live position with {team.name}</span>
        <input type="checkbox" checked={enabled} onChange={onToggle} />
        <i aria-hidden="true" />
      </label>
    </div>
  )
}
