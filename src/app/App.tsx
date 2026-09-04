import { Routes, Route } from 'react-router-dom'
import { Menu } from '../screens/Menu/Menu'
import { Ride } from '../screens/Ride/Ride'
import { Wallet } from '../screens/Wallet/Wallet'
import { Settings } from '../screens/Settings/Settings'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Menu />} />
      <Route path="/ride" element={<Ride />} />
      <Route path="/wallet" element={<Wallet />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  )
}
