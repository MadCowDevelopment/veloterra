import { create } from 'zustand'
import { cellToParent, getResolution } from 'h3-js'
import { supabase } from './supabase'
import { db, dbReady, type RideRow } from '../data/db'
import { useWallet } from '../state/wallet'
import { useExplored } from '../state/explored'
import { useAuth } from '../state/auth'
import { useTeams } from '../state/teams'
import { HEX_RES } from '../domain/economy'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

export const useSync = create<{ status: SyncStatus; lastSyncedAt: number | null }>(() => ({
  status: 'idle',
  lastSyncedAt: null,
}))

interface RideCloudRow {
  id: string
  started_at: number
  ended_at: number
  duration_ms: number
  distance_m: number
  coins: number
  new_cells: number
  path: [number, number][] | null
  max_speed_kmh: number | null
}

function rideToRow(r: RideRow, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    started_at: r.startedAt,
    ended_at: r.endedAt,
    duration_ms: r.durationMs,
    distance_m: r.distanceM,
    coins: r.coins,
    new_cells: r.newCells,
    path: r.path ?? null,
    max_speed_kmh: r.maxSpeedKmh ?? null,
  }
}

function rowToRide(x: RideCloudRow, scope: string): RideRow {
  return {
    scope,
    id: x.id,
    startedAt: Number(x.started_at),
    endedAt: Number(x.ended_at),
    durationMs: Number(x.duration_ms),
    distanceM: Number(x.distance_m),
    coins: Number(x.coins),
    newCells: Number(x.new_cells),
    path: x.path ?? undefined,
    maxSpeedKmh: x.max_speed_kmh ?? undefined,
  }
}

let runningUserId: string | null = null
let runningSync: Promise<void> | null = null
let pendingUserId: string | null = null

function isActiveUser(userId: string): boolean {
  return useAuth.getState().user?.id === userId
    && useExplored.getState().scope === userId
    && useWallet.getState().scope === userId
}

function migrateH3(h3: string): string {
  return getResolution(h3) > HEX_RES ? cellToParent(h3, HEX_RES) : h3
}

/** Two-way merge of local (IndexedDB) and cloud (Supabase) progress. No-op when signed out. */
export async function syncNow(): Promise<void> {
  const user = useAuth.getState().user
  if (!user) return
  if (runningSync) {
    if (runningUserId !== user.id) {
      pendingUserId = user.id
      return
    }
    await runningSync
    return
  }
  if (!isActiveUser(user.id)) return
  runningUserId = user.id
  runningSync = (async () => {
    useSync.setState({ status: 'syncing' })
    const uid = user.id
    try {
      const nowIso = new Date().toISOString()
      await dbReady
      if (!isActiveUser(uid)) return
      if (await useExplored.getState().migrate()) await useExplored.getState().reload()
      if (!isActiveUser(uid)) return

    // --- Explored cells: union of h3 sets ---
    const localCells = await db.scopedCells.where('scope').equals(uid).toArray()
    const cellSet = new Set(localCells.map((c) => c.h3))
    const { data: exp, error: exploredReadError } = await supabase
      .from('explored')
      .select('cells')
      .eq('user_id', uid)
      .maybeSingle()
    if (exploredReadError) throw exploredReadError
    const cloudCells = ((exp?.cells as string[]) ?? []).map(migrateH3)
    const now = Date.now()
    const missing = cloudCells.filter((h3) => !cellSet.has(h3))
    for (const h3 of missing) cellSet.add(h3)
    if (missing.length) {
      await db.scopedCells.bulkPut(
        missing.map((h3) => ({ scope: uid, h3, firstVisited: now, lastVisited: now, visits: 1, coins: 0 })),
      )
    }
    if (!isActiveUser(uid)) return
    const { error: exploredWriteError } = await supabase
      .from('explored')
      .upsert({ user_id: uid, cells: [...cellSet], updated_at: nowIso })
    if (exploredWriteError) throw exploredWriteError
    if (missing.length) await useExplored.getState().reload()

    // --- Wallet: earnings merge monotonically; cloud spending is authoritative ---
    if (!isActiveUser(uid)) return
    const w = useWallet.getState()
    const { data: cw, error: walletError } = await supabase.rpc('sync_wallet_progress', {
      p_lifetime_earned: w.lifetimeEarned,
      p_total_distance_m: w.totalDistanceM,
      p_rides_count: w.ridesCount,
    })
    if (walletError) throw walletError
    if (!cw || !isActiveUser(uid)) return
    const lifetimeEarned = Number(cw.lifetime_earned)
    const spent = Number(cw.spent)
    useWallet.getState().applyCloudBalance(lifetimeEarned, spent)
    useWallet.getState().applyCloudProgress(Number(cw.total_distance_m), Number(cw.rides_count))

    // --- Rides: union by id ---
    if (!isActiveUser(uid)) return
    const localRides = await db.scopedRides.where('scope').equals(uid).toArray()
    const localIds = new Set(localRides.map((r) => r.id))
    const { data: cloudRides, error: rideReadError } = await supabase.from('rides').select('*').eq('user_id', uid)
    if (rideReadError) throw rideReadError
    const cloudArr = (cloudRides ?? []) as RideCloudRow[]
    const cloudIds = new Set(cloudArr.map((r) => r.id))
    const toPush = localRides.filter((r) => !cloudIds.has(r.id)).map((r) => rideToRow(r, uid))
    if (toPush.length) {
      const { error: rideWriteError } = await supabase.from('rides').upsert(toPush)
      if (rideWriteError) throw rideWriteError
    }
    const toPull = cloudArr.filter((r) => !localIds.has(r.id)).map((r) => rowToRide(r, uid))
    if (toPull.length) await db.scopedRides.bulkPut(toPull)

    if (!isActiveUser(uid)) return
    await useTeams.getState().sync()

      if (isActiveUser(uid)) useSync.setState({ status: 'synced', lastSyncedAt: Date.now() })
    } catch (error) {
      if (useAuth.getState().user?.id === user.id) useSync.setState({ status: 'error' })
      console.error('VeloTerra sync failed', error)
    }
  })()
  try {
    await runningSync
  } finally {
    runningUserId = null
    runningSync = null
    const nextUserId = pendingUserId
    pendingUserId = null
    if (nextUserId && useAuth.getState().user?.id === nextUserId) void syncNow()
  }
}
