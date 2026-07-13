import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(), // ULID
  supabaseUid: text('supabase_uid').unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  companyName: text('company_name'),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  isOwner: boolean('is_owner').notNull().default(false), // oku自社=課金不要（サブスクゲート除外）
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
