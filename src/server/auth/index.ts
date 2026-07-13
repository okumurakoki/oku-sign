import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getDb } from '@/server/db'
import { users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        },
      },
    },
  )
}

export async function getCurrentUser() {
  // Dev bypass
  if (process.env.DEV_BYPASS_AUTH === '1') {
    const db = getDb()
    const devEmail = 'dev@oku-sign.local'
    const existing = await db.select().from(users).where(eq(users.email, devEmail)).limit(1)
    if (existing.length > 0) return existing[0]
    const newUser = {
      id: ulid(),
      supabaseUid: 'dev-uid',
      email: devEmail,
      name: 'Dev User',
      companyName: 'oku-sign Dev',
      role: 'admin' as const,
      isOwner: true, // 開発ユーザーは課金不要
      createdAt: new Date(),
    }
    await db.insert(users).values(newUser).onConflictDoNothing()
    return newUser
  }

  const supabase = await createSupabaseServer()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null

  const db = getDb()
  const existing = await db.select().from(users).where(eq(users.supabaseUid, authUser.id)).limit(1)
  if (existing.length > 0) return existing[0]

  // Auto-create user on first login
  const newUser = {
    id: ulid(),
    supabaseUid: authUser.id,
    email: authUser.email!,
    name: authUser.user_metadata?.name ?? authUser.email!.split('@')[0],
    companyName: authUser.user_metadata?.company_name ?? null,
    role: 'admin' as const,
    isOwner: false,
    createdAt: new Date(),
  }
  await db.insert(users).values(newUser)
  return newUser
}
