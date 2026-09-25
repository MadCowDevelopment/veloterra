import type { CSSProperties } from 'react'
import { toTiers } from '../lib/currency'
import './CoinAmount.css'

interface Props {
  copper: number
  size?: 'sm' | 'md' | 'lg'
  goldOnly?: boolean
}

export function CoinAmount({ copper, size = 'md', goldOnly = false }: Props) {
  const tiers = goldOnly
    ? [{ key: 'gold' as const, count: Math.floor(Math.max(0, copper) / 10_000), color: '#ffd257', label: 'Gold' }]
    : toTiers(copper)
  return (
    <span className={`coins coins--${size}`}>
      {tiers.map((t) => (
        <span key={t.key} className="coins__tier" title={t.label}>
          <span
            className="coins__dot"
            style={{ '--coin-c': t.color } as CSSProperties}
          />
          {t.count.toLocaleString()}
        </span>
      ))}
    </span>
  )
}
