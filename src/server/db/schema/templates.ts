import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  pdfUrl: text('pdf_url'),
  pdfName: text('pdf_name'),
  pdfSize: integer('pdf_size'),
  defaultMessage: text('default_message'),
  createdBy: text('created_by').notNull().references(() => users.id),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
