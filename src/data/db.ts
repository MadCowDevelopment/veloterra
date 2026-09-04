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

class VeloDB extends Dexie {
  cells!: Table<CellRow, string>
  regions!: Table<RegionRow, string>

  constructor() {
    super('veloterra')
    this.version(1).stores({ cells: '&h3, lastVisited' })
    this.version(2).stores({ cells: '&h3, lastVisited', regions: '&id, createdAt' })
  }
}

export const db = new VeloDB()
