import { enumerateTiles, type Bounds } from './tiles'
import { MAP_STYLES } from '../map/styles'
import { clearAllRegions } from './regions'

const OFM = 'https://tiles.openfreemap.org'
const PLANET_TILEJSON = `${OFM}/planet`
const NE_TILES = (z: number, x: number, y: number) =>
  `${OFM}/natural_earth/ne2sr/${z}/${x}/${y}.png`

export const MAX_ZOOM = 14
export const MAX_DOWNLOAD_MB = 100

export interface DownloadProgress {
  done: number
  total: number
  bytes: number
}

export interface DownloadResult extends DownloadProgress {
  urls: string[]
}

interface StyleAssets {
  tileTemplate: string
  glyphUrls: string[]
  spriteUrls: string[]
  styleUrls: string[]
}

const GLYPH_RANGES = ['0-255', '256-511'] // covers Latin incl. German umlauts

function fillTile(template: string, z: number, x: number, y: number): string {
  return template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

// Cache assets for every style so switching styles works fully offline.
async function resolveStyleAssets(): Promise<StyleAssets> {
  const styleUrls = MAP_STYLES.map((s) => s.url)
  const [tj, ...styles] = await Promise.all([
    fetch(PLANET_TILEJSON).then((r) => r.json()),
    ...styleUrls.map((u) => fetch(u).then((r) => r.json())),
  ])

  const glyphs = new Set<string>()
  const sprites = new Set<string>()

  for (const style of styles) {
    const fonts = new Set<string>()
    for (const layer of style.layers ?? []) {
      const tf = layer.layout?.['text-font']
      if (Array.isArray(tf)) tf.forEach((f: string) => fonts.add(f))
    }
    if (style.glyphs) {
      for (const font of fonts) {
        for (const range of GLYPH_RANGES) {
          glyphs.add(
            style.glyphs
              .replace('{fontstack}', encodeURIComponent(font))
              .replace('{range}', range),
          )
        }
      }
    }
    if (style.sprite) {
      sprites.add(`${style.sprite}.json`)
      sprites.add(`${style.sprite}.png`)
      sprites.add(`${style.sprite}@2x.png`)
      sprites.add(`${style.sprite}@2x.json`)
    }
  }

  return {
    tileTemplate: tj.tiles[0],
    glyphUrls: [...glyphs],
    spriteUrls: [...sprites],
    styleUrls,
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const item = items[i++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

/**
 * Prefetch every asset needed to render `bounds` offline (vector tiles, all
 * style JSONs, fonts, sprites, low-zoom raster) into the tile cache.
 */
export async function downloadArea(
  bounds: Bounds,
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
): Promise<DownloadResult> {
  const { tileTemplate, glyphUrls, spriteUrls, styleUrls } = await resolveStyleAssets()

  const vectorTiles = enumerateTiles(bounds, 0, MAX_ZOOM).map((t) =>
    fillTile(tileTemplate, t.z, t.x, t.y),
  )
  const rasterTiles = enumerateTiles(bounds, 0, 6).map((t) => NE_TILES(t.z, t.x, t.y))

  const urls = [
    ...styleUrls,
    PLANET_TILEJSON,
    ...spriteUrls,
    ...glyphUrls,
    ...rasterTiles,
    ...vectorTiles,
  ]

  let done = 0
  let bytes = 0
  await runPool(urls, 8, async (url) => {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    try {
      const res = await fetch(url, { signal })
      if (res.ok) bytes += (await res.clone().arrayBuffer()).byteLength
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      // Missing tiles (e.g. empty ocean) are fine to skip.
    }
    done++
    onProgress({ done, total: urls.length, bytes })
  })

  return { done, total: urls.length, bytes, urls }
}

/** Whether a service worker currently controls the page (needed for offline). */
export function isOfflineCapable(): boolean {
  return 'serviceWorker' in navigator && navigator.serviceWorker.controller != null
}

/** Delete all cached basemap assets and region records. */
export async function clearOfflineMaps(): Promise<number> {
  await clearAllRegions()
  if (!('caches' in window)) return 0
  const names = await caches.keys()
  const targets = names.filter((n) => n.includes('basemap'))
  await Promise.all(targets.map((n) => caches.delete(n)))
  return targets.length
}
