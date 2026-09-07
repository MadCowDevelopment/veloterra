import { Routes, Route } from 'react-router-dom'
import { Menu } from '../screens/Menu/Menu'
import { Ride } from '../screens/Ride/Ride'
import { Wallet } from '../screens/Wallet/Wallet'
import { Settings } from '../screens/Settings/Settings'
import { Offline } from '../screens/Offline/Offline'
import { RidesHistory } from '../screens/Rides/RidesHistory'
import { RideSummary } from '../screens/Rides/RideSummary'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Menu />} />
      <Route path="/ride" element={<Ride />} />
      <Route path="/wallet" element={<Wallet />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/offline" element={<Offline />} />
      <Route path="/rides" element={<RidesHistory />} />
      <Route path="/rides/:id" element={<RideSummary />} />
    </Routes>
  )
}
