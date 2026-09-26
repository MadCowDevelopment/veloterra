import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db, type TeamOutboxRow } from '../data/db'
import { useAuth } from './auth'
import {
  addTeamCells,
  changeTeamMemberRole,
  createTeam as createTeamRequest,
  deleteTeam as deleteTeamRequest,
  getMyInvitations,
  getMyTeams,
  getTeamCells,
  getTeamAuditEvents,
  getTeamInvitations,
  getTeamMembers,
  getTeamPresence,
  getTeamRecommendations,
  inviteTeamMember,
  leaveTeam,
  recommendTeamMember,
  removeLivePresence,
  removeTeamMember,
  respondToInvitation,
  reviewRecommendation,
  revokeTeamInvitation,
  transferTeamCaptain,
  updateTeamDetails,
  upsertLivePresence,
  type TeamOutgoingInvitation,
} from '../lib/teams'
import type {
  Team,
  TeamAuditEvent,
  TeamInvitation,
  TeamMember,
  TeamPresence,
  TeamRecommendation,
} from '../domain/teams'

export type TeamSyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface TeamsState {
  teams: Team[]
  invitations: TeamInvitation[]
  selectedTeamId: string | null
  membersByTeam: Record<string, TeamMember[]>
  recommendationsByTeam: Record<string, TeamRecommendation[]>
  outgoingInvitationsByTeam: Record<string, TeamOutgoingInvitation[]>
  cellsByTeam: Record<string, string[]>
  presenceByTeam: Record<string, TeamPresence[]>
  auditByTeam: Record<string, TeamAuditEvent[]>
  auditHasMoreByTeam: Record<string, boolean>
  auditLoadingByTeam: Record<string, boolean>
  loading: boolean
  error: string | null
  syncStatus: TeamSyncStatus
  pendingCellCount: number
  lastSyncedAt: number | null
  load: () => Promise<void>
  refreshTeam: (teamId: string) => Promise<void>
  loadMoreAudit: (teamId: string) => Promise<void>
  selectTeam: (teamId: string | null) => void
  createTeam: (name: string, description: string, logoUrl: string) => Promise<void>
  invite: (teamId: string, username: string) => Promise<void>
  recommend: (teamId: string, username: string, note: string) => Promise<void>
  reviewRecommendation: (id: string, action: 'invite' | 'decline' | 'dismiss') => Promise<void>
  respond: (invitationId: string, accept: boolean, shareHistorical: boolean) => Promise<void>
  updateDetails: (teamId: string, name: string, description: string, logoUrl: string) => Promise<void>
  changeRole: (teamId: string, userId: string, role: 'officer' | 'member') => Promise<void>
  transferCaptain: (teamId: string, userId: string) => Promise<void>
  removeMember: (teamId: string, userId: string) => Promise<void>
  leave: (teamId: string) => Promise<void>
  revokeInvitation: (invitationId: string) => Promise<void>
  deleteTeam: (teamId: string) => Promise<void>
  sync: () => Promise<void>
  sendPresence: (teamId: string, latitude: number, longitude: number) => Promise<void>
  stopPresence: (teamId: string) => Promise<void>
  clear: () => void
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return 'Team action could not be completed'
}

function isMembershipRevoked(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code?: unknown }).code)
    if (code === '42501' || code === '401' || code === '403') return true
  }
  const message = errorText(error).toLowerCase()
  return message.includes('team membership required') || message.includes('active team membership required')
}

function outboxId(teamId: string, userId: string, h3: string): string {
  return `${teamId}:${userId}:${h3}`
}

async function queueTeamCells(teamId: string, userId: string): Promise<number> {
  const cells = await db.cells.toArray()
  if (!cells.length) return db.teamOutbox.where('teamId').equals(teamId).and((row) => row.userId === userId).count()
  const existing = await db.teamOutbox
    .where('teamId')
    .equals(teamId)
    .and((row) => row.userId === userId)
    .toArray()
  const known = new Set(existing.map((row) => row.h3))
  const rows: TeamOutboxRow[] = cells
    .filter((cell) => !known.has(cell.h3))
    .map((cell) => ({
      id: outboxId(teamId, userId, cell.h3),
      teamId,
      userId,
      h3: cell.h3,
      queuedAt: Date.now(),
    }))
  if (rows.length) await db.teamOutbox.bulkPut(rows)
  return existing.length + rows.length
}

