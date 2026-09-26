import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SubPage } from '../../components/SubPage'
import {
  TEAM_DESCRIPTION_LIMIT,
  TEAM_LOGO_LIMIT_BYTES,
  TEAM_MEMBER_LIMIT,
  TEAM_NAME_LIMIT,
  generatedTeamLogo,
  teamRoleLabel,
  type Team,
  type TeamMember,
} from '../../domain/teams'
import { useAuth } from '../../state/auth'
import { useProfile } from '../../state/profile'
import { useTeams } from '../../state/teams'
import './Teams.css'

function readImage(file: File, onLoad: (value: string) => void, onError: (value: string) => void) {
  if (!file.type.startsWith('image/')) {
    onError('Choose an image file.')
    return
  }
  if (file.size > TEAM_LOGO_LIMIT_BYTES) {
    onError('Images must be 256 KB or smaller.')
    return
  }
  const reader = new FileReader()
  reader.onload = () => onLoad(String(reader.result))
  reader.onerror = () => onError('Could not read that image.')
  reader.readAsDataURL(file)
}

function Logo({ src, name, size = 'md' }: { src: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  return src ? <img className={`team-logo team-logo--${size}`} src={src} alt="" /> : <span className={`team-logo team-logo--${size} team-logo--fallback`}>{name.slice(0, 2).toUpperCase()}</span>
}

function auditLabel(eventType: string): string {
  return eventType
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function Teams() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)
  const profile = useProfile((state) => state.profile)
  const teams = useTeams((state) => state.teams)
  const invitations = useTeams((state) => state.invitations)
  const selectedTeamId = useTeams((state) => state.selectedTeamId)
  const selectTeam = useTeams((state) => state.selectTeam)
  const loading = useTeams((state) => state.loading)
  const error = useTeams((state) => state.error)
  const [view, setView] = useState<'list' | 'create'>(teamId ? 'list' : 'list')

  useEffect(() => {
    if (teamId && teams.some((team) => team.id === teamId)) selectTeam(teamId)
  }, [selectTeam, teamId, teams])

  const selected = teams.find((team) => team.id === (teamId ?? selectedTeamId)) ?? null

  if (!user) {
    return (
      <SubPage title="Teams">
        <div className="team-empty team-empty--account">
          <div className="team-empty__mark">↗</div>
          <h2>Teams need an account</h2>
          <p>Personal rides and exploration stay local, but membership and sharing need a signed-in account.</p>
          <Link to="/settings" className="btn btn--primary">Open account settings</Link>
        </div>
      </SubPage>
    )
  }

  if (!profile?.username) {
    return (
      <SubPage title="Teams">
        <div className="team-empty team-empty--account">
          <div className="team-empty__mark">@</div>
          <h2>Choose your team handle first</h2>
          <p>Members see your display name and <strong>@username</strong>. Your login email never becomes a team identifier.</p>
          <Link to="/settings" className="btn btn--primary">Set up Profile</Link>
        </div>
      </SubPage>
    )
  }

  if (teamId && selected) {
    return <TeamDetail team={selected} />
  }

  return (
    <SubPage title="Teams">
      {error && <div className="team-alert team-alert--error">{error}</div>}
      {view === 'create' ? (
        <CreateTeam onCancel={() => setView('list')} onCreated={(id) => navigate(`/teams/${id}`)} />
      ) : (
        <>
          <div className="team-page-heading">
            <div>
              <p className="eyebrow">Shared exploration</p>
              <h2>Your teams</h2>
              <p>Tiles can be shared without exposing routes, rides, rewards, or wallet balances.</p>
            </div>
            <button className="btn btn--primary team-page-heading__action" onClick={() => setView('create')}>Create team</button>
          </div>
          {invitations.length > 0 && <InvitationList invitations={invitations} />}
          {loading && !teams.length ? (
            <div className="team-loading">Loading teams…</div>
          ) : teams.length ? (
            <div className="team-list">
              {teams.map((team) => (
                <Link key={team.id} to={`/teams/${team.id}`} className="team-list__item">
                  <Logo src={team.logoUrl} name={team.name} />
                  <span className="team-list__copy">
                    <strong>{team.name}</strong>
                    <small>{teamRoleLabel(team.role)} · {team.memberCount} member{team.memberCount === 1 ? '' : 's'}</small>
                  </span>
                  <span className="team-list__arrow" aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="team-empty">
              <div className="team-empty__mark">+</div>
              <h2>No teams yet</h2>
              <p>Start a private map for a crew, club, or weekend expedition.</p>
              <button className="btn btn--primary" onClick={() => setView('create')}>Create your first team</button>
            </div>
          )}
          <p className="team-privacy-note">Team maps show the union of contributed tiles. Individual rides, paths, timestamps, rewards, and wallet data remain private.</p>
        </>
      )}
    </SubPage>
  )
}

export function TeamHistory() {
  const { teamId } = useParams()
  const team = useTeams((state) => state.teams.find((candidate) => candidate.id === teamId)) ?? null
  const loading = useTeams((state) => state.loading)

  if (!team) {
    return (
      <SubPage title="Team history" back="/teams">
        <div className="team-empty">
          <h2>{loading ? 'Loading team history…' : 'Team not found'}</h2>
          {!loading && <p>This team is no longer available to your account.</p>}
        </div>
      </SubPage>
    )
  }

  return <TeamHistoryView team={team} />
}

function TeamHistoryView({ team }: { team: Team }) {
  const members = useTeams((state) => state.membersByTeam[team.id] ?? [])
  const audit = useTeams((state) => state.auditByTeam[team.id] ?? [])
  const auditHasMore = useTeams((state) => state.auditHasMoreByTeam[team.id] ?? false)
  const auditLoading = useTeams((state) => state.auditLoadingByTeam[team.id] ?? false)
  const storeError = useTeams((state) => state.error)
  const refreshTeam = useTeams((state) => state.refreshTeam)
  const loadMoreAudit = useTeams((state) => state.loadMoreAudit)
  const memberNames = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members])
  const canReadHistory = team.role === 'captain' || team.role === 'officer'

  useEffect(() => {
    void refreshTeam(team.id).catch(() => undefined)
  }, [refreshTeam, team.id])

  if (!canReadHistory) {
    return (
      <SubPage title="Team history" back={`/teams/${team.id}`}>
        <div className="team-empty">
          <h2>History is restricted</h2>
          <p>Only Captains and Officers can view team changes.</p>
        </div>
      </SubPage>
    )
  }

  return (
    <SubPage title="Team history" back={`/teams/${team.id}`}>
      {storeError && <div className="team-alert team-alert--error">{storeError}</div>}
      <section className="team-section team-audit team-history">
        <div className="team-section__heading">
          <div>
            <p className="eyebrow">{team.name}</p>
            <h2>Membership and team changes</h2>
          </div>
          <span className="team-section__count">{auditHasMore ? `${audit.length}+` : audit.length}</span>
        </div>
        {audit.length ? (
          <div className="team-audit__list">
            {audit.map((event) => {
              const actor = event.actorUserId ? memberNames.get(event.actorUserId) : null
              const affected = event.affectedUserId ? memberNames.get(event.affectedUserId) : null
              return (
                <div key={event.id} className="team-audit__item">
                  <div>
                    <strong>{auditLabel(event.eventType)}</strong>
                    <small>{actor ? `${actor.displayName}${actor.username ? ` · @${actor.username}` : ''}` : 'Former member'}{affected && affected.userId !== event.actorUserId ? ` · ${affected.displayName}` : ''}</small>
                  </div>
                  <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="team-section__intro">Membership and team changes will appear here.</p>
        )}
        {auditHasMore && <button className="btn btn--ghost team-history__load-more" onClick={() => void loadMoreAudit(team.id)} disabled={auditLoading}>{auditLoading ? 'Loading older entries…' : 'Load older entries'}</button>}
      </section>
    </SubPage>
  )
}

function CreateTeam({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const createTeam = useTeams((state) => state.createTeam)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [customLogo, setCustomLogo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!customLogo) setLogoUrl(name.trim() ? generatedTeamLogo(name) : '')
  }, [customLogo, name])

  const submit = async () => {
    if (!name.trim() || name.trim().length > TEAM_NAME_LIMIT) {
      setError(`Choose a team name between 1 and ${TEAM_NAME_LIMIT} characters.`)
      return
    }
    if (description.length > TEAM_DESCRIPTION_LIMIT) {
      setError(`Keep the description under ${TEAM_DESCRIPTION_LIMIT} characters.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createTeam(name.trim(), description.trim(), logoUrl || generatedTeamLogo(name))
      const id = useTeams.getState().selectedTeamId
      if (id) onCreated(id)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not create team.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="team-form">
      <div className="team-form__topline">
        <div>
          <p className="eyebrow">New shared map</p>
          <h2>Create a team</h2>
        </div>
        <Logo src={logoUrl} name={name || 'VT'} size="lg" />
      </div>
      <label className="team-field">
        <span>Team name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={TEAM_NAME_LIMIT} autoFocus />
        <small>{name.length}/{TEAM_NAME_LIMIT}</small>
      </label>
      <label className="team-field">
        <span>Description</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={TEAM_DESCRIPTION_LIMIT} rows={4} placeholder="What is this crew exploring?" />
        <small>{description.length}/{TEAM_DESCRIPTION_LIMIT}</small>
      </label>
      <label className="team-field">
        <span>Logo image</span>
        <input type="file" accept="image/*" onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) readImage(file, (value) => { setCustomLogo(true); setLogoUrl(value); setError(null) }, setError)
        }} />
        <small>Optional. A generated mark is used when no image is supplied.</small>
      </label>
      <div className="team-disclosure">
        <strong>What members share</strong>
        <p>Joining a team shares explored tile identifiers, including your existing explored cells and future accepted cells. Your rides, routes, ride history, wallet, rewards, and timestamps stay private.</p>
      </div>
      {error && <div className="team-alert team-alert--error">{error}</div>}
      <div className="team-form__actions">
        <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn--primary" onClick={() => void submit()} disabled={saving}>{saving ? 'Creating…' : 'Create team'}</button>
      </div>
    </section>
  )
}

function InvitationList({ invitations }: { invitations: ReturnType<typeof useTeams.getState>['invitations'] }) {
  const respond = useTeams((state) => state.respond)
  const [busy, setBusy] = useState<string | null>(null)
  const [consent, setConsent] = useState<Record<string, boolean>>({})
  const accept = async (id: string) => {
    if (!consent[id]) return
    setBusy(id)
    try { await respond(id, true, true) } catch { /* store keeps the visible error */ } finally { setBusy(null) }
  }
  const decline = async (id: string) => {
    setBusy(id)
    try { await respond(id, false, false) } catch { /* store keeps the visible error */ } finally { setBusy(null) }
  }
  return (
    <section className="team-section">
      <div className="team-section__heading">
        <div>
          <p className="eyebrow">Waiting for you</p>
          <h2>Team invitations</h2>
        </div>
        <span className="team-section__count">{invitations.length}</span>
      </div>
      <div className="invitation-list">
        {invitations.map((invitation) => (
          <article key={invitation.id} className="invitation-item">
            <div className="invitation-item__top">
              <Logo src={invitation.teamLogoUrl} name={invitation.teamName} size="sm" />
              <div>
                <strong>{invitation.teamName}</strong>
                <small>From {invitation.inviterDisplayName}{invitation.inviterUsername ? ` (@${invitation.inviterUsername})` : ''}</small>
              </div>
            </div>
            <p>{invitation.teamDescription || 'A private VeloTerra exploration team.'}</p>
            <div className="team-disclosure team-disclosure--compact">
              <strong>Before you join</strong>
              <p>Your existing explored cells and future accepted cells will contribute to this team map. Individual rides, routes, wallet, rewards, and ride history remain private.</p>
            </div>
            <label className="consent-check">
              <input type="checkbox" checked={consent[invitation.id] ?? false} onChange={(event) => setConsent((current) => ({ ...current, [invitation.id]: event.target.checked }))} />
              <span>I understand and agree to share explored tiles with this team.</span>
            </label>
            <div className="invitation-item__actions">
              <button className="btn btn--ghost" onClick={() => void decline(invitation.id)} disabled={busy === invitation.id}>Decline</button>
              <button className="btn btn--primary" onClick={() => void accept(invitation.id)} disabled={busy === invitation.id || !consent[invitation.id]}>{busy === invitation.id ? 'Working…' : 'Accept and join'}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function TeamDetail({ team }: { team: Team }) {
  const navigate = useNavigate()
  const members = useTeams((state) => state.membersByTeam[team.id] ?? [])
  const recommendations = useTeams((state) => state.recommendationsByTeam[team.id] ?? [])
  const outgoing = useTeams((state) => state.outgoingInvitationsByTeam[team.id] ?? [])
  const presence = useTeams((state) => state.presenceByTeam[team.id] ?? [])
  const pendingCells = useTeams((state) => state.pendingCellCount)
  const refreshTeam = useTeams((state) => state.refreshTeam)
  const invite = useTeams((state) => state.invite)
  const recommend = useTeams((state) => state.recommend)
  const review = useTeams((state) => state.reviewRecommendation)
  const updateDetails = useTeams((state) => state.updateDetails)
  const changeRole = useTeams((state) => state.changeRole)
  const transferCaptain = useTeams((state) => state.transferCaptain)
  const removeMember = useTeams((state) => state.removeMember)
  const leave = useTeams((state) => state.leave)
  const revokeInvitation = useTeams((state) => state.revokeInvitation)
  const deleteTeam = useTeams((state) => state.deleteTeam)
  const storeError = useTeams((state) => state.error)
  const [showInvite, setShowInvite] = useState(false)
  const [showRecommend, setShowRecommend] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null)
  const [showLeave, setShowLeave] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const canInvite = team.role === 'captain' || team.role === 'officer'
  const isCaptain = team.role === 'captain'

  useEffect(() => {
    void refreshTeam(team.id)
    const timer = window.setInterval(() => void refreshTeam(team.id), 15_000)
    return () => window.clearInterval(timer)
  }, [refreshTeam, team.id])

  const run = async (action: () => Promise<void>, success: string) => {
    setMessage(null)
    try {
      await action()
      setMessage(success)
    } catch {
      // The store exposes the server error below the header.
    }
  }

  const handleLeave = async () => {
    setShowLeave(false)
    await run(() => leave(team.id), 'You left the team.')
    if (!useTeams.getState().teams.some((candidate) => candidate.id === team.id)) navigate('/teams')
  }

  const handleDelete = async () => {
    if (deleteConfirmation !== 'DELETE') return
    await run(() => deleteTeam(team.id), 'Team deleted.')
    if (!useTeams.getState().teams.some((candidate) => candidate.id === team.id)) navigate('/teams')
  }

  const transferTarget = members.find((member) => member.userId === transferTargetId && member.role === 'officer') ?? null
  const handleTransfer = async () => {
    if (!transferTarget) return
    setShowTransfer(false)
    setTransferTargetId(null)
    await run(() => transferCaptain(team.id, transferTarget.userId), `Captain transferred to ${transferTarget.displayName}.`)
  }

  const memberNames = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members])
  const pendingOutgoing = outgoing.filter((invitation) => invitation.status === 'pending' && new Date(invitation.expiresAt).getTime() > Date.now())
  const pendingRecommendations = recommendations.filter((recommendation) => recommendation.status === 'pending'
    && !memberNames.has(recommendation.prospectiveUserId)
    && !pendingOutgoing.some((invitation) => invitation.inviteeUserId === recommendation.prospectiveUserId))

  return (
    <SubPage title={team.name}>
      <div className="team-detail__hero">
        <Logo src={team.logoUrl} name={team.name} size="lg" />
        <div className="team-detail__hero-copy">
          <p className="eyebrow">{teamRoleLabel(team.role)} · {members.length || team.memberCount}/{TEAM_MEMBER_LIMIT} members</p>
          <h2>{team.name}</h2>
          <p>{team.description || 'A private map for shared exploration.'}</p>
        </div>
      </div>
      {(storeError || message) && <div className={`team-alert ${storeError ? 'team-alert--error' : 'team-alert--success'}`}>{storeError ?? message}</div>}

      <div className="team-detail__actions">
        <Link to={`/explore?team=${team.id}`} className="btn btn--primary">Open team map</Link>
        {canInvite && <button className="btn btn--ghost" onClick={() => setShowInvite((current) => !current)}>Invite member</button>}
      </div>
      {pendingCells > 0 && <div className="team-sync-note">{pendingCells.toLocaleString()} explored tile{pendingCells === 1 ? '' : 's'} waiting to sync. Your ride can continue offline.</div>}

      {showInvite && <InviteForm onSubmit={(username) => run(() => invite(team.id, username), 'Invitation sent.')} onClose={() => setShowInvite(false)} />}
      <LivePresence people={presence.map((item) => ({ ...item, member: memberNames.get(item.userId) }))} />

      <section className="team-section">
        <div className="team-section__heading"><div><p className="eyebrow">The crew</p><h2>Members</h2></div><span className="team-section__count">{members.length}</span></div>
        <div className="member-list">
          {members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              canManage={isCaptain && member.role !== 'captain'}
              onChangeRole={(role) => run(() => changeRole(team.id, member.userId, role), `${member.displayName} is now an ${role === 'officer' ? 'Officer' : 'Member'}.`)}
              onRemove={() => run(() => removeMember(team.id, member.userId), `${member.displayName} was removed.`)}
            />
          ))}
        </div>
      </section>

      <section className="team-section">
        <div className="team-section__heading"><div><p className="eyebrow">Bring someone along</p><h2>Recommendations</h2></div></div>
        <p className="team-section__intro">Recommendations are private to the recommender and members with invite permission. They are not invitations until a Captain or Officer sends one.</p>
        <button className="btn btn--ghost" onClick={() => setShowRecommend((current) => !current)}>{showRecommend ? 'Close recommendation' : 'Recommend a member'}</button>
        {showRecommend && <RecommendForm onSubmit={(username, note) => run(() => recommend(team.id, username, note), 'Recommendation submitted.')} />}
        {!!pendingRecommendations.length && <div className="recommendation-list">{pendingRecommendations.map((recommendation) => (
          <article key={recommendation.id} className="recommendation-item">
            <div><strong>@{recommendation.prospectiveUsername}</strong><small>{recommendation.status} · {new Date(recommendation.createdAt).toLocaleDateString()}</small></div>
            {recommendation.note && <p>{recommendation.note}</p>}
            {canInvite && recommendation.status === 'pending' && <div className="recommendation-item__actions"><button className="text-btn" onClick={() => void run(() => review(recommendation.id, 'invite'), 'Invitation sent.')}>Invite</button><button className="text-btn text-btn--muted" onClick={() => void run(() => review(recommendation.id, 'decline'), 'Recommendation declined.')}>Decline</button><button className="text-btn text-btn--muted" onClick={() => void run(() => review(recommendation.id, 'dismiss'), 'Recommendation dismissed.')}>Dismiss</button></div>}
          </article>
        ))}</div>}
      </section>

      {canInvite && !!pendingOutgoing.length && <section className="team-section"><div className="team-section__heading"><div><p className="eyebrow">Awaiting response</p><h2>Sent invitations</h2></div></div><div className="outgoing-list">{pendingOutgoing.map((invitation) => <div key={invitation.id} className="outgoing-item"><span>@{invitation.inviteeUsername}<small>{invitation.status} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></span><button className="text-btn text-btn--muted" onClick={() => void run(() => revokeInvitation(invitation.id), 'Invitation revoked.')}>Revoke</button></div>)}</div></section>}

      {canInvite && <section className="team-section team-audit"><div className="team-section__heading"><div><p className="eyebrow">Accountability</p><h2>Team history</h2></div></div><Link to={`/teams/${team.id}/history`} className="btn btn--ghost">Open team history</Link></section>}

      {isCaptain && <section className="team-section"><div className="team-section__heading"><div><p className="eyebrow">Captain tools</p><h2>Team details</h2></div></div><button className="btn btn--ghost" onClick={() => setShowEdit((current) => !current)}>{showEdit ? 'Close editor' : 'Edit name, description, or logo'}</button>{showEdit && <EditTeamForm team={team} onSubmit={(name, description, logo) => run(() => updateDetails(team.id, name, description, logo), 'Team details updated.')} />}</section>}

      <section className="team-danger">
        <div><p className="eyebrow">Membership</p><h2>{isCaptain ? 'Transfer or delete' : 'Leave team'}</h2><p>{isCaptain ? 'The only Captain cannot leave. Transfer Captain first, or delete the team after reviewing the impact.' : 'Leaving removes your shared tile contributions from this team view unless another active member contributed the same tile. Personal data stays untouched.'}</p></div>
        {!isCaptain && <>
          <button className="danger__btn" onClick={() => setShowLeave((current) => !current)}>{showLeave ? 'Keep membership' : 'Leave team'}</button>
          {showLeave && <div className="team-danger__confirm">
            <p>Leave this team? Your personal rides, wallet, rewards, and explored cells stay on your account.</p>
            <div className="team-danger__confirm-actions"><button className="btn btn--ghost" onClick={() => setShowLeave(false)}>Cancel</button><button className="danger__btn" onClick={() => void handleLeave()}>Leave team</button></div>
          </div>}
        </>}
        {isCaptain && <>
          <button className="btn btn--ghost team-danger__transfer-toggle" onClick={() => { setShowTransfer((current) => !current); setTransferTargetId(null) }}>{showTransfer ? 'Cancel transfer' : 'Transfer captain'}</button>
          {showTransfer && <div className="team-danger__transfer">
            <p>Choose an Officer to make Captain. You will become a Member.</p>
            <div className="transfer-member-list">
              {members.filter((member) => member.role === 'officer').map((member) => (
                <label key={member.userId} className={`transfer-member ${transferTargetId === member.userId ? 'transfer-member--selected' : ''}`}>
                  <input type="radio" name="transfer-captain" checked={transferTargetId === member.userId} onChange={() => setTransferTargetId(member.userId)} />
                  <span className={`member-avatar member-avatar--${member.role}`}>{member.displayName.slice(0, 1).toUpperCase()}</span>
                  <span className="transfer-member__copy"><strong>{member.displayName}</strong><small>{member.username ? `@${member.username}` : 'No username'} · {teamRoleLabel(member.role)}</small></span>
                </label>
              ))}
            </div>
            {transferTarget && <div className="team-danger__confirm"><p>Transfer Captain to <strong>{transferTarget.displayName}</strong>? You will become a Member.</p><div className="team-danger__confirm-actions"><button className="btn btn--ghost" onClick={() => setTransferTargetId(null)}>Cancel</button><button className="btn btn--primary" onClick={() => void handleTransfer()}>Confirm transfer</button></div></div>}
          </div>}
          <button className="danger__btn" onClick={() => { setShowDelete((current) => !current); setDeleteConfirmation('') }}>{showDelete ? 'Cancel delete' : 'Delete team'}</button>
          {showDelete && <div className="team-danger__confirm"><p>This removes all team membership, invitations, recommendations, shared cells, live positions, and audit history. Type DELETE to continue.</p><input aria-label="Type DELETE to confirm team deletion" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="DELETE" autoComplete="off" /><button className="danger__btn" onClick={() => void handleDelete()} disabled={deleteConfirmation !== 'DELETE'}>Confirm deletion</button></div>}
        </>}
      </section>
    </SubPage>
  )
}

function InviteForm({ onSubmit, onClose }: { onSubmit: (username: string) => Promise<void>; onClose: () => void }) {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => { if (!username.trim()) return; setBusy(true); try { await onSubmit(username.trim()); setUsername(''); onClose() } finally { setBusy(false) } }
  return <div className="inline-form"><label className="team-field"><span>Exact username</span><div className="inline-form__input"><span>@</span><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="handle" autoComplete="off" /><button className="btn btn--primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button></div><small>No email lookup. The invitation resolves to the immutable account ID.</small></label><button className="text-btn text-btn--muted" onClick={onClose}>Cancel</button></div>
}

function RecommendForm({ onSubmit }: { onSubmit: (username: string, note: string) => Promise<void> }) {
  const [username, setUsername] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => { if (!username.trim()) return; setBusy(true); try { await onSubmit(username.trim(), note.trim()); setUsername(''); setNote('') } finally { setBusy(false) } }
  return <div className="inline-form"><label className="team-field"><span>Exact username</span><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="handle" autoComplete="off" /></label><label className="team-field"><span>Optional note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder="Why would they fit this team?" /></label><button className="btn btn--primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Sending…' : 'Submit recommendation'}</button></div>
}

function EditTeamForm({ team, onSubmit }: { team: Team; onSubmit: (name: string, description: string, logoUrl: string) => Promise<void> }) {
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description)
  const [logoUrl, setLogoUrl] = useState(team.logoUrl)
  const [busy, setBusy] = useState(false)
  const submit = async () => { setBusy(true); try { await onSubmit(name.trim(), description.trim(), logoUrl) } finally { setBusy(false) } }
  return <div className="inline-form"><label className="team-field"><span>Team name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={TEAM_NAME_LIMIT} /></label><label className="team-field"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={TEAM_DESCRIPTION_LIMIT} rows={3} /></label><label className="team-field"><span>Replace logo</span><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) readImage(file, setLogoUrl, () => undefined) }} /></label><button className="btn btn--primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button></div>
}

function MemberRow({ member, canManage, onChangeRole, onRemove }: { member: TeamMember; canManage: boolean; onChangeRole: (role: 'officer' | 'member') => Promise<void>; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action() } finally { setBusy(false) } }
  const confirmRemove = async () => { await run(onRemove); setConfirmingRemove(false) }
  return <div className="member-row"><div className="member-row__identity"><div className={`member-avatar member-avatar--${member.role}`}>{member.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{member.displayName}</strong><small>{member.username ? `@${member.username}` : 'No username'} · joined {new Date(member.joinedAt).toLocaleDateString()}</small></div></div><span className={`role-pill role-pill--${member.role}`}>{teamRoleLabel(member.role)}</span>{canManage && <><div className="member-row__actions"><div className="member-role-control" role="group" aria-label={`Role for ${member.displayName}`}>{(['member', 'officer'] as const).map((role) => <button key={role} type="button" className={`member-role-control__option ${member.role === role ? 'member-role-control__option--selected' : ''}`} aria-pressed={member.role === role} onClick={() => { if (member.role !== role) void run(() => onChangeRole(role)) }} disabled={busy}>{teamRoleLabel(role)}</button>)}</div><button className="text-btn text-btn--danger" onClick={() => setConfirmingRemove(true)} disabled={busy}>Remove</button></div>{confirmingRemove && <div className="member-row__confirm"><div className="member-row__confirm-copy"><strong>Remove {member.displayName}?</strong><span>They lose team access and live-map visibility. Personal data stays private.</span></div><div className="member-row__confirm-actions"><button className="text-btn text-btn--muted" onClick={() => setConfirmingRemove(false)} disabled={busy}>Cancel</button><button className="text-btn text-btn--danger" onClick={() => void confirmRemove()} disabled={busy}>{busy ? 'Removing…' : 'Remove member'}</button></div></div>}</>}</div>
}

function LivePresence({ people }: { people: Array<{ teamId: string; userId: string; latitude: number; longitude: number; updatedAt: string; member?: TeamMember }> }) {
  if (!people.length) return <div className="live-presence live-presence--empty"><span className="live-presence__dot" />No team member is sharing a live position right now.</div>
  return <section className="live-presence"><div className="live-presence__heading"><span className="live-presence__dot" />Live positions · visible only to this team</div>{people.map((person) => <div key={person.userId} className="live-presence__person"><strong>{person.member?.displayName ?? 'Team member'}</strong><span>@{person.member?.username ?? 'unknown'} · {person.latitude.toFixed(4)}, {person.longitude.toFixed(4)}</span><small>updated {new Date(person.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>)}</section>
}