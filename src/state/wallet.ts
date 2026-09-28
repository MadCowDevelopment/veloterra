import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LOCAL_UNASSIGNED_SCOPE } from '../data/db'

export interface WalletSnapshot {
  balance: number
  lifetimeEarned: number
  spent: number
  totalDistanceM: number
  ridesCount: number
}

interface WalletState extends WalletSnapshot {
  scope: string
  accounts: Record<string, WalletSnapshot>
  switchScope: (scope: string) => void
  getSnapshot: (scope?: string) => WalletSnapshot
  claimScope: (source: string, target: string, mode: 'initial' | 'additional') => void
  add: (coins: number) => void
  applyCloudBalance: (lifetimeEarned: number, spent: number) => void
  applyCloudProgress: (totalDistanceM: number, ridesCount: number) => void
  addDistance: (meters: number) => void
  finishRide: () => void
  reset: () => void
}

const emptyWallet = (): WalletSnapshot => ({
  balance: 0,
  lifetimeEarned: 0,
  spent: 0,
  totalDistanceM: 0,
  ridesCount: 0,
})

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizeWallet(value: Partial<WalletSnapshot> | undefined): WalletSnapshot {
  return {
    balance: numberValue(value?.balance),
    lifetimeEarned: numberValue(value?.lifetimeEarned, numberValue(value?.balance)),
    spent: numberValue(value?.spent),
    totalDistanceM: numberValue(value?.totalDistanceM),
    ridesCount: numberValue(value?.ridesCount),
  }
}

function reconcileWallet(left: WalletSnapshot, right: WalletSnapshot): WalletSnapshot {
  const lifetimeEarned = Math.max(left.lifetimeEarned, right.lifetimeEarned)
  const spent = Math.max(left.spent, right.spent)
  return {
    lifetimeEarned,
    spent,
    balance: Math.max(0, lifetimeEarned - spent),
    totalDistanceM: Math.max(left.totalDistanceM, right.totalDistanceM),
    ridesCount: Math.max(left.ridesCount, right.ridesCount),
  }
}

function addWallet(left: WalletSnapshot, right: WalletSnapshot): WalletSnapshot {
  return {
    lifetimeEarned: left.lifetimeEarned + right.lifetimeEarned,
    spent: left.spent + right.spent,
    balance: left.balance + right.balance,
    totalDistanceM: left.totalDistanceM + right.totalDistanceM,
    ridesCount: left.ridesCount + right.ridesCount,
  }
}

function normalizeAccounts(value: unknown): Record<string, WalletSnapshot> {
  if (!value || typeof value !== 'object') return {}
  const accounts: Record<string, WalletSnapshot> = {}
  for (const [rawScope, wallet] of Object.entries(value as Record<string, Partial<WalletSnapshot>>)) {
    const scope = rawScope === 'guest' ? LOCAL_UNASSIGNED_SCOPE : rawScope
    accounts[scope] = accounts[scope]
      ? reconcileWallet(accounts[scope], normalizeWallet(wallet))
      : normalizeWallet(wallet)
  }
  return accounts
}

function snapshotOf(state: WalletState): WalletSnapshot {
  return {
    balance: state.balance,
    lifetimeEarned: state.lifetimeEarned,
    spent: state.spent,
    totalDistanceM: state.totalDistanceM,
    ridesCount: state.ridesCount,
  }
}

function withWallet(state: WalletState, wallet: WalletSnapshot) {
  return {
    ...wallet,
    accounts: { ...state.accounts, [state.scope]: wallet },
  }
}

// Foundation for the coin economy. In M0 the balance starts at 0;
// M3 wires real rewards into this store.
export const useWallet = create<WalletState>()(
  persist(
    (set, get) => ({
      ...emptyWallet(),
      scope: LOCAL_UNASSIGNED_SCOPE,
      accounts: { [LOCAL_UNASSIGNED_SCOPE]: emptyWallet() } as Record<string, WalletSnapshot>,
      switchScope: (scope) => set((state) => {
        const accounts = { ...state.accounts, [state.scope]: snapshotOf(state) }
        const next = normalizeWallet(accounts[scope])
        return { scope, ...next, accounts: { ...accounts, [scope]: next } }
      }),
      getSnapshot: (scope): WalletSnapshot => {
        const state = get()
        const requestedScope = scope ?? state.scope
        return requestedScope === state.scope
          ? snapshotOf(state)
          : normalizeWallet(state.accounts[requestedScope])
      },
      claimScope: (source, target, mode) => set((state) => {
        if (source === target) return state
        const accounts = { ...state.accounts, [state.scope]: snapshotOf(state) }
        const sourceWallet = normalizeWallet(accounts[source])
        const targetWallet = normalizeWallet(accounts[target])
        const merged = mode === 'initial'
          ? reconcileWallet(targetWallet, sourceWallet)
          : addWallet(targetWallet, sourceWallet)
        accounts[target] = merged
        accounts[source] = emptyWallet()
        return state.scope === target
          ? { ...merged, accounts }
          : { accounts }
      }),
      add: (coins) => set((state) => withWallet(state, {
        ...normalizeWallet(state),
        balance: state.balance + coins,
        lifetimeEarned: state.lifetimeEarned + coins,
      })),
      applyCloudBalance: (lifetimeEarned, spent) => set((state) => withWallet(state, {
        ...normalizeWallet(state),
        lifetimeEarned,
        spent,
        balance: Math.max(0, lifetimeEarned - spent),
      })),
      applyCloudProgress: (totalDistanceM, ridesCount) => set((state) => withWallet(state, {
        ...normalizeWallet(state),
        totalDistanceM,
        ridesCount,
      })),
      addDistance: (meters) => set((state) => withWallet(state, {
        ...normalizeWallet(state),
        totalDistanceM: state.totalDistanceM + meters,
      })),
      finishRide: () => set((state) => withWallet(state, {
        ...normalizeWallet(state),
        ridesCount: state.ridesCount + 1,
      })),
      reset: () => set((state) => withWallet(state, emptyWallet())),
    }),
    {
      name: 'veloterra-wallet',
      version: 4,
      partialize: (state) => ({ accounts: state.accounts }),
      migrate: (persisted) => {
        const wallet = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<WalletState> & { accounts?: unknown }
        const accounts = normalizeAccounts(wallet.accounts)
        return {
          accounts: Object.keys(accounts).length
            ? accounts
            : { [LOCAL_UNASSIGNED_SCOPE]: normalizeWallet(wallet) },
        }
      },
      merge: (persisted, current) => {
        const persistedState = (persisted && typeof persisted === 'object' ? persisted : {}) as { accounts?: unknown }
        const accounts = normalizeAccounts(persistedState.accounts)
        const wallet = accounts[current.scope] ?? emptyWallet()
        return { ...current, ...wallet, accounts }
      },
    },
  ),
)
