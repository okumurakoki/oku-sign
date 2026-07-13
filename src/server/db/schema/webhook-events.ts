import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Webhookの冪等処理用。primary key への insert 成功=claim獲得（atomic）。
// Redis無し環境のため、DBのユニーク制約でSET NX相当を実現する。
export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(), // `${source}:${eventId}`
  source: text('source').notNull(), // 'stripe' 等
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
