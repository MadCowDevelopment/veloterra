import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SubPage } from '../../components/SubPage'
import { db } from '../../data/db'
import { useWallet } from '../../state/wallet'
import { useExplored } from '../../state/explored'

export function Settings() {
  const [count, setCount] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [done, setDone] = useState(false)

  const resetExplored = useExplored((s) => s.reset)
  const resetWallet = useWallet((s) => s.reset)

  useEffect(() => {
    db.cells.count().then(setCount)
  }, [])

  const needsHard = count > 1000
  const canReset = !needsHard || confirmText.trim().toUpperCase() === 'RESET'

  const doReset = async () => {
    if (!canReset) return
    await resetExplored()
    resetWallet()
    setCount(0)
    setConfirming(false)
    setConfirmText('')
    setDone(true)
  }

  return (
    <SubPage title="Settings">
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          <Link to="/offline" style={{ color: 'var(--accent)', fontWeight: 700 }}>
            Offline maps →
          </Link>
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Units and fog reveal radius will live here.{' '}
          <span className="soon">Coming soon</span>
        </p>
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
