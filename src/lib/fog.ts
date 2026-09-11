import { cellsToMultiPolygon, gridDisk } from 'h3-js'
import type { Feature, FeatureCollection, Polygon } from 'geojson'

// A rectangle covering the whole web-mercator range; the fog fills this and the
// explored area is punched out as holes.
const WORLD_RING: number[][] = [
  [-179.9, -85],
  [179.9, -85],
  [179.9, 85],
  [-179.9, 85],
  [-179.9, -85],
]

function closeLoop(loop: number[][]): number[][] {
  if (loop.length === 0) return loop
  const [fx, fy] = loop[0]
  const [lx, ly] = loop[loop.length - 1]
  return fx === lx && fy === ly ? loop : [...loop, loop[0]]
}

function containsPoint(ring: number[][], [x, y]: number[]): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index]
    const [xj, yj] = ring[previous]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export interface FogGeometry {
  fill: FeatureCollection
  edges: FeatureCollection
}

/** Return one-cell gaps surrounded by at least five directly explored neighbours. */
export function completeSmallGaps(cells: Iterable<string>): string[] {
  const explored = new Set(cells)
  const candidates = new Set<string>()
  for (const h3 of explored) {
    for (const neighbour of gridDisk(h3, 1)) candidates.add(neighbour)
  }

  const completed: string[] = []
  for (const candidate of candidates) {
    if (explored.has(candidate)) continue
    const exploredNeighbours = gridDisk(candidate, 1).filter(
      (neighbour) => neighbour !== candidate && explored.has(neighbour),
    ).length
    if (exploredNeighbours >= 5) completed.push(candidate)
  }
  return completed
}

/**
 * Build the fog polygon (world minus explored cells) plus the glowing frontier
 * lines. `cells` should already be filtered to the current viewport. Completed
 * road blocks are cut out of the fog and rendered separately as semi-revealed.
 */
export function buildFog(cells: string[], completedBlocks: Polygon[] = []): FogGeometry {
  const fillFeatures: Feature[] = []
  const edgeFeatures: Feature[] = []

  if (cells.length === 0) {
    fillFeatures.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [WORLD_RING] } as Polygon,
    })
    return {
      fill: { type: 'FeatureCollection', features: fillFeatures },
      edges: { type: 'FeatureCollection', features: edgeFeatures },
    }
  }

  // [ Polygon[ Loop[ [lng,lat] ] ] ] — first loop is outer, the rest are holes.
  const multi = cellsToMultiPolygon(cells, true) as unknown as number[][][][]

  const holes: number[][][] = []
  for (const polygon of multi) {
    polygon.forEach((loop, i) => {
      const ring = closeLoop(loop)
      edgeFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: ring },
      })
      if (i === 0) {
        // Outer boundary of an explored region → a hole in the fog.
        holes.push(ring)
      } else {
        // Unexplored pocket inside an explored region → re-cover with fog.
        const completedInside = completedBlocks
          .map((block) => closeLoop(block.coordinates[0]))
          .filter((block) => containsPoint(ring, block[0]))
        fillFeatures.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [ring, ...completedInside] } as Polygon,
        })
      }
    })
  }

  for (const block of completedBlocks) holes.push(closeLoop(block.coordinates[0]))

  fillFeatures.unshift({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [WORLD_RING, ...holes] } as Polygon,
  })

  return {
    fill: { type: 'FeatureCollection', features: fillFeatures },
    edges: { type: 'FeatureCollection', features: edgeFeatures },
  }
}
