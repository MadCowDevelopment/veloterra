import { SubPage } from '../../components/SubPage'
import { useWallet } from '../../state/wallet'
import { formatDistance } from '../../lib/geo'
import { CoinAmount } from '../../components/CoinAmount'

export function Wallet() {
  const balance = useWallet((s) => s.balance)
  const totalDistanceM = useWallet((s) => s.totalDistanceM)
  const ridesCount = useWallet((s) => s.ridesCount)

  return (
    <SubPage title="Wallet">
      <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <CoinAmount copper={balance} size="lg" />
        </div>
        <div className="muted">balance</div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <Row label="Total rides" value={String(ridesCount)} />
        <Row label="Distance explored" value={formatDistance(totalDistanceM)} />
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        100 copper = 1 silver · 100 silver = 1 gold · 100 gold = 1 diamond.
      </p>
    </SubPage>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