async function clearTeamOutbox(teamId: string, userId: string): Promise<void> {
  await db.teamOutbox.where('teamId').equals(teamId).and((row) => row.userId === userId).delete()
}

async function pendingCount(userId: string | null): Promise<number> {
  if (!userId) return 0
  return db.teamOutbox.where('userId').equals(userId).count()
}

const refreshingTeamIds = new Map<string, Promise<void>>()

export const useTeams = create<TeamsState>()(
  persist(
    (set, get) => ({
      teams: [],
      invitations: [],
      selectedTeamId: null,
      membersByTeam: {},
      recommendationsByTeam: {},
      outgoingInvitationsByTeam: {},
      cellsByTeam: {},
      presenceByTeam: {},
      auditByTeam: {},
      auditHasMoreByTeam: {},
      auditLoadingByTeam: {},
      loading: false,
      error: null,
      syncStatus: 'idle',
      pendingCellCount: 0,
      lastSyncedAt: null,

      load: async () => {
        if (get().loading) return
        const user = useAuth.getState().user
        if (!user) {
          get().clear()
          return
        }
        set({ loading: true, error: null })
        try {
          const [teams, invitations] = await Promise.all([getMyTeams(), getMyInvitations()])
          const savedSelection = get().selectedTeamId
          const selectedTeamId = teams.some((team) => team.id === savedSelection)
            ? savedSelection
            : teams[0]?.id ?? null
          const activeTeamIds = new Set(teams.map((team) => team.id))
          set((state) => ({
            teams,
            invitations,
            selectedTeamId,
            loading: false,
            membersByTeam: Object.fromEntries(Object.entries(state.membersByTeam).filter(([id]) => activeTeamIds.has(id))),
            recommendationsByTeam: Object.fromEntries(Object.entries(state.recommendationsByTeam).filter(([id]) => activeTeamIds.has(id))),
            outgoingInvitationsByTeam: Object.fromEntries(Object.entries(state.outgoingInvitationsByTeam).filter(([id]) => activeTeamIds.has(id))),
            cellsByTeam: Object.fromEntries(Object.entries(state.cellsByTeam).filter(([id]) => activeTeamIds.has(id))),
            presenceByTeam: Object.fromEntries(Object.entries(state.presenceByTeam).filter(([id]) => activeTeamIds.has(id))),
            auditByTeam: Object.fromEntries(Object.entries(state.auditByTeam).filter(([id]) => activeTeamIds.has(id))),
            auditHasMoreByTeam: Object.fromEntries(Object.entries(state.auditHasMoreByTeam).filter(([id]) => activeTeamIds.has(id))),
            auditLoadingByTeam: Object.fromEntries(Object.entries(state.auditLoadingByTeam).filter(([id]) => activeTeamIds.has(id))),
          }))
          if (selectedTeamId) await get().refreshTeam(selectedTeamId)
          set({ pendingCellCount: await pendingCount(user.id) })
        } catch (error) {
          set({ loading: false, error: errorText(error) })
        }
      },

      refreshTeam: async (teamId) => {
        const existingRefresh = refreshingTeamIds.get(teamId)
        if (existingRefresh) return existingRefresh

        const refreshPromise = (async () => {
          try {
            const currentTeam = get().teams.find((team) => team.id === teamId)
            const canReadAudit = currentTeam?.role === 'captain' || currentTeam?.role === 'officer'
            const [members, recommendations, outgoing, cells, presence, auditPage] = await Promise.all([
              getTeamMembers(teamId),
              getTeamRecommendations(teamId),
              getTeamInvitations(teamId),
              getTeamCells(teamId),
              getTeamPresence(teamId),
              canReadAudit ? getTeamAuditEvents(teamId) : Promise.resolve({ events: [], hasMore: false }),
            ])
            set((state) => ({
              membersByTeam: { ...state.membersByTeam, [teamId]: members },
              recommendationsByTeam: { ...state.recommendationsByTeam, [teamId]: recommendations },
              outgoingInvitationsByTeam: { ...state.outgoingInvitationsByTeam, [teamId]: outgoing },
              cellsByTeam: { ...state.cellsByTeam, [teamId]: cells },
              presenceByTeam: { ...state.presenceByTeam, [teamId]: presence },
              auditByTeam: { ...state.auditByTeam, [teamId]: auditPage.events },
              auditHasMoreByTeam: { ...state.auditHasMoreByTeam, [teamId]: auditPage.hasMore },
              auditLoadingByTeam: { ...state.auditLoadingByTeam, [teamId]: false },
              error: null,
            }))
          } catch (error) {
            if (isMembershipRevoked(error)) {
              set((state) => ({
                teams: state.teams.filter((team) => team.id !== teamId),
                selectedTeamId: state.selectedTeamId === teamId
                  ? state.teams.find((team) => team.id !== teamId)?.id ?? null
                  : state.selectedTeamId,
                membersByTeam: Object.fromEntries(Object.entries(state.membersByTeam).filter(([id]) => id !== teamId)),
                recommendationsByTeam: Object.fromEntries(Object.entries(state.recommendationsByTeam).filter(([id]) => id !== teamId)),
                outgoingInvitationsByTeam: Object.fromEntries(Object.entries(state.outgoingInvitationsByTeam).filter(([id]) => id !== teamId)),
                cellsByTeam: Object.fromEntries(Object.entries(state.cellsByTeam).filter(([id]) => id !== teamId)),
                presenceByTeam: Object.fromEntries(Object.entries(state.presenceByTeam).filter(([id]) => id !== teamId)),
                auditByTeam: Object.fromEntries(Object.entries(state.auditByTeam).filter(([id]) => id !== teamId)),
                auditHasMoreByTeam: Object.fromEntries(Object.entries(state.auditHasMoreByTeam).filter(([id]) => id !== teamId)),
                auditLoadingByTeam: Object.fromEntries(Object.entries(state.auditLoadingByTeam).filter(([id]) => id !== teamId)),
                error: 'Your access to this team has ended.',
              }))
              return
            }
            set({ error: errorText(error) })
            throw error
          }
        })()
        refreshingTeamIds.set(teamId, refreshPromise)
        try {
          await refreshPromise
        } finally {
          if (refreshingTeamIds.get(teamId) === refreshPromise) refreshingTeamIds.delete(teamId)
        }
      },

      loadMoreAudit: async (teamId) => {
        const state = get()
        if (state.auditLoadingByTeam[teamId] || !state.auditHasMoreByTeam[teamId]) return
        const offset = state.auditByTeam[teamId]?.length ?? 0
        set((current) => ({
          auditLoadingByTeam: { ...current.auditLoadingByTeam, [teamId]: true },
          error: null,
        }))
        try {
          const page = await getTeamAuditEvents(teamId, offset)
          set((current) => {
            const existing = current.auditByTeam[teamId] ?? []
            const existingIds = new Set(existing.map((event) => event.id))
            const appended = page.events.filter((event) => !existingIds.has(event.id))
            return {
              auditByTeam: { ...current.auditByTeam, [teamId]: [...existing, ...appended] },
              auditHasMoreByTeam: { ...current.auditHasMoreByTeam, [teamId]: page.hasMore },
              auditLoadingByTeam: { ...current.auditLoadingByTeam, [teamId]: false },
            }
          })
        } catch (error) {
          set((current) => ({
            auditLoadingByTeam: { ...current.auditLoadingByTeam, [teamId]: false },
            error: errorText(error),
          }))
          throw error
        }
      },

      selectTeam: (teamId) => {
        set({ selectedTeamId: teamId })
        if (teamId) void get().refreshTeam(teamId)
      },

      createTeam: async (name, description, logoUrl) => {
        try {
          const team = await createTeamRequest(name, description, logoUrl)
          set((state) => ({ teams: [...state.teams, team], selectedTeamId: team.id, error: null }))
          await get().refreshTeam(team.id)
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      invite: async (teamId, username) => {
        try {
          await inviteTeamMember(teamId, username)
          await get().refreshTeam(teamId)
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      recommend: async (teamId, username, note) => {
        try {
          await recommendTeamMember(teamId, username, note)
          await get().refreshTeam(teamId)
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      reviewRecommendation: async (id, action) => {
        try {
          await reviewRecommendation(id, action)
          set({ error: null })
          const teamId = get().selectedTeamId
          if (teamId) await get().refreshTeam(teamId)
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      respond: async (invitationId, accept, shareHistorical) => {
        try {
          await respondToInvitation(invitationId, accept, shareHistorical)
          await get().load()
          if (accept) await get().sync()
          set({ pendingCellCount: await pendingCount(useAuth.getState().user?.id ?? null) })
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      updateDetails: async (teamId, name, description, logoUrl) => {
        try {
          await updateTeamDetails(teamId, name, description, logoUrl)
          await get().load()
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      changeRole: async (teamId, userId, role) => {
        try {
          await changeTeamMemberRole(teamId, userId, role)
          await get().refreshTeam(teamId)
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      transferCaptain: async (teamId, userId) => {
        try {
          await transferTeamCaptain(teamId, userId)
          await get().load()
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      removeMember: async (teamId, userId) => {
        try {
          await removeTeamMember(teamId, userId)
          await get().refreshTeam(teamId)
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      leave: async (teamId) => {
        try {
          await leaveTeam(teamId)
          const user = useAuth.getState().user
          if (user) await clearTeamOutbox(teamId, user.id)
          await get().load()
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      revokeInvitation: async (invitationId) => {
        try {
          await revokeTeamInvitation(invitationId)
          const teamId = get().selectedTeamId
          if (teamId) await get().refreshTeam(teamId)
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      deleteTeam: async (teamId) => {
        try {
          await deleteTeamRequest(teamId)
          const user = useAuth.getState().user
          if (user) await clearTeamOutbox(teamId, user.id)
          await get().load()
        } catch (error) {
          set({ error: errorText(error) })
          throw error
        }
      },

      sync: async () => {
        const user = useAuth.getState().user
        if (!user) return
        let teams = get().teams
        try {
          const latestTeams = await getMyTeams()
          const activeTeamIds = new Set(latestTeams.map((team) => team.id))
          const removedTeams = teams.filter((team) => !activeTeamIds.has(team.id))
          await Promise.all(removedTeams.map((team) => clearTeamOutbox(team.id, user.id)))
          set((state) => ({
            teams: latestTeams,
            selectedTeamId: activeTeamIds.has(state.selectedTeamId ?? '')
              ? state.selectedTeamId
              : latestTeams[0]?.id ?? null,
            membersByTeam: Object.fromEntries(Object.entries(state.membersByTeam).filter(([id]) => activeTeamIds.has(id))),
            recommendationsByTeam: Object.fromEntries(Object.entries(state.recommendationsByTeam).filter(([id]) => activeTeamIds.has(id))),
            outgoingInvitationsByTeam: Object.fromEntries(Object.entries(state.outgoingInvitationsByTeam).filter(([id]) => activeTeamIds.has(id))),
            cellsByTeam: Object.fromEntries(Object.entries(state.cellsByTeam).filter(([id]) => activeTeamIds.has(id))),
            presenceByTeam: Object.fromEntries(Object.entries(state.presenceByTeam).filter(([id]) => activeTeamIds.has(id))),
            auditByTeam: Object.fromEntries(Object.entries(state.auditByTeam).filter(([id]) => activeTeamIds.has(id))),
            auditHasMoreByTeam: Object.fromEntries(Object.entries(state.auditHasMoreByTeam).filter(([id]) => activeTeamIds.has(id))),
            auditLoadingByTeam: Object.fromEntries(Object.entries(state.auditLoadingByTeam).filter(([id]) => activeTeamIds.has(id))),
          }))
          teams = latestTeams
        } catch {
          // Keep the last synchronized team view when the account endpoint is offline.
        }
        if (!teams.length) {
          set({ pendingCellCount: await pendingCount(user.id) })
          return
        }
        set({ syncStatus: 'syncing', error: null })
        let failed = false
        for (const team of teams) {
          try {
            await queueTeamCells(team.id, user.id)
            const queued = await db.teamOutbox
              .where('teamId')
              .equals(team.id)
              .and((row) => row.userId === user.id)
              .toArray()
            await addTeamCells(team.id, user.id, queued.map((row) => row.h3))
            if (queued.length) await db.teamOutbox.bulkDelete(queued.map((row) => row.id))
            const cells = await getTeamCells(team.id)
            set((state) => ({ cellsByTeam: { ...state.cellsByTeam, [team.id]: cells } }))
          } catch (error) {
            if (isMembershipRevoked(error)) {
              await clearTeamOutbox(team.id, user.id)
              set((state) => ({
                teams: state.teams.filter((candidate) => candidate.id !== team.id),
                selectedTeamId: state.selectedTeamId === team.id
                  ? state.teams.find((candidate) => candidate.id !== team.id)?.id ?? null
                  : state.selectedTeamId,
                membersByTeam: Object.fromEntries(Object.entries(state.membersByTeam).filter(([id]) => id !== team.id)),
                recommendationsByTeam: Object.fromEntries(Object.entries(state.recommendationsByTeam).filter(([id]) => id !== team.id)),
                outgoingInvitationsByTeam: Object.fromEntries(Object.entries(state.outgoingInvitationsByTeam).filter(([id]) => id !== team.id)),
                cellsByTeam: Object.fromEntries(Object.entries(state.cellsByTeam).filter(([id]) => id !== team.id)),
                presenceByTeam: Object.fromEntries(Object.entries(state.presenceByTeam).filter(([id]) => id !== team.id)),
                auditByTeam: Object.fromEntries(Object.entries(state.auditByTeam).filter(([id]) => id !== team.id)),
                auditHasMoreByTeam: Object.fromEntries(Object.entries(state.auditHasMoreByTeam).filter(([id]) => id !== team.id)),
                auditLoadingByTeam: Object.fromEntries(Object.entries(state.auditLoadingByTeam).filter(([id]) => id !== team.id)),
                error: 'Your access to this team has ended.',
              }))
              continue
            }
            failed = true
            set({ error: errorText(error) })
          }
        }
        set({
          syncStatus: failed ? 'error' : 'synced',
          lastSyncedAt: failed ? get().lastSyncedAt : Date.now(),
          pendingCellCount: await pendingCount(user.id),
        })
      },

      sendPresence: async (teamId, latitude, longitude) => {
        const user = useAuth.getState().user
        if (!user) return
        await upsertLivePresence(teamId, latitude, longitude)
      },

      stopPresence: async (teamId) => {
        const user = useAuth.getState().user
        if (!user) return
        await removeLivePresence(teamId)
        set((state) => ({
          presenceByTeam: {
            ...state.presenceByTeam,
            [teamId]: (state.presenceByTeam[teamId] ?? []).filter((presence) => presence.userId !== user.id),
          },
        }))
      },

      clear: () => set({
        teams: [],
        invitations: [],
        selectedTeamId: null,
        membersByTeam: {},
        recommendationsByTeam: {},
        outgoingInvitationsByTeam: {},
        cellsByTeam: {},
        presenceByTeam: {},
        auditByTeam: {},
        auditHasMoreByTeam: {},
        auditLoadingByTeam: {},
        loading: false,
        error: null,
        syncStatus: 'idle',
        pendingCellCount: 0,
      }),
    }),
    {
      name: 'veloterra-teams',
      partialize: (state) => ({ selectedTeamId: state.selectedTeamId }),
    },
  ),
)