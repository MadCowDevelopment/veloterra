import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Menu } from '../screens/Menu/Menu'
import { Ride } from '../screens/Ride/Ride'
import { Wallet } from '../screens/Wallet/Wallet'
import { Settings } from '../screens/Settings/Settings'
import { Offline } from '../screens/Offline/Offline'
import { RidesHistory } from '../screens/Rides/RidesHistory'
import { RideSummary } from '../screens/Rides/RideSummary'
import { Explore } from '../screens/Explore/Explore'
import { Teams } from '../screens/Teams/Teams'
import { useAuth } from '../state/auth'
import { syncNow } from '../lib/sync'
import { useProfile } from '../state/profile'
import { useTeams } from '../state/teams'

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
  const user = useAuth((s) => s.user)

  useEffect(() => {
    useAuth.getState().init()
  }, [])

  useEffect(() => {
    if (user) {
      void useProfile.getState().load()
      void useTeams.getState().load()
    } else {
      useProfile.getState().clear()
      useTeams.getState().clear()
    }
  }, [user])

  // Sync when a signed-in user is present and when the tab regains focus.
  useEffect(() => {
    if (!user) return
    syncNow()
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user])

  return (
    <>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/ride" element={<Ride />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamId" element={<Teams />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/offline" element={<Offline />} />
        <Route path="/rides" element={<RidesHistory />} />
        <Route path="/rides/:id" element={<RideSummary />} />
      </Routes>
      <time className="build-stamp" dateTime={__BUILD_TIMESTAMP__} title={`Built ${buildTime.toString()}`}>
        {buildLabel}
      </time>
    </>
  )
}
