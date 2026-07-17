import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { contracts } from './contracts'

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(), // ULID
  contractId: text('contract_id').references(() => contracts.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  actorEmail: text('actor_email').notNull(),
  detail: text('detail'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
