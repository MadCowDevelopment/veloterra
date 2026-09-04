import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WalletState {
  balance: number
  totalDistanceM: number
  ridesCount: number
  add: (coins: number) => void
  addDistance: (meters: number) => void
  finishRide: () => void
}

// Foundation for the coin economy. In M0 the balance starts at 0;
// M3 wires real rewards into this store.
export const useWallet = create<WalletState>()(
  persist(
    (set) => ({
      balance: 0,
      totalDistanceM: 0,
      ridesCount: 0,
      add: (coins) => set((s) => ({ balance: s.balance + coins })),
      addDistance: (meters) => set((s) => ({ totalDistanceM: s.totalDistanceM + meters })),
      finishRide: () => set((s) => ({ ridesCount: s.ridesCount + 1 })),
    }),
    { name: 'veloterra-wallet' },
  ),
)
