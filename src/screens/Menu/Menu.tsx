import { Link } from 'react-router-dom'
import { useWallet } from '../../state/wallet'
import { formatDistance } from '../../lib/geo'
import './Menu.css'

export function Menu() {
  const balance = useWallet((s) => s.balance)
  const totalDistanceM = useWallet((s) => s.totalDistanceM)
  const ridesCount = useWallet((s) => s.ridesCount)

  return (
    <div className="menu">
      <div className="menu__glow" aria-hidden />

      <header className="menu__top">
        <div className="coin-chip">
          <span className="coin-chip__dot" />
          {balance.toLocaleString()}
          <span className="coin-chip__label">coins</span>
        </div>
      </header>

      <div className="menu__hero">
        <img className="menu__logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
        <h1 className="menu__title">
          Velo<span>Terra</span>
        </h1>
        <p className="menu__tagline">Ride to uncover the world.</p>
      </div>

      <nav className="menu__actions">
        <Link to="/ride" className="btn btn--primary">
          <span className="btn__icon">▶</span>
          Start Ride
        </Link>

        <div className="menu__row">
          <Link to="/wallet" className="btn btn--ghost">
            Wallet
          </Link>
          <Link to="/settings" className="btn btn--ghost">
            Settings
          </Link>
        </div>
      </nav>

      <footer className="menu__stats">
        <div className="stat">
          <div className="stat__value">{ridesCount}</div>
          <div className="stat__label">Rides</div>
        </div>
        <div className="stat">
          <div className="stat__value">{formatDistance(totalDistanceM)}</div>
          <div className="stat__label">Explored</div>
        </div>
      </footer>
    </div>
  )
}
