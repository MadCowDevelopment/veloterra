import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { MIN_LANDMARK_CONTRIBUTION_COPPER } from '../domain/economy'
import { useWallet } from './wallet'
import type { Landmark, LandmarkBounds, LandmarkCategory } from '../domain/landmarks'
import { saveMyProfile, suggestedDisplayName } from '../lib/profile'

interface LandmarkRow {
  id: string
  name: string
  category: LandmarkCategory
  tier: 1 | 2 | 3 | 4
  scope_multiplier: 1 | 2 | 5 | 10
  cost_copper: number | string
  total_contributed: number | string
  latitude: number
  longitude: number
  wikidata: string | null
  wikipedia: string | null
  osm_tags: Record<string, string> | null
  restored_at: string | null
}

interface ContributionResult {
  applied_amount: number | string
  balance: number | string
  lifetime_earned: number | string
  spent: number | string
  total_contributed: number | string
  restored_at: string | null
}

export interface LandmarkContributor {
  userId: string
  displayName: string
  avatarUrl: string | null
  amount: number
}

interface LandmarkStore {
  landmarks: Landmark[]
  loading: boolean
  revision: number
  error: string | null
  clearError: () => void
  loadBounds: (bounds: LandmarkBounds) => Promise<boolean>
  discoverAround: (latitude: number, longitude: number) => Promise<boolean>
  contribute: (landmarkId: string, amount: number, idempotencyKey?: string) => Promise<number>
  loadContributors: (landmarkId: string) => Promise<LandmarkContributor[]>
  subscribe: () => () => void
}

function fromRow(row: LandmarkRow): Landmark {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    tier: row.tier,
    scopeMultiplier: row.scope_multiplier,
    costCopper: Number(row.cost_copper),
    totalContributed: Number(row.total_contributed),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    wikidata: row.wikidata,
    wikipedia: row.wikipedia,
    wikimediaCommons: row.osm_tags?.wikimedia_commons ?? null,
    restoredAt: row.restored_at,
  }
}

function mergeLandmarks(existing: Landmark[], incoming: Landmark[]): Landmark[] {
  const byId = new Map(existing.map((landmark) => [landmark.id, landmark]))
  for (const landmark of incoming) byId.set(landmark.id, landmark)
  return [...byId.values()]
}

async function syncProfile(user: NonNullable<ReturnType<typeof useAuth.getState>['user']>) {
  if (syncedProfileUserId === user.id) return
  const displayName = user.user_metadata.full_name ?? user.user_metadata.name ?? user.email ?? 'VeloTerra rider'
  const avatarUrl = user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null
  await saveMyProfile(String(displayName || suggestedDisplayName(user)).slice(0, 80), avatarUrl)
  syncedProfileUserId = user.id
}

let syncedProfileUserId: string | null = null
const discoveredRideAreas = new Map<string, Set<string>>()
const discoveringRideAreas = new Map<string, Set<string>>()
const discoveryBlockedUntil = new Map<string, number>()
let latestBoundsRequestId = 0
const DISCOVERY_AREA_STEP = 0.02

function nextUtcDay(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

function isDailyDiscoveryLimit(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'context' in error
    && error.context instanceof Response
    && error.context.status === 429,
  )
}

