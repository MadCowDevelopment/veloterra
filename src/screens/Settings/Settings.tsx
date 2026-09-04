import { SubPage } from '../../components/SubPage'

export function Settings() {
  return (
    <SubPage title="Settings">
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          VeloTerra {import.meta.env.MODE === 'development' ? '(dev)' : ''}
        </p>
        <p className="muted">
          Map style switching, offline map downloads, units, and reveal radius will live
          here. <span className="soon">Coming soon</span>
        </p>
      </div>
    </SubPage>
  )
}
