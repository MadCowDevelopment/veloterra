import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from '../domain/teams'

interface ProfileRow {
  user_id: string
  username: string | null
  username_normalized: string | null
  username_claimed_at: string | null
  display_name: string
  avatar_url: string | null
}

function fromRow(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    username: row.username,
    usernameNormalized: row.username_normalized,
    usernameClaimedAt: row.username_claimed_at,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }
}

export function suggestedDisplayName(user: User): string {
  const metadata = user.user_metadata
  return String(metadata.full_name ?? metadata.name ?? user.email ?? 'VeloTerra rider').slice(0, 80)
}

export async function loadMyProfile(user: User): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,username,username_normalized,username_claimed_at,display_name,avatar_url')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (data) return fromRow(data as ProfileRow)
  return saveMyProfile(suggestedDisplayName(user), user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null)
}

export async function saveMyProfile(displayName: string, avatarUrl: string | null): Promise<Profile> {
  const { data, error } = await supabase.rpc('save_my_profile', {
    p_display_name: displayName,
    p_avatar_url: avatarUrl,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Profile was not returned by the server')
  return fromRow(row as ProfileRow)
}

export async function claimUsername(username: string): Promise<Profile> {
  const { data, error } = await supabase.rpc('claim_username', { p_username: username })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Profile was not returned by the server')
  return fromRow(row as ProfileRow)
}

export interface UsernameMatch {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export async function lookupUsername(username: string): Promise<UsernameMatch | null> {
  const { data, error } = await supabase.rpc('lookup_username', { p_username: username })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }
}