import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, getStripeWebhookSecret } from '@/server/stripe'
import { getDb } from '@/server/db'
import { subscriptions, webhookEvents } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { reportError } from '@/server/report-error'

// 署名検証には生のbodyが必要
export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, getStripeWebhookSecret())
  } catch (err) {
    console.error('[webhook/stripe] 署名検証失敗:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const db = getDb()

  // atomic claim: PKへのinsert成功=このプロセスが処理権を獲得（重複配信は失敗する）
  const claimId = `stripe:${event.id}`
  try {
    await db.insert(webhookEvents).values({ id: claimId, source: 'stripe' })
  } catch {
    // 既に処理済み（重複配信）→ ACK 200
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    await handleEvent(db, event)
  } catch (err) {
    // 一時的失敗はclaimを解放してStripeにリトライさせる
    reportError(err, { scope: 'webhook/stripe', eventType: event.type, eventId: event.id })
    await db.delete(webhookEvents).where(eq(webhookEvents.id, claimId)).catch(() => {})
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// StripeのstatusをDBのenumへ写す（DBに無い値は安全側=利用不可方向へ倒す）
function mapStripeStatus(status: Stripe.Subscription.Status): typeof subscriptions.$inferInsert.status {
  switch (status) {
    case 'incomplete_expired':
      return 'canceled'
    case 'paused':
      return 'past_due'
    default:
      return status
  }
}

// Stripeイベントは順序保証がない。解約後に古いinvoice.paidや
// customer.subscription.updatedが遅延到着すると、イベントペイロードの状態で
// DBだけがactiveへ巻き戻る。イベント種別から状態を推測せず、常にStripeの
// 最新Subscriptionをretrieveして収束させる（解約済みsubはstatus='canceled'が返る）。
async function syncSubscriptionFromStripe(db: ReturnType<typeof getDb>, subId: string) {
  const stripe = getStripe()
  const latest = await stripe.subscriptions.retrieve(subId)
  await db
    .update(subscriptions)
    .set({
      status: mapStripeStatus(latest.status),
      currentPeriodEnd: subscriptionPeriodEnd(latest),
      cancelAtPeriodEnd: latest.cancel_at_period_end ?? false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subId))
}

async function handleEvent(db: ReturnType<typeof getDb>, event: Stripe.Event) {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await syncSubscriptionFromStripe(db, sub.id)
      break
    }
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required': {
      const invoice = event.data.object as Stripe.Invoice
      const subId = invoiceSubscriptionId(invoice)
      if (subId) {
        await syncSubscriptionFromStripe(db, subId)
      }
      break
    }
    default:
      // 未対応イベントはACKのみ
      break
  }
}

// APIバージョン差異に強い形でperiod endを取り出す
function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const s = sub as unknown as { current_period_end?: number; items?: { data?: Array<{ current_period_end?: number }> } }
  const ts = s.current_period_end ?? s.items?.data?.[0]?.current_period_end
  return typeof ts === 'number' ? new Date(ts * 1000) : null
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as unknown as {
    subscription?: string | { id: string } | null
    parent?: { subscription_details?: { subscription?: string | { id: string } } }
  }
  const raw = inv.subscription ?? inv.parent?.subscription_details?.subscription
  if (!raw) return null
  return typeof raw === 'string' ? raw : raw.id
}
