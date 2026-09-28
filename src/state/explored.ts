import { create } from 'zustand'
import { cellToParent, getResolution, gridDisk, latLngToCell } from 'h3-js'
import { db, dbReady, LOCAL_UNASSIGNED_SCOPE, type CellRow } from '../data/db'
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

async function migrateLegacyCells(scope: string): Promise<boolean> {
  await dbReady
  const rows = await db.scopedCells.where('scope').equals(scope).toArray()
  const legacyRows = rows.filter((row) => getResolution(row.h3) > HEX_RES)
  if (!legacyRows.length) return false

  const migrated = new Map<string, CellRow>()
  for (const row of rows) {
    const h3 = getResolution(row.h3) > HEX_RES ? cellToParent(row.h3, HEX_RES) : row.h3
    const existing = migrated.get(h3)
    if (!existing) {
      migrated.set(h3, { ...row, scope, h3 })
      continue
    }
    existing.firstVisited = Math.min(existing.firstVisited, row.firstVisited)
    existing.lastVisited = Math.max(existing.lastVisited, row.lastVisited)
    existing.visits += row.visits
    existing.coins += row.coins
  }

  await db.transaction('rw', db.scopedCells, async () => {
    await db.scopedCells.where('scope').equals(scope).delete()
    await db.scopedCells.bulkPut([...migrated.values()])
  })
  return true
}

interface ExploredState {
  scope: string
  cells: Map<string, CellRow>
  revision: number // bumps only when the explored geometry changes (new cells)
  loaded: boolean
  switchScope: (scope: string) => Promise<void>
  load: () => Promise<void>
  migrate: () => Promise<boolean>
  reveal: (fix: GeoFix) => RevealResult
  reset: () => Promise<void>
  reload: () => Promise<void>
}

// The in-memory cell map is mutated in place for performance; `revision` signals
// geometry changes to subscribers (the fog layer). Rewards persist to IndexedDB.
export const useExplored = create<ExploredState>((set, get) => ({
  scope: LOCAL_UNASSIGNED_SCOPE,
  cells: new Map(),
  revision: 0,
  loaded: false,

  load: async () => {
    await dbReady
    const scope = get().scope
    if (get().loaded) return
    await migrateLegacyCells(scope)
    const rows = await db.scopedCells.where('scope').equals(scope).toArray()
    if (get().scope !== scope) return
    const map = new Map<string, CellRow>()
    for (const r of rows) map.set(r.h3, r)
    set({ cells: map, loaded: true, revision: get().revision + 1 })
  },

  migrate: async () => {
    await dbReady
    return migrateLegacyCells(get().scope)
  },

  switchScope: async (scope) => {
    await dbReady
    if (scope === get().scope && get().loaded) return
    set({ scope, cells: new Map(), loaded: false, revision: get().revision + 1 })
    await get().load()
  },

  reveal: (fix) => {
    const { cells, scope, loaded } = get()
    if (!loaded) return { coins: 0, newCells: 0 }
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
          scope,
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

    if (persist.length) {
      void dbReady
        .then(() => db.scopedCells.bulkPut(persist))
        .catch((error) => console.error('Could not persist explored cells', error))
    }
    // Only new cells change the fog outline.
    if (newCells) set({ revision: get().revision + 1 })

    return { coins, newCells }
  },

  reset: async () => {
    await dbReady
    await db.scopedCells.where('scope').equals(get().scope).delete()
    get().cells.clear()
    set({ revision: get().revision + 1 })
  },

  reload: async () => {
    await dbReady
    const scope = get().scope
    await migrateLegacyCells(scope)
    const rows = await db.scopedCells.where('scope').equals(scope).toArray()
    if (get().scope !== scope) return
    const map = new Map<string, CellRow>()
    for (const r of rows) map.set(r.h3, r)
    set({ cells: map, loaded: true, revision: get().revision + 1 })
  },
}))
