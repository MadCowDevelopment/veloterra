export interface WikimediaImage {
  src: string
  pageUrl: string
  artist: string | null
  license: string | null
}

export interface WikimediaImageSources {
  wikimediaCommons: string | null
  wikidata: string | null
  wikipedia: string | null
}

interface WikidataResponse {
  entities?: Record<string, {
    claims?: {
      P18?: Array<{
        mainsnak?: { datavalue?: { value?: unknown } }
      }>
    }
  }>
}

interface CommonsResponse {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        url?: string
        thumburl?: string
        descriptionurl?: string
        extmetadata?: Record<string, { value?: string }>
      }>
    }>
  }
}

interface WikipediaResponse {
  query?: {
    pages?: Record<string, { pageimage?: string }>
  }
}

const imageCache = new Map<string, Promise<WikimediaImage | null>>()

function plainText(html: string | undefined): string | null {
  if (!html) return null
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || null
}

async function commonsImage(filename: string): Promise<WikimediaImage | null> {
  const title = filename.replace(/^File:/i, '').trim()
  if (!title) return null
  const commonsUrl = new URL('https://commons.wikimedia.org/w/api.php')
  commonsUrl.search = new URLSearchParams({
    action: 'query',
    titles: `File:${title}`,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '720',
    format: 'json',
    origin: '*',
  }).toString()
  const commonsResponse = await fetch(commonsUrl)
  if (!commonsResponse.ok) return null
  const commons = await commonsResponse.json() as CommonsResponse
  const imageInfo = Object.values(commons.query?.pages ?? {})[0]?.imageinfo?.[0]
  const src = imageInfo?.thumburl ?? imageInfo?.url
  if (!src || !imageInfo?.descriptionurl) return null

  return {
    src,
    pageUrl: imageInfo.descriptionurl,
    artist: plainText(imageInfo.extmetadata?.Artist?.value),
    license: plainText(imageInfo.extmetadata?.LicenseShortName?.value),
  }
}

function commonsFilename(reference: string): string | null {
  if (/^File:/i.test(reference)) return reference
  try {
    const url = new URL(reference)
    if (!url.hostname.endsWith('wikimedia.org')) return null
    const title = url.searchParams.get('title') ?? decodeURIComponent(url.pathname.replace(/^\/wiki\//, ''))
    return /^File:/i.test(title) ? title : null
  } catch {
    return null
  }
}

async function wikidataFilename(wikidataId: string): Promise<string | null> {
  if (!/^Q\d+$/.test(wikidataId)) return null
  const wikidataUrl = new URL('https://www.wikidata.org/w/api.php')
  wikidataUrl.search = new URLSearchParams({
    action: 'wbgetentities',
    ids: wikidataId,
    props: 'claims',
    format: 'json',
    origin: '*',
  }).toString()
  const wikidataResponse = await fetch(wikidataUrl)
  if (!wikidataResponse.ok) return null
  const wikidata = await wikidataResponse.json() as WikidataResponse
  const filename = wikidata.entities?.[wikidataId]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
  return typeof filename === 'string' ? filename : null
}

async function wikipediaFilename(reference: string): Promise<string | null> {
  const match = /^([a-z-]{2,12}):(.+)$/i.exec(reference)
  if (!match) return null
  const wikipediaUrl = new URL(`https://${match[1].toLowerCase()}.wikipedia.org/w/api.php`)
  wikipediaUrl.search = new URLSearchParams({
    action: 'query',
    titles: match[2],
    prop: 'pageimages',
    piprop: 'name',
    redirects: '1',
    format: 'json',
    origin: '*',
  }).toString()
  const wikipediaResponse = await fetch(wikipediaUrl)
  if (!wikipediaResponse.ok) return null
  const wikipedia = await wikipediaResponse.json() as WikipediaResponse
  return Object.values(wikipedia.query?.pages ?? {})[0]?.pageimage ?? null
}

async function fetchWikimediaImage(sources: WikimediaImageSources): Promise<WikimediaImage | null> {
  const directFilename = sources.wikimediaCommons && commonsFilename(sources.wikimediaCommons)
  if (directFilename) {
    const image = await commonsImage(directFilename)
    if (image) return image
  }

  if (sources.wikidata) {
    const filename = await wikidataFilename(sources.wikidata)
    if (filename) {
      const image = await commonsImage(filename)
      if (image) return image
    }
  }

  if (sources.wikipedia) {
    const filename = await wikipediaFilename(sources.wikipedia)
    if (filename) return commonsImage(filename)
  }
  return null
}

export function loadWikimediaImage(sources: WikimediaImageSources): Promise<WikimediaImage | null> {
  const cacheKey = JSON.stringify(sources)
  const cached = imageCache.get(cacheKey)
  if (cached) return cached
  const request = fetchWikimediaImage(sources).catch(() => null)
  imageCache.set(cacheKey, request)
  return request
}
