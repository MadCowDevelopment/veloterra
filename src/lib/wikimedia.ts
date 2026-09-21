export interface WikimediaImage {
  src: string
  pageUrl: string
  artist: string | null
  license: string | null
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

const imageCache = new Map<string, Promise<WikimediaImage | null>>()

function plainText(html: string | undefined): string | null {
  if (!html) return null
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || null
}

async function fetchWikimediaImage(wikidataId: string): Promise<WikimediaImage | null> {
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
  if (typeof filename !== 'string') return null

  const commonsUrl = new URL('https://commons.wikimedia.org/w/api.php')
  commonsUrl.search = new URLSearchParams({
    action: 'query',
    titles: `File:${filename}`,
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

export function loadWikimediaImage(wikidataId: string): Promise<WikimediaImage | null> {
  if (!/^Q\d+$/.test(wikidataId)) return Promise.resolve(null)
  const cached = imageCache.get(wikidataId)
  if (cached) return cached
  const request = fetchWikimediaImage(wikidataId).catch(() => null)
  imageCache.set(wikidataId, request)
  return request
}
