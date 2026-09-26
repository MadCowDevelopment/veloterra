import { useEffect, useMemo, useRef, useState } from 'react'
import { cellToLatLng } from 'h3-js'
import { Link, useSearchParams } from 'react-router-dom'
import { LandmarkPanel } from '../../components/LandmarkPanel'
import { MapStylePicker } from '../../components/MapStylePicker'
import { ExplorationMap } from '../../map/ExplorationMap'
import type { Landmark } from '../../domain/landmarks'
import { useAuth } from '../../state/auth'
import { useExplored } from '../../state/explored'
import { useLandmarks } from '../../state/landmarks'
import { useTeams } from '../../state/teams'
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
  const clearLandmarkError = useLandmarks((state) => state.clearError)
  const discoverAround = useLandmarks((state) => state.discoverAround)
  const subscribe = useLandmarks((state) => state.subscribe)
  const teams = useTeams((state) => state.teams)
  const selectedTeamId = useTeams((state) => state.selectedTeamId)
  const selectTeam = useTeams((state) => state.selectTeam)
  const teamCells = useTeams((state) => selectedTeamId ? state.cellsByTeam[selectedTeamId] ?? [] : [])
  const teamPresence = useTeams((state) => selectedTeamId ? state.presenceByTeam[selectedTeamId] ?? [] : [])
  const teamMembers = useTeams((state) => selectedTeamId ? state.membersByTeam[selectedTeamId] ?? [] : [])
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTeamId = searchParams.get('team')
  const [viewMode, setViewMode] = useState<'personal' | 'team'>(requestedTeamId ? 'team' : 'personal')
  const [teamMenuOpen, setTeamMenuOpen] = useState(false)
  const teamSelectRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = landmarks.find((landmark) => landmark.id === selectedId) ?? null
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null
  const memberNames = useMemo(() => new Map(teamMembers.map((member) => [member.userId, member])), [teamMembers])
  const presenceMarkers = useMemo(
    () => teamPresence.map((presence) => {
      const member = memberNames.get(presence.userId)
      return {
        id: presence.userId,
        latitude: presence.latitude,
        longitude: presence.longitude,
        label: member ? `${member.displayName}${member.username ? ` · @${member.username}` : ''}` : 'Team member',
      }
    }),
    [memberNames, teamPresence],
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!requestedTeamId) {
      setViewMode('personal')
      return
    }
    if (teams.some((team) => team.id === requestedTeamId)) {
      selectTeam(requestedTeamId)
      setViewMode('team')
    }
  }, [requestedTeamId, selectTeam, teams])

  useEffect(() => {
    if (!teamMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!teamSelectRef.current?.contains(event.target as Node)) setTeamMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [teamMenuOpen])

  useEffect(() => {
    if (!user) return
    return subscribe()
  }, [subscribe, user])

  useEffect(() => {
    if (!landmarkError) return
    const timeout = setTimeout(clearLandmarkError, 5000)
    return () => clearTimeout(timeout)
  }, [clearLandmarkError, landmarkError])

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
      <ExplorationMap
        selectedLandmarkId={selectedId}
        onSelectLandmark={(landmark: Landmark) => setSelectedId(landmark.id)}
        teamCells={viewMode === 'team' ? teamCells : undefined}
        teamView={viewMode === 'team'}
        presence={viewMode === 'team' ? presenceMarkers : undefined}
      />
      <header className="explore__header">
        <Link to="/" className="explore__back" aria-label="Back to menu">‹</Link>
        <div className="explore__title">
          <strong>{viewMode === 'team' ? selectedTeam?.name ?? 'Team map' : 'Explored world'}</strong>
          <span>{(viewMode === 'team' ? teamCells.length : revision >= 0 ? cellCount : 0).toLocaleString()} {viewMode === 'team' ? 'shared tiles' : 'hexes'}</span>
        </div>
      </header>
      <div className="explore__controls">
        <MapStylePicker />
      </div>
      <div
        ref={teamSelectRef}
        className="explore__source-select"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setTeamMenuOpen(false)
        }}
      >
        <label htmlFor="explore-source">Map source</label>
        <button
          id="explore-source"
          type="button"
          className="explore__source-select-trigger"
          aria-haspopup="listbox"
          aria-expanded={teamMenuOpen}
          aria-controls="explore-source-options"
          onClick={() => setTeamMenuOpen((open) => !open)}
        >
          <span>{viewMode === 'team' ? selectedTeam?.name ?? 'Choose a team' : 'Personal'}</span>
          <span className="explore__source-select-chevron" aria-hidden="true" />
        </button>
        {teamMenuOpen && (
          <div id="explore-source-options" className="explore__source-select-menu" role="listbox" aria-label="Map source">
            <button
              type="button"
              className={`explore__source-select-option${viewMode === 'personal' ? ' is-selected' : ''}`}
              role="option"
              aria-selected={viewMode === 'personal'}
              onClick={() => {
                setSearchParams({})
                setViewMode('personal')
                setTeamMenuOpen(false)
              }}
            >
              <span>Personal</span>
              {viewMode === 'personal' && <span aria-hidden="true">✓</span>}
            </button>
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={`explore__source-select-option${viewMode === 'team' && team.id === selectedTeam?.id ? ' is-selected' : ''}`}
                role="option"
                aria-selected={viewMode === 'team' && team.id === selectedTeam?.id}
                onClick={() => {
                  selectTeam(team.id)
                  setSearchParams({ team: team.id })
                  setViewMode('team')
                  setTeamMenuOpen(false)
                }}
              >
                <span>{team.name}</span>
                {viewMode === 'team' && team.id === selectedTeam?.id && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {user && landmarkError && (
        <div className="explore__landmark-status explore__landmark-status--error">{landmarkError}</div>
      )}
      {!user && <div className="explore__landmark-status">Sign in to see global restorations.</div>}
      {viewMode === 'team' && !selectedTeam && <div className="explore__empty">Join a team to open a shared map.</div>}
      {viewMode === 'personal' && cellCount === 0 && (
        <div className="explore__empty">Complete a ride to reveal your first place.</div>
      )}
      {selected && <LandmarkPanel landmark={selected} teamView={viewMode === 'team'} onClose={() => setSelectedId(null)} />}
    </div>
  )
}