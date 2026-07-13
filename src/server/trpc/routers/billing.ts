import { protectedProcedure, router } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { subscriptions } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getStripe, ensurePartnerProductId, PARTNER_PLAN } from '@/server/stripe'
import type { Context } from '@/server/trpc/context'

const ACTIVE_STATUSES = ['active', 'trialing']

export const billingRouter = router({
  // 現在のサブスク状態を返す
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const [sub] = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1)

    return {
      isOwner: ctx.user.isOwner,
      // ownerは常に利用可（課金不要）
      active: ctx.user.isOwner || (sub ? ACTIVE_STATUSES.includes(sub.status) : false),
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      plan: { name: PARTNER_PLAN.name, amount: PARTNER_PLAN.amount },
    }
  }),

  // サブスクを開始（Elements: price_data直接・Price ID不要）。client_secretを返す。
  createSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.isOwner) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'オーナーは課金不要です' })
    }

    const stripe = getStripe()

    // 既存サブスクの確認
    const [existing] = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1)

    if (existing && ACTIVE_STATUSES.includes(existing.status)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '既に有効なサブスクリプションがあります' })
    }

    // Customer を確保（idempotencyKeyでユーザー単位に固定）
    let customerId = existing?.stripeCustomerId ?? null
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: ctx.user.email,
          name: ctx.user.name,
          metadata: { userId: ctx.user.id },
        },
        { idempotencyKey: `customer-${ctx.user.id}` },
      )
      customerId = customer.id
    }

    const productId = await ensurePartnerProductId()

    // 既存の未完了サブスクがあれば再利用、なければ作成
    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{
          price_data: {
            currency: PARTNER_PLAN.currency,
            product: productId,
            unit_amount: PARTNER_PLAN.amount,
            recurring: { interval: PARTNER_PLAN.interval },
          },
        }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.confirmation_secret'],
        metadata: { userId: ctx.user.id },
      },
      { idempotencyKey: `subscription-create-${ctx.user.id}-${existing?.id ?? 'new'}` },
    )

    // DBに反映（upsert）
    const now = new Date()
    if (existing) {
      await ctx.db
        .update(subscriptions)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status as typeof subscriptions.$inferInsert.status,
          updatedAt: now,
        })
        .where(eq(subscriptions.userId, ctx.user.id))
    } else {
      await ctx.db.insert(subscriptions).values({
        id: ulid(),
        userId: ctx.user.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status as typeof subscriptions.$inferInsert.status,
      })
    }

    // PaymentElement用のclient_secretを取り出す（API 2026-06-24: invoice.confirmation_secret）
    const invoice = subscription.latest_invoice
    const clientSecret =
      invoice && typeof invoice !== 'string' ? invoice.confirmation_secret?.client_secret ?? null : null

    if (!clientSecret) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '決済の初期化に失敗しました' })
    }

    return { clientSecret, subscriptionId: subscription.id }
  }),

  // 解約（期末で停止）
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const [sub] = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1)
    if (!sub?.stripeSubscriptionId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'サブスクリプションが見つかりません' })
    }

    const stripe = getStripe()
    await stripe.subscriptions.update(
      sub.stripeSubscriptionId,
      { cancel_at_period_end: true },
      { idempotencyKey: `subscription-cancel-${sub.stripeSubscriptionId}` },
    )

    await ctx.db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(subscriptions.userId, ctx.user.id))

    return { ok: true }
  }),

  // 解約の取り消し（継続）
  resumeSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const [sub] = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1)
    if (!sub?.stripeSubscriptionId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'サブスクリプションが見つかりません' })
    }

    const stripe = getStripe()
    await stripe.subscriptions.update(
      sub.stripeSubscriptionId,
      { cancel_at_period_end: false },
      { idempotencyKey: `subscription-resume-${sub.stripeSubscriptionId}` },
    )

    await ctx.db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: false, updatedAt: new Date() })
      .where(eq(subscriptions.userId, ctx.user.id))

    return { ok: true }
  }),
})

// 契約作成などのサブスクゲート判定に使う共通関数
export async function hasActiveSubscription(
  db: Context['db'],
  user: { id: string; isOwner: boolean },
): Promise<boolean> {
  if (user.isOwner) return true
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1)
  return sub ? ACTIVE_STATUSES.includes(sub.status) : false
}
