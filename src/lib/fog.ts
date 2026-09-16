import { cellsToMultiPolygon } from 'h3-js'
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

function signedArea(ring: number[][]): number {
  let area = 0
  for (let index = 1; index < ring.length; index++) {
    const [x0, y0] = ring[index - 1]
    const [x1, y1] = ring[index]
    area += x0 * y1 - x1 * y0
  }
  return area / 2
}

function orientRing(ring: number[][], clockwise: boolean): number[][] {
  const closed = closeLoop(ring)
  const isClockwise = signedArea(closed) < 0
  return isClockwise === clockwise ? closed : [...closed].reverse()
}

export interface FogGeometry {
  fill: FeatureCollection
  edges: FeatureCollection
}

/**
 * Build the fog polygon (world minus explored cells) plus the glowing frontier
 * lines. `cells` should already be filtered to the current viewport.
 */
export function buildFog(cells: string[]): FogGeometry {
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
        holes.push(orientRing(ring, true))
      } else {
        // Unexplored pocket inside an explored region → re-cover with fog.
        fillFeatures.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [orientRing(ring, false)] } as Polygon,
        })
      }
    })
  }

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
