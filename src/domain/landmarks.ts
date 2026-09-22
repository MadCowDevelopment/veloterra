export const LANDMARK_TIER_BASE_COPPER = [10_000, 100_000, 1_000_000, 5_000_000] as const

export type LandmarkCategory =
  | 'church'
  | 'chapel'
  | 'castle'
  | 'ruins'
  | 'monument'
  | 'museum'
  | 'artwork'
  | 'civic'
  | 'heritage'
  | 'tower'
  | 'bridge'
  | 'mill'
  | 'industrial'
  | 'lighthouse'
  | 'viewpoint'
  | 'mountain'
  | 'natural'
  | 'water'
  | 'garden'
  | 'landmark'

export type LandmarkState = 'unrestored' | 'constructing' | 'restored'

export interface Landmark {
  id: string
  name: string
  category: LandmarkCategory
  tier: 1 | 2 | 3 | 4
  scopeMultiplier: 1 | 2 | 5 | 10
  costCopper: number
  totalContributed: number
  latitude: number
  longitude: number
  wikidata: string | null
  wikipedia: string | null
  wikimediaCommons: string | null
  restoredAt: string | null
}

export interface LandmarkBounds {
  west: number
  south: number
  east: number
  north: number
}

export const LANDMARK_CATEGORY_LABELS: Record<LandmarkCategory, string> = {
  church: 'Church',
  chapel: 'Chapel',
  castle: 'Castle or fort',
  ruins: 'Ruins or archaeological site',
  monument: 'Monument or memorial',
  museum: 'Museum or gallery',
  artwork: 'Artwork',
  civic: 'Historic civic building',
  heritage: 'Heritage building',
  tower: 'Tower',
  bridge: 'Bridge',
  mill: 'Mill',
  industrial: 'Industrial landmark',
  lighthouse: 'Lighthouse',
  viewpoint: 'Viewpoint',
  mountain: 'Peak or volcano',
  natural: 'Natural landmark',
  water: 'Waterfall or spring',
  garden: 'Garden or notable tree',
  landmark: 'Landmark',
}

export function landmarkState(landmark: Landmark): LandmarkState {
  if (landmark.restoredAt) return 'restored'
  return landmark.totalContributed > 0 ? 'constructing' : 'unrestored'
}

export function landmarkProgress(landmark: Landmark): number {
  return Math.min(1, landmark.totalContributed / landmark.costCopper)
}
