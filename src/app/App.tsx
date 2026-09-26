import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Menu } from '../screens/Menu/Menu'
import { Ride } from '../screens/Ride/Ride'
import { Wallet } from '../screens/Wallet/Wallet'
import { Settings } from '../screens/Settings/Settings'
import { Offline } from '../screens/Offline/Offline'
import { RidesHistory } from '../screens/Rides/RidesHistory'
import { RideSummary } from '../screens/Rides/RideSummary'
import { Explore } from '../screens/Explore/Explore'
import { TeamHistory, Teams } from '../screens/Teams/Teams'
import { useAuth } from '../state/auth'
import { syncNow, useSync } from '../lib/sync'
import { useProfile } from '../state/profile'
import { useTeams } from '../state/teams'
import { dbReady, scopeForUser } from '../data/db'
import { useExplored } from '../state/explored'
import { useWallet } from '../state/wallet'

const buildTime = new Date(__BUILD_TIMESTAMP__)
const buildLabel = `${__BUILD_REVISION__} · ${buildTime.toLocaleString(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})}`

export function App() {
  const authReady = useAuth((s) => s.ready)
  const user = useAuth((s) => s.user)
  const authError = useAuth((s) => s.authError)
  const userId = user?.id ?? null
  const [readyScope, setReadyScope] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const expectedScope = scopeForUser(user?.id)
  const exploredScope = useExplored((state) => state.scope)
  const exploredLoaded = useExplored((state) => state.loaded)
  const walletScope = useWallet((state) => state.scope)
  const scopeReady = authReady
    && readyScope === expectedScope
    && exploredScope === expectedScope
    && exploredLoaded
    && walletScope === expectedScope

  useEffect(() => {
    useAuth.getState().init()
  }, [])

  useEffect(() => {
    let active = true
    const scope = scopeForUser(userId)
    setReadyScope(null)
    setStorageError(null)
    useProfile.getState().clear()
    useTeams.getState().clear()
    useSync.setState({ status: 'idle', lastSyncedAt: null })

    void dbReady
      .then(async () => {
        useWallet.getState().switchScope(scope)
        await useExplored.getState().switchScope(scope)
        if (
          active
          && useExplored.getState().scope === scope
          && useExplored.getState().loaded
          && useWallet.getState().scope === scope
        ) setReadyScope(scope)
      })
      .catch((error) => {
        if (!active) return
        setStorageError(error instanceof Error ? error.message : 'Local progress could not be loaded')
      })

    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!scopeReady) return
    if (userId) {
      void useProfile.getState().load()
      void useTeams.getState().load()
    }
  }, [scopeReady, userId])

  // Sync when a signed-in user is present and when the tab regains focus.
  useEffect(() => {
    if (!userId || !scopeReady) return
    void syncNow()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [scopeReady, userId])

  return (
    <>
      {authError && <div className="auth-error-banner" role="alert">{authError}</div>}
      {storageError && <div className="auth-error-banner" role="alert">{storageError}</div>}
      {scopeReady && (
        <Routes>
          <Route path="/" element={<Menu />} />
          <Route path="/ride" element={<Ride />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:teamId/history" element={<TeamHistory />} />
          <Route path="/teams/:teamId" element={<Teams />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/offline" element={<Offline />} />
          <Route path="/rides" element={<RidesHistory />} />
          <Route path="/rides/:id" element={<RideSummary />} />
        </Routes>
      )}
      <time className="build-stamp" dateTime={__BUILD_TIMESTAMP__} title={`Built ${buildTime.toString()}`}>
        {buildLabel}
      </time>
    </>
  )
}
