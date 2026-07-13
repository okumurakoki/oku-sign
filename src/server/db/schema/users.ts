import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(), // ULID
  supabaseUid: text('supabase_uid').unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  companyName: text('company_name'),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
