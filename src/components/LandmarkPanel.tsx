import { useEffect, useRef, useState } from 'react'
import { CoinAmount } from './CoinAmount'
import { LANDMARK_CATEGORY_LABELS, landmarkProgress, landmarkState, type Landmark } from '../domain/landmarks'
import { useAuth } from '../state/auth'
import { useLandmarks, type LandmarkContributor } from '../state/landmarks'
import { useWallet } from '../state/wallet'
import './LandmarkPanel.css'

interface Props {
  landmark: Landmark
  onClose: () => void
}

export function LandmarkPanel({ landmark, onClose }: Props) {
  const user = useAuth((state) => state.user)
  const balance = useWallet((state) => state.balance)
  const contribute = useLandmarks((state) => state.contribute)
  const loadContributors = useLandmarks((state) => state.loadContributors)
  const [amount, setAmount] = useState('')
  const [contributors, setContributors] = useState<LandmarkContributor[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)
  const state = landmarkState(landmark)
  const remaining = landmark.costCopper - landmark.totalContributed
  const progress = landmarkProgress(landmark)

  useEffect(() => {
    setAmount(String(Math.max(0, Math.min(balance, remaining))))
    idempotencyKeyRef.current = null
    setError(null)
  }, [balance, landmark.id, remaining])

  useEffect(() => {
    if (!user) return
    loadContributors(landmark.id).then(setContributors).catch(() => setContributors([]))
  }, [landmark.id, landmark.totalContributed, loadContributors, user])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      idempotencyKeyRef.current ??= crypto.randomUUID()
      await contribute(landmark.id, Number(amount), idempotencyKeyRef.current)
      idempotencyKeyRef.current = null
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Contribution failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <aside className="landmark-panel" aria-label={`${landmark.name} restoration`}>
      <button className="landmark-panel__close" type="button" onClick={onClose} aria-label="Close">×</button>
      <span className={`landmark-panel__state landmark-panel__state--${state}`}>
        {state === 'restored' ? 'Restored' : state === 'constructing' ? 'Under construction' : 'Ruins'}
      </span>
      <h2>{landmark.name}</h2>
      <p>{LANDMARK_CATEGORY_LABELS[landmark.category]} · Tier {landmark.tier}</p>

      <div className="landmark-panel__progress" aria-label={`${Math.round(progress * 100)}% restored`}>
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="landmark-panel__totals">
        <CoinAmount copper={landmark.totalContributed} size="sm" />
        <span>of</span>
        <CoinAmount copper={landmark.costCopper} size="sm" />
      </div>

      {state !== 'restored' && user && (
        <div className="landmark-panel__contribute">
          <label htmlFor="landmark-contribution">Contribute copper</label>
          <div>
            <input
              id="landmark-contribution"
              type="number"
              min="1"
              max={Math.min(balance, remaining)}
              step="1"
              value={amount}
              onChange={(event) => {
                idempotencyKeyRef.current = null
                setAmount(event.target.value)
              }}
            />
            <button
              type="button"
              disabled={submitting || balance <= 0 || Number(amount) <= 0}
              onClick={submit}
            >
              {submitting ? 'Contributing…' : 'Contribute'}
            </button>
          </div>
          <small>Available: <CoinAmount copper={balance} size="sm" /></small>
        </div>
      )}
      {error && <p className="landmark-panel__error" role="alert">{error}</p>}
      {contributors.length > 0 && (
        <div className="landmark-panel__contributors">
          <h3>Top contributors</h3>
          {contributors.map((contributor) => (
            <div key={contributor.userId}>
              <span>{contributor.displayName}</span>
              <CoinAmount copper={contributor.amount} size="sm" />
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
