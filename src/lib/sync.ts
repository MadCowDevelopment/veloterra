import { create } from 'zustand'
import { cellToParent, getResolution } from 'h3-js'
import { supabase } from './supabase'
import { db, type RideRow } from '../data/db'
import { useWallet } from '../state/wallet'
import { useExplored } from '../state/explored'
import { useAuth } from '../state/auth'
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

function rowToRide(x: RideCloudRow): RideRow {
  return {
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

let running = false

function migrateH3(h3: string): string {
  return getResolution(h3) > HEX_RES ? cellToParent(h3, HEX_RES) : h3
}

/** Two-way merge of local (IndexedDB) and cloud (Supabase) progress. No-op when signed out. */
export async function syncNow(): Promise<void> {
  const user = useAuth.getState().user
  if (!user || running) return
  running = true
  useSync.setState({ status: 'syncing' })
  try {
    const uid = user.id
    const nowIso = new Date().toISOString()
    await useExplored.getState().migrate()

    // --- Explored cells: union of h3 sets ---
    const localCells = await db.cells.toArray()
    const cellSet = new Set(localCells.map((c) => c.h3))
    const { data: exp } = await supabase
      .from('explored')
      .select('cells')
      .eq('user_id', uid)
      .maybeSingle()
    const cloudCells = ((exp?.cells as string[]) ?? []).map(migrateH3)
    const now = Date.now()
    const missing = cloudCells.filter((h3) => !cellSet.has(h3))
    for (const h3 of missing) cellSet.add(h3)
    if (missing.length) {
      await db.cells.bulkPut(
        missing.map((h3) => ({ h3, firstVisited: now, lastVisited: now, visits: 1, coins: 0 })),
      )
    }
    await supabase
      .from('explored')
      .upsert({ user_id: uid, cells: [...cellSet], updated_at: nowIso })
    if (missing.length) await useExplored.getState().reload()

    // --- Wallet: keep the larger of each accumulating counter ---
    const w = useWallet.getState()
    const { data: cw } = await supabase.from('wallet').select('*').eq('user_id', uid).maybeSingle()
    const balance = Math.max(w.balance, Number(cw?.balance ?? 0))
    const totalDistanceM = Math.max(w.totalDistanceM, Number(cw?.total_distance_m ?? 0))
    const ridesCount = Math.max(w.ridesCount, Number(cw?.rides_count ?? 0))
    useWallet.setState({ balance, totalDistanceM, ridesCount })
    await supabase.from('wallet').upsert({
      user_id: uid,
      balance,
      total_distance_m: totalDistanceM,
      rides_count: ridesCount,
      updated_at: nowIso,
    })

    // --- Rides: union by id ---
    const localRides = await db.rides.toArray()
    const localIds = new Set(localRides.map((r) => r.id))
    const { data: cloudRides } = await supabase.from('rides').select('*').eq('user_id', uid)
    const cloudArr = (cloudRides ?? []) as RideCloudRow[]
    const cloudIds = new Set(cloudArr.map((r) => r.id))
    const toPush = localRides.filter((r) => !cloudIds.has(r.id)).map((r) => rideToRow(r, uid))
    if (toPush.length) await supabase.from('rides').upsert(toPush)
    const toPull = cloudArr.filter((r) => !localIds.has(r.id)).map(rowToRide)
    if (toPull.length) await db.rides.bulkPut(toPull)

    useSync.setState({ status: 'synced', lastSyncedAt: Date.now() })
  } catch {
    useSync.setState({ status: 'error' })
  } finally {
    running = false
  }
}
