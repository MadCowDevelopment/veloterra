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
}

class VeloDB extends Dexie {
  cells!: Table<CellRow, string>
  regions!: Table<RegionRow, string>
  rides!: Table<RideRow, string>

  constructor() {
    super('veloterra')
    this.version(1).stores({ cells: '&h3, lastVisited' })
    this.version(2).stores({ cells: '&h3, lastVisited', regions: '&id, createdAt' })
    this.version(3).stores({
      cells: '&h3, lastVisited',
      regions: '&id, createdAt',
      rides: '&id, startedAt',
    })
  }
}

export const db = new VeloDB()
