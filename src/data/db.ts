import Dexie, { type Table } from 'dexie'
import type { Bounds } from '../lib/tiles'

export interface CellRow {
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
}

class VeloDB extends Dexie {
  cells!: Table<CellRow, string>
  regions!: Table<RegionRow, string>
  rides!: Table<RideRow, string>
  teamOutbox!: Table<TeamOutboxRow, string>

  constructor() {
    super('veloterra')
    this.version(1).stores({ cells: '&h3, lastVisited' })
    this.version(2).stores({ cells: '&h3, lastVisited', regions: '&id, createdAt' })
    this.version(3).stores({
      cells: '&h3, lastVisited',
      regions: '&id, createdAt',
      rides: '&id, startedAt',
    })
    this.version(4).stores({
      cells: '&h3, lastVisited',
      regions: '&id, createdAt',
      rides: '&id, startedAt',
      teamOutbox: '&id, teamId, userId, [teamId+userId], queuedAt',
    })
  }
}

export const db = new VeloDB()
