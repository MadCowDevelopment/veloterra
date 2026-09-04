import { db, type RegionRow } from '../data/db'
import type { Bounds } from './tiles'

const TILE_CACHE = 'basemap-openfreemap'

function regionName(bounds: Bounds): string {
  const lat = (bounds.north + bounds.south) / 2
  const lng = (bounds.west + bounds.east) / 2
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`
}

export async function addRegion(
  bounds: Bounds,
  urls: string[],
  bytes: number,
  tiles: number,
): Promise<RegionRow> {
  const row: RegionRow = {
    id: crypto.randomUUID(),
    name: regionName(bounds),
    bounds,
    urls,
    bytes,
    tiles,
    createdAt: Date.now(),
  }
  await db.regions.put(row)
  return row
}

export function listRegions(): Promise<RegionRow[]> {
  return db.regions.orderBy('createdAt').reverse().toArray()
}

/**
 * Delete a region, removing only cached tiles that no *other* saved region
 * still needs (reference counting on the stored URL lists).
 */
export async function deleteRegion(id: string): Promise<void> {
  const [target, others] = await Promise.all([
    db.regions.get(id),
    db.regions.where('id').notEqual(id).toArray(),
  ])
  if (!target) return

  const stillNeeded = new Set<string>()
  for (const r of others) for (const u of r.urls) stillNeeded.add(u)

  if ('caches' in window) {
    const cache = await caches.open(TILE_CACHE)
    await Promise.all(
      target.urls.map((u) => (stillNeeded.has(u) ? undefined : cache.delete(u))),
    )
  }
  await db.regions.delete(id)
}

export async function clearAllRegions(): Promise<void> {
  await db.regions.clear()
}
