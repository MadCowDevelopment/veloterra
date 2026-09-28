import { db, dbReady, scopeForUser, type RideRow } from '../data/db'
import { useAuth } from '../state/auth'

function currentScope(): string {
  return scopeForUser(useAuth.getState().user?.id)
}

export async function addRide(data: Omit<RideRow, 'id' | 'scope'>, scope = currentScope()): Promise<string> {
  await dbReady
  const id = crypto.randomUUID()
  await db.scopedRides.put({ id, scope, ...data })
  return id
}

export async function listRides(): Promise<RideRow[]> {
  await dbReady
  const rides = await db.scopedRides.where('scope').equals(currentScope()).toArray()
  return rides.sort((left, right) => right.startedAt - left.startedAt)
}

export async function getRide(id: string): Promise<RideRow | undefined> {
  await dbReady
  return db.scopedRides.get([currentScope(), id])
}

export async function clearRides(): Promise<void> {
  await dbReady
  await db.scopedRides.where('scope').equals(currentScope()).delete()
}
