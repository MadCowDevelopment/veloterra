import { useState } from 'react'
import { useAuth } from '../state/auth'
import './AccountCard.css'

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" />
    </svg>
  )
}

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
            <button className="google-btn" onClick={signInGoogle}>
              <GoogleLogo />
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
            <button className="google-btn" onClick={linkGoogle}>
              <GoogleLogo />
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
