import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core'
import { users } from './users'

// パートナープログラムのサブスク（1ユーザー1件）。okuサイン月額2,980円。
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(), // ULID
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  status: text('status', {
    enum: ['incomplete', 'active', 'trialing', 'past_due', 'canceled', 'unpaid'],
  }).notNull().default('incomplete'),
  plan: text('plan', { enum: ['monthly', 'yearly'] }).notNull().default('monthly'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('subscriptions_customer_idx').on(t.stripeCustomerId),
  index('subscriptions_sub_idx').on(t.stripeSubscriptionId),
])
