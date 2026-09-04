import { SubPage } from '../../components/SubPage'
import { useWallet } from '../../state/wallet'
import { formatDistance } from '../../lib/geo'

export function Wallet() {
  const balance = useWallet((s) => s.balance)
  const totalDistanceM = useWallet((s) => s.totalDistanceM)
  const ridesCount = useWallet((s) => s.ridesCount)

  return (
    <SubPage title="Wallet">
      <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--coin)' }}>
          {balance.toLocaleString()}
        </div>
        <div className="muted">coins</div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <Row label="Total rides" value={String(ridesCount)} />
        <Row label="Distance explored" value={formatDistance(totalDistanceM)} />
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        Earning coins by uncovering the map arrives in a later milestone.{' '}
        <span className="soon">Coming soon</span>
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
