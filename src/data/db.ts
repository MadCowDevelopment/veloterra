import Dexie, { type Table } from 'dexie'
import type { Bounds } from '../lib/tiles'

export const LOCAL_UNASSIGNED_SCOPE = 'unassigned'
const LEGACY_DB_NAME = 'veloterra'
const LOCAL_DB_NAME = 'veloterra-local'
const MIGRATION_KEY = 'legacy-veloterra-v1'

export function scopeForUser(userId: string | null | undefined): string {
  return userId ?? LOCAL_UNASSIGNED_SCOPE
}

export interface CellRow {
  scope: string
  h3: string
  firstVisited: number
  lastVisited: number
  visits: number
  coins: number
}

export interface RegionRow {
  id: string
  name: string
  bounds: Bounds
  urls: string[]
  bytes: number
  tiles: number
  createdAt: number
}

export interface RideRow {
  scope: string
  id: string
  startedAt: number
  endedAt: number
  durationMs: number
  distanceM: number
  coins: number // copper earned this ride
  newCells: number // tiles first revealed this ride
  path?: [number, number][] // [lng, lat] track, downsampled
  maxSpeedKmh?: number
}

export interface TeamOutboxRow {
  id: string
  teamId: string
  userId: string
  h3: string
  queuedAt: number
  syncedAt?: number
}

interface LegacyCellRow extends Omit<CellRow, 'scope'> {
  scope?: string
}

interface LegacyRideRow extends Omit<RideRow, 'scope'> {
  scope?: string
}

interface MetaRow {
  key: string
  value: unknown
}

class VeloDB extends Dexie {
  scopedCells!: Table<CellRow, [string, string]>
  regions!: Table<RegionRow, string>
  scopedRides!: Table<RideRow, [string, string]>
  teamOutbox!: Table<TeamOutboxRow, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super(LOCAL_DB_NAME)
    this.version(3).stores({
      scopedCells: '&[scope+h3], scope, h3, lastVisited',
      regions: '&id, createdAt',
      scopedRides: '&[scope+id], scope, id, [scope+startedAt]',
    })
    this.version(4).stores({
      scopedCells: '&[scope+h3], scope, h3, lastVisited',
      regions: '&id, createdAt',
      scopedRides: '&[scope+id], scope, id, [scope+startedAt]',
      teamOutbox: '&id, teamId, userId, [teamId+userId], queuedAt',
    })
    this.version(5).stores({
      scopedCells: '&[scope+h3], scope, h3, lastVisited',
      regions: '&id, createdAt',
      scopedRides: '&[scope+id], scope, id, [scope+startedAt]',
      teamOutbox: '&id, teamId, userId, [teamId+userId], queuedAt',
      meta: '&key',
    })
  }
}

export const db = new VeloDB()

function importedScope(_scope: unknown): string {
  return LOCAL_UNASSIGNED_SCOPE
}

function mergeCell(target: CellRow, source: LegacyCellRow, scope: string): CellRow {
  return {
    scope,
    h3: source.h3,
    firstVisited: Math.min(target.firstVisited, source.firstVisited),
    lastVisited: Math.max(target.lastVisited, source.lastVisited),
    visits: target.visits + source.visits,
    coins: target.coins + source.coins,
  }
}

function mergeRide(target: RideRow | undefined, source: LegacyRideRow, scope: string): RideRow {
  if (!target) return { ...source, scope }
  return {
    ...target,
    scope,
    path: target.path?.length ? target.path : source.path,
    maxSpeedKmh: target.maxSpeedKmh ?? source.maxSpeedKmh,
  }
}

async function legacyRows(legacy: Dexie, tableName: string): Promise<unknown[]> {
  if (!legacy.tables.some((table) => table.name === tableName)) return []
  return legacy.table(tableName).toArray()
}

async function migrateLegacyStorage(): Promise<void> {
  await db.open()
  if (await db.meta.get(MIGRATION_KEY)) return

  const cellRows = new Map<string, CellRow>()
  const rideRows = new Map<string, RideRow>()
  let regions: RegionRow[] = []
  let outbox: TeamOutboxRow[] = []
  const hasLegacyDatabase = await Dexie.exists(LEGACY_DB_NAME)

  if (hasLegacyDatabase) {
    const legacy = new Dexie(LEGACY_DB_NAME)
    try {
      await legacy.open()
      for (const value of await legacyRows(legacy, 'cells')) {
        const row = value as LegacyCellRow
        if (!row.h3) continue
        const scope = importedScope(row.scope)
        const key = `${scope}\u0000${row.h3}`
        const existing = cellRows.get(key)
        cellRows.set(key, existing ? mergeCell(existing, row, scope) : { ...row, scope })
      }
      for (const value of await legacyRows(legacy, 'rides')) {
        const row = value as LegacyRideRow
        if (!row.id) continue
        const scope = importedScope(row.scope)
        const key = `${scope}\u0000${row.id}`
        rideRows.set(key, mergeRide(rideRows.get(key), row, scope))
      }
      regions = await legacyRows(legacy, 'regions') as RegionRow[]
      outbox = await legacyRows(legacy, 'teamOutbox') as TeamOutboxRow[]
    } finally {
      legacy.close()
    }
  }

  await db.transaction('rw', db.scopedCells, db.scopedRides, db.regions, db.teamOutbox, db.meta, async () => {
    if (await db.meta.get(MIGRATION_KEY)) return
    if (cellRows.size) await db.scopedCells.bulkPut([...cellRows.values()])
    if (rideRows.size) await db.scopedRides.bulkPut([...rideRows.values()])
    if (regions.length) await db.regions.bulkPut(regions)
    if (outbox.length) await db.teamOutbox.bulkPut(outbox)
    await db.meta.put({
      key: MIGRATION_KEY,
      value: { migratedAt: Date.now(), sourceDatabaseFound: hasLegacyDatabase },
    })
  })
}

export const dbReady = migrateLegacyStorage()
