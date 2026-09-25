import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SubPage } from '../../components/SubPage'
import { AccountCard } from '../../components/AccountCard'
import { db } from '../../data/db'
import { clearRides } from '../../lib/rides'
import { useWallet } from '../../state/wallet'
import { useExplored } from '../../state/explored'
import {
  EXPLORE_HEX_ZOOM_MAX,
  EXPLORE_HEX_ZOOM_MIN,
  usePrefs,
} from '../../state/prefs'

export function Settings() {
  const [count, setCount] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [done, setDone] = useState(false)

  const resetExplored = useExplored((s) => s.reset)
  const resetWallet = useWallet((s) => s.reset)
  const exploreHexZoom = usePrefs((s) => s.exploreHexZoom)
  const setExploreHexZoom = usePrefs((s) => s.setExploreHexZoom)

  useEffect(() => {
    db.cells.count().then(setCount)
  }, [])

  const needsHard = count > 1000
  const canReset = !needsHard || confirmText.trim().toUpperCase() === 'RESET'

  const doReset = async () => {
    if (!canReset) return
    await resetExplored()
    await clearRides()
    resetWallet()
    setCount(0)
    setConfirming(false)
    setConfirmText('')
    setDone(true)
  }

  return (
    <SubPage title="Settings">
      <AccountCard />

      <div className="card settings-map-detail">
        <div className="settings-map-detail__heading">
          <div>
            <div className="card__title">Explored map detail</div>
            <p className="muted">Switch from the overview heatmap to the detailed fog view.</p>
          </div>
          <output htmlFor="explore-hex-zoom">Zoom {exploreHexZoom}</output>
        </div>
        <input
          id="explore-hex-zoom"
          type="range"
          min={EXPLORE_HEX_ZOOM_MIN}
          max={EXPLORE_HEX_ZOOM_MAX}
          step="1"
          value={exploreHexZoom}
          onChange={(event) => setExploreHexZoom(Number(event.target.value))}
        />
        <div className="settings-map-detail__range" aria-hidden="true">
          <span>Farther out</span>
          <span>Closer in</span>
        </div>
      </div>

      <div className="card">
        <div className="card__title">Offline maps</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Download map areas so you can ride with no internet. Areas you pass through while
          online are also cached automatically, and you can manage or delete saved areas any
          time.
        </p>
        <Link to="/offline" className="btn btn--primary" style={{ width: '100%' }}>
          Manage offline maps
        </Link>
      </div>

      <div className="danger">
        <div className="danger__title">Danger zone</div>
        <div className="danger__body">
          <div>
            <div className="danger__label">Reset all progress</div>
            <div className="muted">
              Permanently deletes your coins, explored map, and ride history.
              {count > 0 && ` (${count.toLocaleString()} tiles explored)`}
            </div>
          </div>

          {done ? (
            <div className="danger__done">✓ Progress reset.</div>
          ) : !confirming ? (
            <button className="danger__btn" onClick={() => setConfirming(true)}>
              Reset all progress
            </button>
          ) : (
            <div className="danger__confirm">
              <p className="danger__warn">
                This can’t be undone.
                {needsHard && ' Type RESET to confirm.'}
              </p>
              {needsHard && (
                <input
                  className="danger__input"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="RESET"
                  autoFocus
                  autoCapitalize="characters"
                />
              )}
              <div className="danger__actions">
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    setConfirming(false)
                    setConfirmText('')
                  }}
                >
                  Cancel
                </button>
                <button className="danger__btn" disabled={!canReset} onClick={doReset}>
                  Yes, reset everything
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SubPage>
  )
}
