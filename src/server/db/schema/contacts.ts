import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const contacts = pgTable('contacts', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  companyName: text('company_name'),
  department: text('department'),
  memo: text('memo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
