import { protectedProcedure, router } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { subscriptions } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { z } from 'zod/v4'
import { getStripe, ensurePartnerProductId, PARTNER_PLANS } from '@/server/stripe'
import type Stripe from 'stripe'
import { reportError } from '@/server/report-error'
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
      currentPlan: sub?.plan ?? null,
      plans: {
        monthly: { amount: PARTNER_PLANS.monthly.amount, label: PARTNER_PLANS.monthly.label },
        yearly: { amount: PARTNER_PLANS.yearly.amount, label: PARTNER_PLANS.yearly.label },
      },
    }
  }),

  // サブスクを開始（Elements: price_data直接・Price ID不要）。client_secretを返す。
  createSubscription: protectedProcedure
    .input(z.object({ plan: z.enum(['monthly', 'yearly']).default('monthly') }))
    .mutation(async ({ ctx, input }) => {
    if (ctx.user.isOwner) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'オーナーは課金不要です' })
    }

    const selectedPlan = PARTNER_PLANS[input.plan]
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

    // 既存の未完了サブスクをStripeから取得して再利用する。再試行のたびに
    // 新しいSubscriptionを作ると、古いincomplete subが宙に浮き、複数タブで
    // それぞれ確定されると二重課金になる（DBは最後の1本しか追跡しない）。
    let subscription: Stripe.Subscription | null = null
    if (existing?.stripeSubscriptionId) {
      try {
        const prior = await stripe.subscriptions.retrieve(existing.stripeSubscriptionId, {
          expand: ['latest_invoice.confirmation_secret'],
        })
        if (ACTIVE_STATUSES.includes(prior.status)) {
          // webhook遅延でDBが未同期のケース。二重作成せずDBを収束させて終了
          await ctx.db
            .update(subscriptions)
            .set({ status: prior.status as typeof subscriptions.$inferInsert.status, updatedAt: new Date() })
            .where(eq(subscriptions.userId, ctx.user.id))
          throw new TRPCError({ code: 'BAD_REQUEST', message: '既に有効なサブスクリプションがあります' })
        }
        if (prior.status === 'past_due' || prior.status === 'unpaid') {
          // 未払い中に新規subを重ねると二重課金になる。既存の支払いを直してもらう
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'お支払いに問題があります。カード情報を更新してください' })
        }
        if (prior.status === 'incomplete') {
          const priorInterval = prior.items.data[0]?.price.recurring?.interval
          if (priorInterval === selectedPlan.interval) {
            subscription = prior // 同プランの未完了があればそのまま再利用
          } else {
            // プラン変更の再試行: 古い未完了subを回収してから新規作成
            await stripe.subscriptions.cancel(prior.id)
          }
        }
        // incomplete_expired / canceled は回収済み扱いでそのまま新規作成へ
      } catch (err) {
        if (err instanceof TRPCError) throw err
        // retrieve失敗（削除済み等）は新規作成にフォールバック
        reportError(err, { scope: 'billing:retrievePriorSubscription', userId: ctx.user.id })
      }
    }

    if (!subscription) {
      subscription = await stripe.subscriptions.create(
        {
          customer: customerId,
          items: [{
            price_data: {
              currency: selectedPlan.currency,
              product: productId,
              unit_amount: selectedPlan.amount,
              recurring: { interval: selectedPlan.interval },
            },
          }],
          payment_behavior: 'default_incomplete',
          payment_settings: { save_default_payment_method: 'on_subscription' },
          expand: ['latest_invoice.confirmation_secret'],
          metadata: { userId: ctx.user.id },
        },
        { idempotencyKey: `subscription-create-${ctx.user.id}-${input.plan}-${existing?.stripeSubscriptionId ?? 'new'}` },
      )
    }

    // DBに反映（upsert）
    const now = new Date()
    if (existing) {
      await ctx.db
        .update(subscriptions)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status as typeof subscriptions.$inferInsert.status,
          plan: input.plan,
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
        plan: input.plan,
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
