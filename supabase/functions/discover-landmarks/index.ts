import { createClient } from 'npm:@supabase/supabase-js@2'
import { XMLParser } from 'npm:fast-xml-parser@5.2.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TIER_BASE_COPPER = [10_000, 100_000, 1_000_000, 5_000_000] as const
const CLASSIFICATION_VERSION = 2
const MAX_SPAN_DEGREES = 0.16
const DISCOVERY_AREA_STEP = 0.02
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]
const GLOBAL_OVERRIDES: Record<string, { tier: 4; scopeMultiplier: 10 }> = {
  Q10285: { tier: 4, scopeMultiplier: 10 }, // Colosseum
}

type Tags = Record<string, string>
type Category =
  | 'church' | 'chapel' | 'castle' | 'ruins' | 'monument' | 'museum'
  | 'artwork' | 'civic' | 'heritage' | 'tower' | 'bridge' | 'mill'
  | 'industrial' | 'lighthouse' | 'viewpoint' | 'mountain' | 'natural'
  | 'water' | 'garden' | 'landmark'

interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Tags
}

interface OsmXmlElement {
  id: number
  lat?: number
  lon?: number
  tag?: Array<{ k: string; v: string }>
  nd?: Array<{ ref: number }>
  member?: Array<{ type: string; ref: number }>
}

function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Landmark discovery failed'
}

function categoryFor(tags: Tags): Category | null {
  if (tags.historic === 'wayside_cross' || tags.historic === 'wayside_shrine') return null
  if (['ruins', 'archaeological_site'].includes(tags.historic)) return 'ruins'
  if (['castle', 'fort', 'city_gate'].includes(tags.historic) || tags.building === 'castle') return 'castle'
  if (['memorial', 'monument'].includes(tags.historic)) return 'monument'
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'museum'
  if (tags.tourism === 'artwork') return 'artwork'
  if (tags.building === 'cathedral' || tags.building === 'church') return 'church'
  if (tags.building === 'chapel') return 'chapel'
  if (tags.building === 'monastery' || tags.amenity === 'monastery') return 'heritage'
  if (tags.amenity === 'place_of_worship') return 'church'
  if (['townhall', 'courthouse', 'theatre', 'arts_centre'].includes(tags.amenity)) return 'civic'
  if (tags.man_made === 'lighthouse') return 'lighthouse'
  if (['tower', 'communications_tower', 'water_tower'].includes(tags.man_made)) return 'tower'
  if (['windmill', 'watermill'].includes(tags.man_made)) return 'mill'
  if (tags.man_made === 'bridge' || tags.bridge === 'yes') return 'bridge'
  if (['chimney', 'gasometer', 'kiln'].includes(tags.man_made)) return 'industrial'
  if (tags.tourism === 'viewpoint') return 'viewpoint'
  if (['peak', 'volcano'].includes(tags.natural)) return 'mountain'
  if (['rock', 'stone', 'cave_entrance', 'cliff'].includes(tags.natural)) return 'natural'
  if (['waterfall', 'spring', 'hot_spring'].includes(tags.natural)) return 'water'
  if (tags.leisure === 'garden' || tags.natural === 'tree') return 'garden'
  if (tags.heritage || tags.historic) return 'heritage'
  if (tags.tourism === 'attraction') return 'landmark'
  return null
}

function scopeMultiplier(category: Category): 1 | 2 | 5 | 10 {
  if (category === 'castle' || category === 'ruins') return 10
  if (['church', 'museum', 'civic', 'heritage', 'industrial'].includes(category)) return 5
  if (['chapel', 'monument', 'tower', 'bridge', 'mill', 'lighthouse'].includes(category)) return 2
  return 1
}

function tierFor(tags: Tags): 1 | 2 | 3 | 4 {
  if (tags.wikidata && GLOBAL_OVERRIDES[tags.wikidata]) return 4
  if (tags['ref:whc'] || tags.heritage === '1') return 4
  if (tags.heritage === '2' || tags.heritage === '3') return 3
  if (tags.heritage || tags.wikipedia) return 2
  return 1
}

