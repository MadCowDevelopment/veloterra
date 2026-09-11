import { create } from 'zustand'
import { cellToParent, getResolution, gridDisk, latLngToCell } from 'h3-js'
import { db, type CellRow } from '../data/db'
import {
  HEX_RES,
  REVEAL_K,
  NEW_CELL_COINS,
  REVISIT_COINS,
  REVISIT_COOLDOWN_MS,
} from '../domain/economy'
import type { GeoFix } from '../hooks/useGeolocation'

export interface RevealResult {
  coins: number
  newCells: number
}

async function migrateLegacyCells(): Promise<boolean> {
  const rows = await db.cells.toArray()
  const legacyRows = rows.filter((row) => getResolution(row.h3) > HEX_RES)
  if (!legacyRows.length) return false

  const migrated = new Map<string, CellRow>()
  for (const row of rows) {
    const h3 = getResolution(row.h3) > HEX_RES ? cellToParent(row.h3, HEX_RES) : row.h3
    const existing = migrated.get(h3)
    if (!existing) {
      migrated.set(h3, { ...row, h3 })
      continue
    }
    existing.firstVisited = Math.min(existing.firstVisited, row.firstVisited)
    existing.lastVisited = Math.max(existing.lastVisited, row.lastVisited)
    existing.visits += row.visits
    existing.coins += row.coins
  }

  await db.transaction('rw', db.cells, async () => {
    await db.cells.clear()
    await db.cells.bulkPut([...migrated.values()])
  })
  return true
}

interface ExploredState {
  cells: Map<string, CellRow>
  revision: number // bumps only when the explored geometry changes (new cells)
  loaded: boolean
  load: () => Promise<void>
  migrate: () => Promise<boolean>
  reveal: (fix: GeoFix) => RevealResult
  reset: () => Promise<void>
  reload: () => Promise<void>
}

// The in-memory cell map is mutated in place for performance; `revision` signals
// geometry changes to subscribers (the fog layer). Rewards persist to IndexedDB.
export const useExplored = create<ExploredState>((set, get) => ({
  cells: new Map(),
  revision: 0,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    await get().migrate()
    if (get().loaded) return
    const rows = await db.cells.toArray()
    const map = new Map<string, CellRow>()
    for (const r of rows) map.set(r.h3, r)
    set({ cells: map, loaded: true, revision: get().revision + 1 })
  },

  migrate: async () => {
    if (!await migrateLegacyCells()) return false
    await get().reload()
    return true
  },

  reveal: (fix) => {
    const { cells } = get()
    const now = fix.timestamp || Date.now()
    const center = latLngToCell(fix.lat, fix.lng, HEX_RES)
    const targets = gridDisk(center, REVEAL_K)

    let coins = 0
    let newCells = 0
    const persist: CellRow[] = []

    for (const h3 of targets) {
      const existing = cells.get(h3)
      if (!existing) {
        const row: CellRow = {
          h3,
          firstVisited: now,
          lastVisited: now,
          visits: 1,
          coins: NEW_CELL_COINS,
        }
        cells.set(h3, row)
        persist.push(row)
        coins += NEW_CELL_COINS
        newCells++
      } else {
        const rewardable = now - existing.lastVisited > REVISIT_COOLDOWN_MS
        existing.lastVisited = now
        if (rewardable) {
          existing.visits++
          existing.coins += REVISIT_COINS
          coins += REVISIT_COINS
          persist.push(existing)
        }
      }
    }

    if (persist.length) db.cells.bulkPut(persist).catch(() => {})
    // Only new cells change the fog outline.
    if (newCells) set({ revision: get().revision + 1 })

    return { coins, newCells }
  },

  reset: async () => {
    await db.cells.clear()
    get().cells.clear()
    set({ revision: get().revision + 1 })
  },

  reload: async () => {
    const rows = await db.cells.toArray()
    const map = new Map<string, CellRow>()
    for (const r of rows) map.set(r.h3, r)
    set({ cells: map, loaded: true, revision: get().revision + 1 })
  },
}))
