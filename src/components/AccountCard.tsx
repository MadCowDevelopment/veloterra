import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../state/auth'
import { useProfile } from '../state/profile'
import { useTeams } from '../state/teams'
import { TEAM_LOGO_LIMIT_BYTES, validateUsername } from '../domain/teams'
import { lookupUsername } from '../lib/profile'
import { useSync, syncNow } from '../lib/sync'
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
  const signOut = useAuth((s) => s.signOut)
  const profile = useProfile((s) => s.profile)
  const profileLoading = useProfile((s) => s.loading)
  const profileError = useProfile((s) => s.error)
  const loadProfile = useProfile((s) => s.load)
  const saveProfile = useProfile((s) => s.save)
  const claimUsername = useProfile((s) => s.claimUsername)
  const teamCount = useTeams((s) => s.teams.length)
  const invitationCount = useTeams((s) => s.invitations.length)

  useEffect(() => {
    if (user) void loadProfile()
  }, [loadProfile, user])

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
            You’re playing locally on this device. Sign in with Google to back up your
            progress and sync it across devices.
          </p>
          <button className="google-btn" onClick={signInGoogle}>
            <GoogleLogo />
            Sign in with Google
          </button>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Signed in{user.email ? <> as <strong>{user.email}</strong></> : ''}. Your
            progress is backed up.
          </p>
          <ProfileEditor
            email={user.email}
            profile={profile}
            loading={profileLoading}
            error={profileError}
            onSave={saveProfile}
            onClaimUsername={claimUsername}
          />
          <SyncLine />
          <Link to="/teams" className="account-teams-link">
            <span>
              <strong>Teams</strong>
              <small>{teamCount ? `${teamCount} team${teamCount === 1 ? '' : 's'}` : 'Create or join a team'}</small>
            </span>
            {invitationCount > 0 && <b>{invitationCount}</b>}
            <span aria-hidden="true">›</span>
          </Link>
          <button className="btn btn--ghost" style={{ width: '100%' }} onClick={signOut}>
            Sign out
          </button>
        </>
      )}
    </div>
  )
}

function ProfileEditor({
  email,
  profile,
  loading,
  error,
  onSave,
  onClaimUsername,
}: {
  email: string | undefined
  profile: ReturnType<typeof useProfile.getState>['profile']
  loading: boolean
  error: string | null
  onSave: (displayName: string, avatarUrl: string | null) => Promise<void>
  onClaimUsername: (username: string) => Promise<void>
}) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '')
  const [username, setUsername] = useState('')
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [localError, setLocalError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '')
    setAvatarUrl(profile?.avatarUrl ?? '')
  }, [profile])

  const handleAvatar = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLocalError('Choose an image file.')
      return
    }
    if (file.size > TEAM_LOGO_LIMIT_BYTES) {
      setLocalError('Images must be 256 KB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAvatarUrl(String(reader.result))
    reader.readAsDataURL(file)
    setLocalError(null)
  }

  const save = async () => {
    if (!displayName.trim()) {
      setLocalError('Display name is required.')
      return
    }
    setLocalError(null)
    setSaved(false)
    await onSave(displayName.trim(), avatarUrl.trim() || null)
    setSaved(true)
  }

  const claim = async () => {
    if (!await checkAvailability()) return
    setLocalError(null)
    await onClaimUsername(username.trim())
    setUsername('')
    setAvailability('idle')
  }

  const checkAvailability = async (): Promise<boolean> => {
    const validation = validateUsername(username)
    if (validation) {
      setLocalError(validation)
      setAvailability('idle')
      return false
    }
    setLocalError(null)
    setAvailability('checking')
    try {
      const match = await lookupUsername(username)
      if (match) {
        setAvailability('taken')
        setLocalError('That username is already taken.')
        return false
      }
      setAvailability('available')
      return true
    } catch (caught) {
      setAvailability('idle')
      setLocalError(caught instanceof Error ? caught.message : 'Could not check username availability.')
      return false
    }
  }

  return (
    <section className="account-profile" aria-labelledby="profile-title">
      <div className="account-profile__heading">
        <div>
          <h2 id="profile-title">Profile</h2>
          <p>Team identity is separate from your private rides and wallet.</p>
        </div>
        {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" className="account-profile__avatar" /> : <div className="account-profile__avatar account-profile__avatar--empty" aria-hidden />}
      </div>

      <div className="account-profile__identity">
        <span className="account-profile__label">Email</span>
        <strong>{email ?? 'Google account'}</strong>
      </div>

      {profile?.username ? (
        <div className="account-profile__identity">
          <span className="account-profile__label">Username</span>
          <strong>@{profile.username}</strong>
          <small>Permanent account handle</small>
        </div>
      ) : (
        <div className="account-profile__claim">
          <label htmlFor="profile-username">Choose username</label>
          <div className="account-profile__input-row">
            <span aria-hidden="true">@</span>
            <input
              id="profile-username"
              value={username}
              onChange={(event) => { setUsername(event.target.value); setAvailability('idle'); setLocalError(null) }}
              placeholder="your-handle"
              autoComplete="off"
              maxLength={24}
            />
            <button className="btn btn--small" onClick={() => void checkAvailability()} disabled={loading || !username.trim() || availability === 'checking'}>
              {availability === 'checking' ? 'Checking…' : 'Check'}
            </button>
            <button className="btn btn--small" onClick={() => void claim()} disabled={loading || availability !== 'available'}>
              Save username
            </button>
          </div>
          <small>{availability === 'available' ? 'Available. ' : availability === 'taken' ? 'Unavailable. ' : ''}3-24 characters. Once claimed, it cannot be renamed or recycled.</small>
        </div>
      )}

      <label className="account-profile__field">
        <span>Display name</span>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} />
      </label>
      <label className="account-profile__field">
        <span>Avatar image URL</span>
        <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="Optional" maxLength={2000} />
      </label>
      <label className="account-profile__file">
        <span>Or choose a small image</span>
        <input type="file" accept="image/*" onChange={(event) => handleAvatar(event.target.files?.[0])} />
      </label>
      {(localError || error) && <p className="account-profile__error">{localError ?? error}</p>}
      {saved && <p className="account-profile__saved">Profile saved.</p>}
      <button className="btn btn--ghost account-profile__save" onClick={() => void save()} disabled={loading}>
        {loading ? 'Saving…' : 'Save profile'}
      </button>
    </section>
  )
}

function SyncLine() {
  const status = useSync((s) => s.status)
  const lastSyncedAt = useSync((s) => s.lastSyncedAt)
  const label =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'error'
        ? 'Sync failed — will retry'
        : lastSyncedAt
          ? `Synced ✓ ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Not synced yet'
  return (
    <div className="sync-line">
      <span className={`sync-line__text ${status === 'error' ? 'is-error' : ''}`}>{label}</span>
      <button
        className="sync-line__btn"
        onClick={() => syncNow()}
        disabled={status === 'syncing'}
      >
        Sync now
      </button>
    </div>
  )
}
