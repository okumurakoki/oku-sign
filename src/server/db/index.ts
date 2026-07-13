import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function createDb() {
  const client = postgres(process.env.DATABASE_URL!)
  return drizzle(client, { schema })
}

let _db: ReturnType<typeof createDb> | null = null

export function getDb() {
  if (!_db) _db = createDb()
  return _db
}
