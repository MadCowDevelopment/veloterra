import { useState } from 'react'
import { useAuth } from '../state/auth'

export function AccountCard() {
  const user = useAuth((s) => s.user)
  const ready = useAuth((s) => s.ready)
  const signInGoogle = useAuth((s) => s.signInGoogle)
  const signInGuest = useAuth((s) => s.signInGuest)
  const linkGoogle = useAuth((s) => s.linkGoogle)
  const signOut = useAuth((s) => s.signOut)
  const [msg, setMsg] = useState<string | null>(null)

  const guest = user?.is_anonymous
  const email = user?.email

  const asGuest = async () => {
    setMsg(null)
    const error = await signInGuest()
    if (error) setMsg(error)
  }

  return (
    <div className="card">
      <div className="card__title">Account</div>

      {!ready ? (
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      ) : !user ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Sign in to back up and sync your progress across devices.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button className="btn btn--primary" style={{ width: '100%' }} onClick={signInGoogle}>
              Sign in with Google
            </button>
            <button className="btn btn--ghost" style={{ width: '100%' }} onClick={asGuest}>
              Continue as guest
            </button>
          </div>
        </>
      ) : guest ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Signed in as <strong>Guest</strong>. Link an account so your progress follows you.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button className="btn btn--primary" style={{ width: '100%' }} onClick={linkGoogle}>
              Link Google account
            </button>
            <button className="btn btn--ghost" style={{ width: '100%' }} onClick={signOut}>
              Sign out
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Signed in{email ? <> as <strong>{email}</strong></> : ''}.
          </p>
          <button className="btn btn--ghost" style={{ width: '100%' }} onClick={signOut}>
            Sign out
          </button>
        </>
      )}

      {msg && (
        <p className="muted" style={{ color: '#ff9aa5', marginBottom: 0 }}>
          {msg}
        </p>
      )}
    </div>
  )
}
