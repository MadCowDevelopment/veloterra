export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

export interface TileCoord {
  z: number
  x: number
  y: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z)
}

export function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** All tiles covering `bounds` for zoom levels minZoom..maxZoom (inclusive). */
export function enumerateTiles(bounds: Bounds, minZoom: number, maxZoom: number): TileCoord[] {
  const tiles: TileCoord[] = []
  for (let z = minZoom; z <= maxZoom; z++) {
    const max = 2 ** z - 1
    const x0 = clamp(lngToTileX(bounds.west, z), 0, max)
    const x1 = clamp(lngToTileX(bounds.east, z), 0, max)
    const y0 = clamp(latToTileY(bounds.north, z), 0, max) // north = smaller Y
    const y1 = clamp(latToTileY(bounds.south, z), 0, max)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        tiles.push({ z, x, y })
      }
    }
  }
  return tiles
}

export function countTiles(bounds: Bounds, minZoom: number, maxZoom: number): number {
  let n = 0
  for (let z = minZoom; z <= maxZoom; z++) {
    const max = 2 ** z - 1
    const x0 = clamp(lngToTileX(bounds.west, z), 0, max)
    const x1 = clamp(lngToTileX(bounds.east, z), 0, max)
    const y0 = clamp(latToTileY(bounds.north, z), 0, max)
    const y1 = clamp(latToTileY(bounds.south, z), 0, max)
    n += (Math.abs(x1 - x0) + 1) * (Math.abs(y1 - y0) + 1)
  }
  return n
}

/** Rough average compressed vector-tile size, for pre-download estimates. */
export const AVG_TILE_KB = 28

export function estimateMB(tileCount: number): number {
  return (tileCount * AVG_TILE_KB) / 1024
}
