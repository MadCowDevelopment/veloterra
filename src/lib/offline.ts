import { enumerateTiles, type Bounds } from './tiles'

const OFM = 'https://tiles.openfreemap.org'
const STYLE_URL = `${OFM}/styles/dark`
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

interface StyleAssets {
  tileTemplate: string
  glyphUrls: string[]
  spriteUrls: string[]
}

const GLYPH_RANGES = ['0-255', '256-511'] // covers Latin incl. German umlauts

function fillTile(template: string, z: number, x: number, y: number): string {
  return template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

async function resolveStyleAssets(): Promise<StyleAssets> {
  const [style, tj] = await Promise.all([
    fetch(STYLE_URL).then((r) => r.json()),
    fetch(PLANET_TILEJSON).then((r) => r.json()),
  ])

  const fonts: string[] = Array.from(
    new Set(
      (style.layers ?? [])
        .map((l: { layout?: Record<string, unknown> }) => l.layout?.['text-font'])
        .filter(Boolean)
        .flat() as string[],
    ),
  )
  const glyphTemplate: string = style.glyphs
  const glyphUrls = fonts.flatMap((font) =>
    GLYPH_RANGES.map((range) =>
      glyphTemplate
        .replace('{fontstack}', encodeURIComponent(font))
        .replace('{range}', range),
    ),
  )

  const spriteBase: string = style.sprite
  const spriteUrls = spriteBase
    ? [`${spriteBase}.json`, `${spriteBase}.png`, `${spriteBase}@2x.png`, `${spriteBase}@2x.json`]
    : []

  return { tileTemplate: tj.tiles[0], glyphUrls, spriteUrls }
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
 * Prefetch every asset needed to render `bounds` offline (vector tiles, style,
 * fonts, sprite, low-zoom raster) into the service-worker tile cache.
 */
export async function downloadArea(
  bounds: Bounds,
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
): Promise<DownloadProgress> {
  const { tileTemplate, glyphUrls, spriteUrls } = await resolveStyleAssets()

  const vectorTiles = enumerateTiles(bounds, 0, MAX_ZOOM).map((t) =>
    fillTile(tileTemplate, t.z, t.x, t.y),
  )
  const rasterTiles = enumerateTiles(bounds, 0, 6).map((t) => NE_TILES(t.z, t.x, t.y))

  const urls = [
    STYLE_URL,
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
      if (res.ok) {
        const buf = await res.clone().arrayBuffer()
        bytes += buf.byteLength
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      // Missing tiles (e.g. empty ocean) are fine to skip.
    }
    done++
    onProgress({ done, total: urls.length, bytes })
  })

  return { done, total: urls.length, bytes }
}

/** Whether a service worker currently controls the page (needed for offline). */
export function isOfflineCapable(): boolean {
  return 'serviceWorker' in navigator && navigator.serviceWorker.controller != null
}

/** Delete all cached basemap assets. Returns the number of caches removed. */
export async function clearOfflineMaps(): Promise<number> {
  if (!('caches' in window)) return 0
  const names = await caches.keys()
  const targets = names.filter((n) => n.includes('basemap'))
  await Promise.all(targets.map((n) => caches.delete(n)))
  return targets.length
}
