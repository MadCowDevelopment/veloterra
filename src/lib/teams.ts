import { supabase } from './supabase'
import type {
  Team,
  TeamAuditEvent,
  TeamInvitation,
  TeamMember,
  TeamPresence,
  TeamRecommendation,
  TeamRole,
} from '../domain/teams'

const TEAM_AUDIT_PAGE_SIZE = 50

function teamRole(value: unknown): TeamRole {
  return value === 'captain' || value === 'officer' ? value : 'member'
}

function requireData<T>(data: T | null, message: string): T {
  if (data == null) throw new Error(message)
  return data
}

export async function getMyTeams(): Promise<Team[]> {
  const { data, error } = await supabase.rpc('get_my_teams')
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.team_id),
    name: String(row.name),
    description: String(row.description ?? ''),
    logoUrl: String(row.logo_url ?? ''),
    captainId: String(row.captain_id),
    role: teamRole(row.role),
    joinedAt: String(row.joined_at),
    memberCount: Number(row.member_count ?? 0),
  }))
}

export async function getMyInvitations(): Promise<TeamInvitation[]> {
  const { data, error } = await supabase.rpc('get_my_invitations')
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.invitation_id),
    teamId: String(row.team_id),
    teamName: String(row.team_name),
    teamDescription: String(row.team_description ?? ''),
    teamLogoUrl: String(row.team_logo_url ?? ''),
    inviterUsername: row.inviter_username ? String(row.inviter_username) : null,
    inviterDisplayName: String(row.inviter_display_name ?? 'VeloTerra rider'),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  }))
}

export interface TeamOutgoingInvitation {
  id: string
  teamId: string
  inviteeUserId: string
  inviteeUsername: string
  status: string
  expiresAt: string
  createdAt: string
}

export async function getTeamInvitations(teamId: string): Promise<TeamOutgoingInvitation[]> {
  const { data, error } = await supabase
    .from('team_invitations')
    .select('id,team_id,invitee_user_id,invitee_username,status,expires_at,created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    teamId: String(row.team_id),
    inviteeUserId: String(row.invitee_user_id),
    inviteeUsername: String(row.invitee_username),
    status: String(row.status),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  }))
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('get_team_members', { p_team_id: teamId })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    userId: String(row.user_id),
    username: row.username ? String(row.username) : null,
    displayName: String(row.display_name ?? 'VeloTerra rider'),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    role: teamRole(row.role),
    joinedAt: String(row.joined_at),
  }))
}

export async function getTeamRecommendations(teamId: string): Promise<TeamRecommendation[]> {
  const { data, error } = await supabase
    .from('team_recommendations')
    .select('id,team_id,recommender_user_id,prospective_user_id,prospective_username,note,status,created_at,reviewed_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    teamId: String(row.team_id),
    recommenderUserId: String(row.recommender_user_id),
    prospectiveUserId: String(row.prospective_user_id),
    prospectiveUsername: String(row.prospective_username),
    note: String(row.note ?? ''),
    status: row.status === 'invited' || row.status === 'declined' || row.status === 'dismissed'
      ? row.status
      : 'pending',
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  }))
}

export async function getTeamCells(teamId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_team_cells', { p_team_id: teamId })
  if (error) throw error
  return ((data ?? []) as Array<{ h3: string }>).map((row) => row.h3)
}

export async function getTeamPresence(teamId: string): Promise<TeamPresence[]> {
  const { data, error } = await supabase
    .from('team_live_presence')
    .select('team_id,user_id,latitude,longitude,updated_at,expires_at')
    .eq('team_id', teamId)
    .gt('expires_at', new Date().toISOString())
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    teamId: String(row.team_id),
    userId: String(row.user_id),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    updatedAt: String(row.updated_at),
    expiresAt: String(row.expires_at),
  }))
}

export interface TeamAuditPage {
  events: TeamAuditEvent[]
  hasMore: boolean
}

