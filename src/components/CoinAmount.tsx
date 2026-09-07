import type { CSSProperties } from 'react'
import { toTiers } from '../lib/currency'
import './CoinAmount.css'

interface Props {
  copper: number
  size?: 'sm' | 'md' | 'lg'
}

export function CoinAmount({ copper, size = 'md' }: Props) {
  const tiers = toTiers(copper)
  return (
    <span className={`coins coins--${size}`}>
      {tiers.map((t) => (
        <span key={t.key} className="coins__tier" title={t.label}>
          <span
            className="coins__dot"
            style={{ '--coin-c': t.color } as CSSProperties}
          />
          {t.count}
        </span>
      ))}
    </span>
  )
}
