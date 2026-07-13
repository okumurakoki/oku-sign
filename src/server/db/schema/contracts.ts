import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core'
import { users } from './users'

export const contracts = pgTable('contracts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status', {
    enum: ['draft', 'sent', 'signing', 'completed', 'cancelled'],
  }).notNull().default('draft'),
  createdBy: text('created_by').notNull().references(() => users.id),
  pdfUrl: text('pdf_url'),
  pdfName: text('pdf_name'),
  pdfSize: integer('pdf_size'),
  message: text('message'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
