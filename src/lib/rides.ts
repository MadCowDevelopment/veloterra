import { db, type RideRow } from '../data/db'

export async function addRide(data: Omit<RideRow, 'id'>): Promise<string> {
  const id = crypto.randomUUID()
  await db.rides.put({ id, ...data })
  return id
}

export function listRides(): Promise<RideRow[]> {
  return db.rides.orderBy('startedAt').reverse().toArray()
}

export function getRide(id: string): Promise<RideRow | undefined> {
  return db.rides.get(id)
}

export function clearRides(): Promise<void> {
  return db.rides.clear()
}
