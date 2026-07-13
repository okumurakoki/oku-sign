import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function createDb() {
  // Supabase transaction pooler(6543)で必須: prepare:false（prepared statement非対応）。
  // serverless での接続枯渇を避けるため接続数も抑える。
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 3, idle_timeout: 20 })
  return drizzle(client, { schema })
}

let _db: ReturnType<typeof createDb> | null = null

export function getDb() {
  if (!_db) _db = createDb()
  return _db
}
