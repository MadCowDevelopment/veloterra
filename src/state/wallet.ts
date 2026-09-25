import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WalletState {
  balance: number
  lifetimeEarned: number
  spent: number
  totalDistanceM: number
  ridesCount: number
  add: (coins: number) => void
  applyCloudBalance: (lifetimeEarned: number, spent: number) => void
  addDistance: (meters: number) => void
  finishRide: () => void
  reset: () => void
}

// Foundation for the coin economy. In M0 the balance starts at 0;
// M3 wires real rewards into this store.
export const useWallet = create<WalletState>()(
  persist(
    (set) => ({
      balance: 0,
      lifetimeEarned: 0,
      spent: 0,
      totalDistanceM: 0,
      ridesCount: 0,
      add: (coins) => set((state) => ({
        balance: state.balance + coins,
        lifetimeEarned: state.lifetimeEarned + coins,
      })),
      applyCloudBalance: (lifetimeEarned, spent) => set({
        lifetimeEarned,
        spent,
        balance: Math.max(0, lifetimeEarned - spent),
      }),
      addDistance: (meters) => set((s) => ({ totalDistanceM: s.totalDistanceM + meters })),
      finishRide: () => set((s) => ({ ridesCount: s.ridesCount + 1 })),
      reset: () => set({ balance: 0, lifetimeEarned: 0, spent: 0, totalDistanceM: 0, ridesCount: 0 }),
    }),
    {
      name: 'veloterra-wallet',
      version: 2,
      migrate: (persisted) => {
        const wallet = persisted as Partial<WalletState>
        return {
          ...wallet,
          lifetimeEarned: wallet.lifetimeEarned ?? wallet.balance ?? 0,
          spent: wallet.spent ?? 0,
        } as WalletState
      },
    },
  ),
)
