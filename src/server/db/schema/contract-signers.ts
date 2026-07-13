import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { contracts } from './contracts'

export const contractSigners = pgTable('contract_signers', {
  id: text('id').primaryKey(),
  contractId: text('contract_id').notNull().references(() => contracts.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['sender', 'signer'] }).notNull().default('signer'),
  signOrder: integer('sign_order').notNull().default(1),
  status: text('status', {
    enum: ['pending', 'viewed', 'signed', 'declined'],
  }).notNull().default('pending'),
  token: text('token').unique(),
  accessCode: text('access_code'),
  declineReason: text('decline_reason'),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
})
