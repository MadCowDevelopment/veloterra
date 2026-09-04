import Dexie, { type Table } from 'dexie'

export interface CellRow {
  h3: string
  firstVisited: number
  lastVisited: number
  visits: number
  coins: number
}

class VeloDB extends Dexie {
  cells!: Table<CellRow, string>

  constructor() {
    super('veloterra')
    this.version(1).stores({ cells: '&h3, lastVisited' })
  }
}

export const db = new VeloDB()
