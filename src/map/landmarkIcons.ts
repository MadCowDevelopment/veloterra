import artwork from '@mapbox/maki/icons/art-gallery.svg'
import bridge from '@mapbox/maki/icons/bridge.svg'
import castle from '@mapbox/maki/icons/castle.svg'
import chapel from '@mapbox/maki/icons/place-of-worship.svg'
import church from '@mapbox/maki/icons/religious-christian.svg'
import civic from '@mapbox/maki/icons/town-hall.svg'
import construction from '@mapbox/maki/icons/construction.svg'
import garden from '@mapbox/maki/icons/garden.svg'
import heritage from '@mapbox/maki/icons/building.svg'
import historic from '@mapbox/maki/icons/historic.svg'
import industrial from '@mapbox/maki/icons/industry.svg'
import landmark from '@mapbox/maki/icons/landmark.svg'
import lighthouse from '@mapbox/maki/icons/lighthouse.svg'
import mill from '@mapbox/maki/icons/windmill.svg'
import monument from '@mapbox/maki/icons/monument.svg'
import mountain from '@mapbox/maki/icons/mountain.svg'
import museum from '@mapbox/maki/icons/museum.svg'
import natural from '@mapbox/maki/icons/natural.svg'
import ruins from '@mapbox/maki/icons/attraction.svg'
import tower from '@mapbox/maki/icons/observation-tower.svg'
import viewpoint from '@mapbox/maki/icons/viewpoint.svg'
import water from '@mapbox/maki/icons/waterfall.svg'
import type { LandmarkCategory } from '../domain/landmarks'

export const unrestoredLandmarkIcon = historic
export const constructionLandmarkIcon = construction

export const restoredLandmarkIcons: Record<LandmarkCategory, string> = {
  artwork,
  bridge,
  castle,
  chapel,
  church,
  civic,
  garden,
  heritage,
  industrial,
  landmark,
  lighthouse,
  mill,
  monument,
  mountain,
  museum,
  natural,
  ruins,
  tower,
  viewpoint,
  water,
}
