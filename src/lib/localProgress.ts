import { db, dbReady, LOCAL_UNASSIGNED_SCOPE, type CellRow, type RideRow } from '../data/db'
import { useAuth } from '../state/auth'
import { useExplored } from '../state/explored'
import { useWallet, type WalletSnapshot } from '../state/wallet'

const CLAIM_STATE_KEY = 'veloterra-progress-claims'

interface ClaimState {
  initialResolved: boolean
}

export interface LocalProgressSummary {
  cellCount: number
  rideCount: number
  wallet: WalletSnapshot
  hasAny: boolean
}

function readClaimState(): ClaimState {
  try {
    const raw = window.localStorage.getItem(CLAIM_STATE_KEY)
    if (!raw) return { initialResolved: false }
    const parsed = JSON.parse(raw) as Partial<ClaimState>
    return { initialResolved: parsed.initialResolved === true }
  } catch {
    return { initialResolved: false }
  }
}

function writeClaimState(state: ClaimState): void {
  window.localStorage.setItem(CLAIM_STATE_KEY, JSON.stringify(state))
}

export function isInitialClaimResolved(): boolean {
  return readClaimState().initialResolved
}

export function resolveInitialClaim(): void {
  writeClaimState({ initialResolved: true })
}

export async function getUnassignedProgress(): Promise<LocalProgressSummary> {
  await dbReady
  const [cellCount, rideCount] = await Promise.all([
    db.scopedCells.where('scope').equals(LOCAL_UNASSIGNED_SCOPE).count(),
    db.scopedRides.where('scope').equals(LOCAL_UNASSIGNED_SCOPE).count(),
  ])
  const wallet = useWallet.getState().getSnapshot(LOCAL_UNASSIGNED_SCOPE)
  return {
    cellCount,
    rideCount,
    wallet,
    hasAny: cellCount > 0
      || rideCount > 0
      || wallet.balance > 0
      || wallet.lifetimeEarned > 0
      || wallet.totalDistanceM > 0
      || wallet.ridesCount > 0,
  }
}

function mergeCells(source: CellRow[], target: CellRow[], targetScope: string): CellRow[] {
  const merged = new Map(target.map((row) => [row.h3, { ...row }]))
  for (const sourceRow of source) {
    const targetRow = merged.get(sourceRow.h3)
    if (!targetRow) {
      merged.set(sourceRow.h3, { ...sourceRow, scope: targetScope })
      continue
    }
    targetRow.firstVisited = Math.min(targetRow.firstVisited, sourceRow.firstVisited)
    targetRow.lastVisited = Math.max(targetRow.lastVisited, sourceRow.lastVisited)
    targetRow.visits += sourceRow.visits
    targetRow.coins += sourceRow.coins
  }
  return [...merged.values()]
}

function mergeRide(target: RideRow | undefined, source: RideRow, targetScope: string): RideRow {
  if (!target) return { ...source, scope: targetScope }
  return {
    ...target,
    scope: targetScope,
    path: target.path?.length ? target.path : source.path,
    maxSpeedKmh: target.maxSpeedKmh ?? source.maxSpeedKmh,
  }
}

let claimRunning = false

export async function claimUnassignedProgress(
  targetScope: string,
  mode: 'initial' | 'additional',
): Promise<void> {
  if (!targetScope || targetScope === LOCAL_UNASSIGNED_SCOPE) throw new Error('Invalid account scope')
  if (useAuth.getState().user?.id !== targetScope) throw new Error('The active account changed')
  if (mode === 'initial' && isInitialClaimResolved()) throw new Error('Initial local progress was already resolved')
  if (claimRunning) return
  claimRunning = true
  try {
    await dbReady
    await db.transaction('rw', db.scopedCells, db.scopedRides, async () => {
      const ensureActiveTarget = () => {
        if (useAuth.getState().user?.id !== targetScope) throw new Error('The active account changed')
      }
      ensureActiveTarget()
      const [sourceCells, targetCells, sourceRides, targetRides] = await Promise.all([
        db.scopedCells.where('scope').equals(LOCAL_UNASSIGNED_SCOPE).toArray(),
        db.scopedCells.where('scope').equals(targetScope).toArray(),
        db.scopedRides.where('scope').equals(LOCAL_UNASSIGNED_SCOPE).toArray(),
        db.scopedRides.where('scope').equals(targetScope).toArray(),
      ])
      ensureActiveTarget()

      const ridesById = new Map(targetRides.map((ride) => [ride.id, ride]))
      for (const sourceRide of sourceRides) {
        ridesById.set(sourceRide.id, mergeRide(ridesById.get(sourceRide.id), sourceRide, targetScope))
      }

      const mergedCells = mergeCells(sourceCells, targetCells, targetScope)
      ensureActiveTarget()
      if (mergedCells.length) await db.scopedCells.bulkPut(mergedCells)
      if (ridesById.size) await db.scopedRides.bulkPut([...ridesById.values()])
      ensureActiveTarget()
      if (sourceCells.length) await db.scopedCells.where('scope').equals(LOCAL_UNASSIGNED_SCOPE).delete()
      if (sourceRides.length) await db.scopedRides.where('scope').equals(LOCAL_UNASSIGNED_SCOPE).delete()
    })

    useWallet.getState().claimScope(LOCAL_UNASSIGNED_SCOPE, targetScope, mode)
    if (useExplored.getState().scope === targetScope) await useExplored.getState().reload()
    if (mode === 'initial') resolveInitialClaim()
  } finally {
    claimRunning = false
  }
}
