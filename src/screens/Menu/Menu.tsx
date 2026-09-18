import { Link } from 'react-router-dom'
import { useWallet } from '../../state/wallet'
import { CoinAmount } from '../../components/CoinAmount'
import './Menu.css'

export function Menu() {
  const balance = useWallet((s) => s.balance)

  return (
    <div className="menu">
      <div className="menu__glow" aria-hidden />

      <header className="menu__top">
        <div className="coin-chip">
          <CoinAmount copper={balance} size="sm" />
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

        <Link to="/explore" className="btn btn--explore">
          Explore World
        </Link>

        <div className="menu__row">
          <Link to="/wallet" className="btn btn--ghost">
            Wallet
          </Link>
          <Link to="/rides" className="btn btn--ghost">
            Rides
          </Link>
          <Link to="/settings" className="btn btn--ghost">
            Settings
          </Link>
        </div>
      </nav>

    </div>
  )
}