export async function getTeamAuditEvents(teamId: string, offset = 0): Promise<TeamAuditPage> {
  const { data, error } = await supabase
    .from('team_audit_events')
    .select('id,team_id,actor_user_id,event_type,affected_user_id,metadata,created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + TEAM_AUDIT_PAGE_SIZE)
  if (error) throw error
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    teamId: String(row.team_id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    eventType: String(row.event_type),
    affectedUserId: row.affected_user_id ? String(row.affected_user_id) : null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {},
    createdAt: String(row.created_at),
  }))
  return {
    events: rows.slice(0, TEAM_AUDIT_PAGE_SIZE),
    hasMore: rows.length > TEAM_AUDIT_PAGE_SIZE,
  }
}

export async function createTeam(name: string, description: string, logoUrl: string): Promise<Team> {
  const { data, error } = await supabase.rpc('create_team', {
    p_name: name,
    p_description: description,
    p_logo_url: logoUrl,
  })
  if (error) throw error
  const row = requireData(data as Record<string, unknown> | null, 'Team was not returned by the server')
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    logoUrl: String(row.logo_url ?? ''),
    captainId: String(row.captain_id),
    role: 'captain',
    joinedAt: String(row.joined_at),
    memberCount: 1,
  }
}

export async function inviteTeamMember(teamId: string, username: string): Promise<void> {
  const { error } = await supabase.rpc('invite_team_member', { p_team_id: teamId, p_username: username })
  if (error) throw error
}

export async function respondToInvitation(
  invitationId: string,
  accept: boolean,
  shareHistorical: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc('respond_to_team_invitation', {
    p_invitation_id: invitationId,
    p_accept: accept,
    p_share_historical: shareHistorical,
  })
  if (error) throw error
  return String(data)
}

export async function recommendTeamMember(teamId: string, username: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('recommend_team_member', {
    p_team_id: teamId,
    p_username: username,
    p_note: note,
  })
  if (error) throw error
}

export async function reviewRecommendation(recommendationId: string, action: 'invite' | 'decline' | 'dismiss'): Promise<void> {
  const { error } = await supabase.rpc('review_team_recommendation', {
    p_recommendation_id: recommendationId,
    p_action: action,
  })
  if (error) throw error
}

export async function updateTeamDetails(teamId: string, name: string, description: string, logoUrl: string): Promise<void> {
  const { error } = await supabase.rpc('update_team_details', {
    p_team_id: teamId,
    p_name: name,
    p_description: description,
    p_logo_url: logoUrl,
  })
  if (error) throw error
}

export async function changeTeamMemberRole(teamId: string, userId: string, role: 'officer' | 'member'): Promise<void> {
  const { error } = await supabase.rpc('change_team_member_role', {
    p_team_id: teamId,
    p_user_id: userId,
    p_role: role,
  })
  if (error) throw error
}

export async function transferTeamCaptain(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_team_captain', { p_team_id: teamId, p_user_id: userId })
  if (error) throw error
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_team_member', { p_team_id: teamId, p_user_id: userId })
  if (error) throw error
}

export async function leaveTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_team', { p_team_id: teamId })
  if (error) throw error
}

export async function revokeTeamInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_team_invitation', { p_invitation_id: invitationId })
  if (error) throw error
}

export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_team', { p_team_id: teamId })
  if (error) throw error
}

export async function addTeamCells(teamId: string, cells: string[]): Promise<void> {
  if (!cells.length) return
  const { error } = await supabase.rpc('add_team_cells', {
    p_team_id: teamId,
    p_cells: cells,
  })
  if (error) throw error
}

export async function upsertLivePresence(
  teamId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const { error } = await supabase.rpc('set_team_live_presence', {
    p_team_id: teamId,
    p_latitude: latitude,
    p_longitude: longitude,
  })
  if (error) throw error
}

export async function removeLivePresence(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('clear_team_live_presence', { p_team_id: teamId })
  if (error) throw error
}

export async function clearAllLivePresence(): Promise<void> {
  const { error } = await supabase.rpc('clear_my_team_presence')
  if (error) throw error
}