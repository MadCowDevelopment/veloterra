export interface CoinTier {
  key: 'diamond' | 'gold' | 'silver' | 'copper'
  count: number
  color: string
  label: string
}

const ORDER = ['diamond', 'gold', 'silver', 'copper'] as const

const COLORS: Record<string, string> = {
  diamond: '#8be9fd',
  gold: '#ffd257',
  silver: '#cdd3de',
  copper: '#d98a4f',
}

const LABELS: Record<string, string> = {
  diamond: 'Diamond',
  gold: 'Gold',
  silver: 'Silver',
  copper: 'Copper',
}

/**
 * Break a copper total into denominations (100 copper = 1 silver, 100 silver =
 * 1 gold, 100 gold = 1 diamond). Returns tiers from the highest non-zero tier
 * down to copper, so empty top tiers are hidden.
 */
export function toTiers(copper: number): CoinTier[] {
  const c = Math.max(0, Math.floor(copper))
  const counts = {
    diamond: Math.floor(c / 1_000_000),
    gold: Math.floor(c / 10_000) % 100,
    silver: Math.floor(c / 100) % 100,
    copper: c % 100,
  }
  const topIdx = ORDER.findIndex((k) => counts[k] > 0)
  const start = topIdx === -1 ? ORDER.length - 1 : topIdx // all zero → copper only
  return ORDER.slice(start).map((k) => ({
    key: k,
    count: counts[k],
    color: COLORS[k],
    label: LABELS[k],
  }))
}
