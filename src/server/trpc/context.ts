import { getCurrentUser } from '@/server/auth'
import { getDb } from '@/server/db'

export async function createContext() {
  const user = await getCurrentUser()
  const db = getDb()
  return { user, db }
}

export type Context = Awaited<ReturnType<typeof createContext>>