function buildQuery({ south, west, north, east }: Bounds): string {
  const bbox = `${south},${west},${north},${east}`
  return `[out:json][timeout:25];(
    nwr[historic][name](${bbox});
    nwr[heritage][name](${bbox});
    nwr[tourism~"^(attraction|artwork|museum|gallery|viewpoint)$"][name](${bbox});
    nwr[building~"^(cathedral|church|chapel|monastery|castle)$"][name](${bbox});
    nwr[amenity~"^(place_of_worship|monastery|townhall|courthouse|theatre|arts_centre)$"][name](${bbox});
    nwr[man_made~"^(bridge|lighthouse|tower|communications_tower|water_tower|windmill|watermill|chimney|gasometer|kiln)$"][name](${bbox});
    nwr[natural~"^(peak|volcano|cliff|cave_entrance|rock|stone|spring|hot_spring|waterfall|tree)$"][name](${bbox});
    nwr[leisure=garden][name](${bbox});
  );out center tags;`
}

async function queryOverpass(bounds: Bounds): Promise<{ elements: OverpassElement[] }> {
  const query = buildQuery(bounds)
  const request = async (endpoint: string) => {
    try {
      const url = new URL(endpoint)
      url.searchParams.set('data', query)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'VeloTerra/0.1 landmark discovery',
        },
        signal: AbortSignal.timeout(50_000),
      })
      if (response.ok) return await response.json() as { elements: OverpassElement[] }
      throw new Error(`${new URL(endpoint).host}: ${response.status}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request failed'
      throw new Error(message.startsWith(`${new URL(endpoint).host}:`) ? message : `${new URL(endpoint).host}: ${message}`)
    }
  }
  try {
    return await Promise.any(OVERPASS_ENDPOINTS.map(request))
  } catch (error) {
    const failures = error instanceof AggregateError
      ? error.errors.map((failure) => failure instanceof Error ? failure.message : String(failure))
      : [error instanceof Error ? error.message : String(error)]
    throw new Error(`OpenStreetMap query failed (${failures.join(', ')})`)
  }
}

async function queryOsmMap(bounds: Bounds): Promise<{ elements: OverpassElement[] }> {
  const centerLat = (bounds.south + bounds.north) / 2
  const centerLng = (bounds.west + bounds.east) / 2
  const fallbackBounds = {
    west: Math.max(bounds.west, centerLng - 0.01),
    south: Math.max(bounds.south, centerLat - 0.012),
    east: Math.min(bounds.east, centerLng + 0.01),
    north: Math.min(bounds.north, centerLat + 0.012),
  }
  const bbox = `${fallbackBounds.west},${fallbackBounds.south},${fallbackBounds.east},${fallbackBounds.north}`
  const response = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`, {
    headers: { 'User-Agent': 'VeloTerra/0.1 landmark discovery' },
    signal: AbortSignal.timeout(35_000),
  })
  if (!response.ok) throw new Error(`OpenStreetMap map API failed (${response.status})`)

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    isArray: (_name, path) => /\.(node|way|relation|tag|nd|member)$/.test(path),
  })
  const document = parser.parse(await response.text()) as {
    osm?: { node?: OsmXmlElement[]; way?: OsmXmlElement[]; relation?: OsmXmlElement[] }
  }
  const nodes = document.osm?.node ?? []
  const nodeLocations = new Map(nodes.map((node) => [node.id, { lat: node.lat!, lon: node.lon! }]))
  const wayCenters = new Map<number, { lat: number; lon: number }>()
  for (const way of document.osm?.way ?? []) {
    const points = (way.nd ?? []).flatMap(({ ref }) => nodeLocations.get(ref) ?? [])
    if (points.length === 0) continue
    wayCenters.set(way.id, {
      lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
      lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
    })
  }
  const tagsFor = (element: OsmXmlElement): Tags => Object.fromEntries(
    (element.tag ?? []).map(({ k, v }) => [String(k), String(v)]),
  )
  const result: OverpassElement[] = []
  for (const node of nodes) {
    const tags = tagsFor(node)
    if (tags.name && categoryFor(tags)) result.push({ type: 'node', id: node.id, lat: node.lat, lon: node.lon, tags })
  }
  for (const way of document.osm?.way ?? []) {
    const tags = tagsFor(way)
    const center = wayCenters.get(way.id)
    if (tags.name && categoryFor(tags) && center) result.push({ type: 'way', id: way.id, center, tags })
  }
  for (const relation of document.osm?.relation ?? []) {
    const tags = tagsFor(relation)
    if (!tags.name || !categoryFor(tags)) continue
    const points = (relation.member ?? []).flatMap(({ type, ref }) => {
      const point = type === 'node' ? nodeLocations.get(ref) : type === 'way' ? wayCenters.get(ref) : undefined
      return point ?? []
    })
    if (points.length === 0) continue
    result.push({
      type: 'relation',
      id: relation.id,
      center: {
        lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
        lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
      },
      tags,
    })
  }
  return { elements: result }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) throw new Error('Authentication required')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user || user.is_anonymous) throw new Error('Authentication required')
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const bounds = await request.json() as Bounds
    const values = [bounds.west, bounds.south, bounds.east, bounds.north]
    if (!values.every(Number.isFinite)) throw new Error('Invalid bounds')
    if (bounds.west >= bounds.east || bounds.south >= bounds.north) throw new Error('Invalid bounds')
    if (bounds.east - bounds.west > MAX_SPAN_DEGREES || bounds.north - bounds.south > MAX_SPAN_DEGREES) {
      throw new Error('Zoom in to discover landmarks')
    }

    const centerLat = (bounds.south + bounds.north) / 2
    const centerLng = (bounds.west + bounds.east) / 2
    const areaKey = `${Math.round(centerLat / DISCOVERY_AREA_STEP)}:${Math.round(centerLng / DISCOVERY_AREA_STEP)}`
    const { data: claim, error: claimError } = await userClient.rpc('claim_landmark_discovery', {
      p_area_key: areaKey,
      p_classification_version: CLASSIFICATION_VERSION,
    })
    if (claimError) throw claimError
    if (claim === 'cached') {
      return Response.json({ discovered: 0, cached: true }, { headers: corsHeaders })
    }

    let payload: { elements: OverpassElement[] }
    try {
      payload = await queryOsmMap(bounds)
    } catch (mapError) {
      try {
        payload = await queryOverpass(bounds)
      } catch (overpassError) {
        const { error: releaseError } = await adminClient
          .from('landmark_discovery_requests')
          .delete()
          .eq('user_id', user.id)
          .eq('area_key', areaKey)
        const reasons = [mapError, overpassError]
          .map((error) => error instanceof Error ? error.message : String(error))
          .join('; ')
        if (releaseError) throw new Error(`${reasons}; failed to release discovery claim: ${releaseError.message}`)
        throw new Error(reasons)
      }
    }

    const rows = payload.elements.flatMap((element) => {
      const tags = element.tags
      const latitude = element.lat ?? element.center?.lat
      const longitude = element.lon ?? element.center?.lon
      if (!tags?.name || latitude === undefined || longitude === undefined) return []
      const category = categoryFor(tags)
      if (!category) return []
      const tier = tierFor(tags)
      const multiplier = GLOBAL_OVERRIDES[tags.wikidata ?? '']?.scopeMultiplier ?? scopeMultiplier(category)
      return [{
        canonical_key: tags.wikidata ? `wikidata:${tags.wikidata}` : `osm:${element.type}:${element.id}`,
        osm_type: element.type,
        osm_id: element.id,
        name: tags.name,
        category,
        tier,
        scope_multiplier: multiplier,
        cost_copper: TIER_BASE_COPPER[tier - 1] * multiplier,
        latitude,
        longitude,
        wikidata: tags.wikidata ?? null,
        wikipedia: tags.wikipedia ?? null,
        osm_tags: tags,
        classification_version: CLASSIFICATION_VERSION,
      }]
    })

    const uniqueRows = [...new Map(rows.map((row) => [row.canonical_key, row])).values()]
    if (uniqueRows.length > 0) {
      const { error } = await adminClient.from('landmarks').upsert(uniqueRows, {
        onConflict: 'canonical_key',
        ignoreDuplicates: true,
      })
      if (error) {
        const { error: releaseError } = await adminClient
          .from('landmark_discovery_requests')
          .delete()
          .eq('user_id', user.id)
          .eq('area_key', areaKey)
        if (releaseError) throw new Error(`${error.message}; failed to release discovery claim: ${releaseError.message}`)
        throw error
      }
    }

    const { error: coverageError } = await adminClient.from('landmark_discovery_areas').upsert({
      area_key: areaKey,
      classification_version: CLASSIFICATION_VERSION,
      discovered_at: new Date().toISOString(),
    })
    if (coverageError) throw coverageError

    return Response.json({ discovered: uniqueRows.length }, { headers: corsHeaders })
  } catch (error) {
    const message = messageFor(error)
    const status = message === 'Authentication required'
      ? 401
      : message === 'Daily landmark discovery limit reached'
        ? 429
        : message.includes('OpenStreetMap')
          ? 502
          : 400
    return Response.json({ error: message }, { status, headers: corsHeaders })
  }
})