function requiredSafeInteger(value: number | string, field: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by server`)
  return parsed
}

async function errorMessage(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    const body = await error.context.clone().json().catch(() => null) as { error?: unknown } | null
    if (typeof body?.error === 'string') return body.error
  }
  return error instanceof Error ? error.message : 'Could not load landmarks'
}

export const useLandmarks = create<LandmarkStore>((set, get) => ({
  landmarks: [],
  loading: false,
  revision: 0,
  error: null,
  clearError: () => set({ error: null }),

  loadBounds: async (bounds) => {
    const requestId = ++latestBoundsRequestId
    const requestUser = useAuth.getState().user
    if (!requestUser) {
      set({ landmarks: [], loading: false, error: null })
      return false
    }

    const requestUserId = requestUser.id
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('landmarks')
        .select('id,name,category,tier,scope_multiplier,cost_copper,total_contributed,latitude,longitude,wikidata,wikipedia,osm_tags,restored_at')
        .gte('longitude', bounds.west)
        .lte('longitude', bounds.east)
        .gte('latitude', bounds.south)
        .lte('latitude', bounds.north)
        .order('tier', { ascending: false })
        .limit(500)
      if (error) throw error
      if (useAuth.getState().user?.id !== requestUserId) return false
      const loaded = (data as LandmarkRow[]).map(fromRow)
      set((state) => ({ landmarks: mergeLandmarks(state.landmarks, loaded) }))
      return true
    } catch (error) {
      if (useAuth.getState().user?.id !== requestUserId) return false
      set({ error: await errorMessage(error) })
      return false
    } finally {
      if (requestId === latestBoundsRequestId) set({ loading: false })
    }
  },

  discoverAround: async (latitude, longitude) => {
    const user = useAuth.getState().user
    if (!user) return false
    const userId = user.id
    const discovered = discoveredRideAreas.get(userId) ?? new Set<string>()
    const discovering = discoveringRideAreas.get(userId) ?? new Set<string>()
    discoveredRideAreas.set(userId, discovered)
    discoveringRideAreas.set(userId, discovering)
    if (Date.now() < (discoveryBlockedUntil.get(userId) ?? 0)) return false
    const area = `${Math.round(latitude / DISCOVERY_AREA_STEP)}:${Math.round(longitude / DISCOVERY_AREA_STEP)}`
    if (discovered.has(area) || discovering.has(area)) return true

    discovering.add(area)
    try {
      const areaLatitude = Math.round(latitude / DISCOVERY_AREA_STEP) * DISCOVERY_AREA_STEP
      const areaLongitude = Math.round(longitude / DISCOVERY_AREA_STEP) * DISCOVERY_AREA_STEP
      const bounds = {
        west: Math.max(-180, areaLongitude - 0.01),
        south: Math.max(-90, areaLatitude - 0.012),
        east: Math.min(180, areaLongitude + 0.01),
        north: Math.min(90, areaLatitude + 0.012),
      }
      const { data, error } = await supabase.functions.invoke('discover-landmarks', {
        body: bounds,
      })
      if (error) throw error
      if (useAuth.getState().user?.id !== userId) return false
      discovered.add(area)
      if (Number(data?.discovered) > 0) set((state) => ({ revision: state.revision + 1 }))
      await get().loadBounds(bounds)
      return true
    } catch (error) {
      if (isDailyDiscoveryLimit(error)) discoveryBlockedUntil.set(userId, nextUtcDay())
      set({ error: await errorMessage(error) })
      return false
    } finally {
      discovering.delete(area)
    }
  },

  contribute: async (landmarkId, amount, idempotencyKey = crypto.randomUUID()) => {
    const user = useAuth.getState().user
    if (!user) throw new Error('Sign in to contribute')
    const userId = user.id
    const copper = Math.floor(amount)
    if (!Number.isSafeInteger(copper) || copper < MIN_LANDMARK_CONTRIBUTION_COPPER) {
      throw new Error('The minimum contribution is 1 gold')
    }

    await syncProfile(user)
    const { data, error } = await supabase.rpc('contribute_to_landmark', {
      p_landmark_id: landmarkId,
      p_requested_amount: copper,
      p_idempotency_key: idempotencyKey,
    })
    if (error) throw error
    if (useAuth.getState().user?.id !== userId) throw new Error('The active account changed')
    if (!data || typeof data !== 'object') throw new Error('Invalid contribution response')

    const result = data as ContributionResult
    const lifetimeEarned = requiredSafeInteger(result.lifetime_earned, 'lifetime earnings')
    const spent = requiredSafeInteger(result.spent, 'spent amount')
    const totalContributed = requiredSafeInteger(result.total_contributed, 'restoration total')
    useWallet.getState().applyCloudBalance(lifetimeEarned, spent)
    if (get().landmarks.some((candidate) => candidate.id === landmarkId)) {
      set((state) => ({
        landmarks: state.landmarks.map((candidate) => candidate.id === landmarkId
          ? {
              ...candidate,
              totalContributed,
              restoredAt: result.restored_at,
            }
          : candidate),
      }))
    }
    return Number(result.balance)
  },

  loadContributors: async (landmarkId) => {
    const { data, error } = await supabase.rpc('get_landmark_contributors', {
      p_landmark_id: landmarkId,
    })
    if (error) throw error
    return (data as Array<{
      user_id: string
      display_name: string
      avatar_url: string | null
      amount: number | string
    }>).map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      amount: Number(row.amount),
    }))
  },

  subscribe: () => {
    const channel = supabase
      .channel('global-landmark-progress')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'landmarks' }, () => {
        set((state) => ({ revision: state.revision + 1 }))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'landmarks' }, (payload) => {
        const updated = payload.new as LandmarkRow
        set((state) => ({
          landmarks: state.landmarks.map((landmark) => landmark.id === updated.id ? fromRow(updated) : landmark),
          revision: state.revision + 1,
        }))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  },
}))
