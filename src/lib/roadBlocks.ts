import { featureCollection, lineString } from '@turf/helpers'
import { polygonize } from '@turf/polygonize'
import { latLngToCell } from 'h3-js'
import type { Feature, FeatureCollection, LineString, MultiLineString, Polygon, Position } from 'geojson'
import { HEX_RES } from '../domain/economy'
import type { Bounds } from './tiles'

type RoadFeature = Feature<LineString | MultiLineString, { class?: string }>

const ROAD_CLASSES = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'minor',
  'service',
])
const SAMPLE_SPACING_M = 20

function distanceM([lngA, latA]: Position, [lngB, latB]: Position): number {
  const latRadians = ((latA + latB) / 2) * (Math.PI / 180)
  const dx = (lngB - lngA) * 111_320 * Math.cos(latRadians)
  const dy = (latB - latA) * 110_540
  return Math.hypot(dx, dy)
}

function isCovered(ring: Position[], explored: ReadonlySet<string>): boolean {
  for (let index = 1; index < ring.length; index++) {
    const start = ring[index - 1]
    const end = ring[index]
    const steps = Math.max(1, Math.ceil(distanceM(start, end) / SAMPLE_SPACING_M))
    for (let step = 0; step <= steps; step++) {
      const ratio = step / steps
      const lng = start[0] + (end[0] - start[0]) * ratio
      const lat = start[1] + (end[1] - start[1]) * ratio
      if (!explored.has(latLngToCell(lat, lng, HEX_RES))) return false
    }
  }
  return true
}

function isInsideBounds(ring: Position[], bounds: Bounds): boolean {
  return ring.every(
    ([lng, lat]) => lng > bounds.west && lng < bounds.east && lat > bounds.south && lat < bounds.north,
  )
}

/** Finds fully explored road-bounded faces from the vector tiles loaded in the current view. */
export function completedRoadBlocks(
  roads: RoadFeature[],
  explored: ReadonlySet<string>,
  bounds: Bounds,
): FeatureCollection<Polygon> {
  const lines: Feature<LineString>[] = []
  for (const road of roads) {
    if (!ROAD_CLASSES.has(road.properties?.class ?? '')) continue
    const paths = road.geometry.type === 'LineString' ? [road.geometry.coordinates] : road.geometry.coordinates
    for (const path of paths) {
      if (path.length >= 2) lines.push(lineString(path))
    }
  }

  if (!lines.length) return featureCollection([])
  const blocks = polygonize(featureCollection(lines))
  return featureCollection(
    blocks.features.filter((block) => {
      const boundary = block.geometry.coordinates[0]
      return isInsideBounds(boundary, bounds) && isCovered(boundary, explored)
    }),
  )
}