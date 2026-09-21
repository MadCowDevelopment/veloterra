import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'
import { useWallet } from './wallet'
import type { Landmark, LandmarkBounds, LandmarkCategory } from '../domain/landmarks'

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
  discovering: boolean
  error: string | null
  loadBounds: (bounds: LandmarkBounds, discover?: boolean) => Promise<boolean>
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
    restoredAt: row.restored_at,
  }
}

async function syncProfile() {
  const user = useAuth.getState().user
  if (!user) return
  if (syncedProfileUserId === user.id) return
  const displayName = user.user_metadata.full_name ?? user.user_metadata.name ?? user.email ?? 'VeloTerra rider'
  const avatarUrl = user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null
  const { error } = await supabase.from('profiles').upsert({
    user_id: user.id,
    display_name: String(displayName).slice(0, 80),
    avatar_url: avatarUrl,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  syncedProfileUserId = user.id
}

let syncedProfileUserId: string | null = null

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
  discovering: false,
  error: null,

  loadBounds: async (bounds, discover = false) => {
    if (!useAuth.getState().user) {
      set({ landmarks: [], loading: false, error: null })
      return false
    }

    set({ loading: true, error: null })
    try {
      if (discover) {
        set({ discovering: true })
        const { error } = await supabase.functions.invoke('discover-landmarks', { body: bounds })
        if (error) throw error
      }

      const { data, error } = await supabase
        .from('landmarks')
        .select('id,name,category,tier,scope_multiplier,cost_copper,total_contributed,latitude,longitude,wikidata,wikipedia,restored_at')
        .gte('longitude', bounds.west)
        .lte('longitude', bounds.east)
        .gte('latitude', bounds.south)
        .lte('latitude', bounds.north)
        .order('tier', { ascending: false })
        .limit(500)
      if (error) throw error
      set({ landmarks: (data as LandmarkRow[]).map(fromRow) })
      return true
    } catch (error) {
      set({ error: await errorMessage(error) })
      return false
    } finally {
      set({ loading: false, discovering: false })
    }
  },

  contribute: async (landmarkId, amount, idempotencyKey = crypto.randomUUID()) => {
    const user = useAuth.getState().user
    if (!user) throw new Error('Sign in to contribute')
    const copper = Math.floor(amount)
    if (!Number.isSafeInteger(copper) || copper <= 0) throw new Error('Enter a positive coin amount')

    await syncProfile()
    const { data, error } = await supabase.rpc('contribute_to_landmark', {
      p_landmark_id: landmarkId,
      p_requested_amount: copper,
      p_idempotency_key: idempotencyKey,
    })
    if (error) throw error
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'landmarks' }, (payload) => {
        const updated = payload.new as LandmarkRow
        set((state) => ({
          landmarks: state.landmarks.map((landmark) => landmark.id === updated.id ? fromRow(updated) : landmark),
        }))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  },
}))
