export type TeamRole = 'captain' | 'officer' | 'member'

export type TeamInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked'

export type TeamRecommendationStatus = 'pending' | 'invited' | 'declined' | 'dismissed'

export const TEAM_MEMBER_LIMIT = 50
export const INVITATION_TTL_DAYS = 7
export const LIVE_POSITION_TTL_MS = 90_000
export const TEAM_DESCRIPTION_LIMIT = 1000
export const TEAM_NAME_LIMIT = 80
export const TEAM_LOGO_LIMIT_BYTES = 256 * 1024

export interface Profile {
  userId: string
  username: string | null
  usernameNormalized: string | null
  usernameClaimedAt: string | null
  displayName: string
  avatarUrl: string | null
}

export interface Team {
  id: string
  name: string
  description: string
  logoUrl: string
  captainId: string
  role: TeamRole
  joinedAt: string
  memberCount: number
}

export interface TeamMember {
  userId: string
  username: string | null
  displayName: string
  avatarUrl: string | null
  role: TeamRole
  joinedAt: string
}

export interface TeamInvitation {
  id: string
  teamId: string
  teamName: string
  teamDescription: string
  teamLogoUrl: string
  inviterUsername: string | null
  inviterDisplayName: string
  expiresAt: string
  createdAt: string
}

export interface TeamRecommendation {
  id: string
  teamId: string
  recommenderUserId: string
  prospectiveUserId: string
  prospectiveUsername: string
  note: string
  status: TeamRecommendationStatus
  createdAt: string
  reviewedAt: string | null
}

export interface TeamPresence {
  teamId: string
  userId: string
  latitude: number
  longitude: number
  updatedAt: string
  expiresAt: string
}

export interface TeamAuditEvent {
  id: string
  teamId: string
  actorUserId: string | null
  eventType: string
  affectedUserId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,22}[A-Za-z0-9])?$/

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function validateUsername(value: string): string | null {
  const normalized = normalizeUsername(value)
  if (!USERNAME_PATTERN.test(normalized)) {
    return 'Use 3-24 letters, numbers, underscore, or hyphen. Start and end with a letter or number.'
  }
  return null
}

export function generatedTeamLogo(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'VT'
  const escapedInitials = initials.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character)
  const hue = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="hsl(${hue} 48% 25%)"/><circle cx="94" cy="30" r="38" fill="hsl(${(hue + 70) % 360} 78% 62%)" opacity=".22"/><text x="64" y="75" text-anchor="middle" fill="#eaf0ff" font-family="sans-serif" font-size="42" font-weight="800">${escapedInitials}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function teamRoleLabel(role: TeamRole): string {
  return role[0].toUpperCase() + role.slice(1)
}