import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { contracts } from './contracts'
import { contractSigners } from './contract-signers'

export const signatures = pgTable('signatures', {
  id: text('id').primaryKey(), // ULID
  contractId: text('contract_id').notNull().references(() => contracts.id),
  signerId: text('signer_id').notNull().references(() => contractSigners.id),
  imageUrl: text('image_url').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
})
