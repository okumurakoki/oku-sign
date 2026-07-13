import Stripe from 'stripe'

// STRIPE_MODE で test/live を一発切替（env値の変更だけでモード切替）。
// pk と sk は必ず同一モードで解決する（Elementsはpkとclient_secretが同モードでないと無言で壊れる）。
type Mode = 'test' | 'live'

function getMode(): Mode {
  const m = (process.env.STRIPE_MODE ?? 'test').toLowerCase()
  return m === 'live' ? 'live' : 'test'
}

export function getStripeSecretKey(): string {
  const mode = getMode()
  const key = mode === 'live' ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST
  if (!key) throw new Error(`STRIPE_SECRET_KEY_${mode.toUpperCase()} が未設定です`)
  const expectedPrefix = mode === 'live' ? 'sk_live_' : 'sk_test_'
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(`STRIPE_SECRET_KEY と STRIPE_MODE(${mode})が不一致です`)
  }
  return key
}

export function getStripeWebhookSecret(): string {
  const mode = getMode()
  const secret = mode === 'live' ? process.env.STRIPE_WEBHOOK_SECRET_LIVE : process.env.STRIPE_WEBHOOK_SECRET_TEST
  if (!secret) throw new Error(`STRIPE_WEBHOOK_SECRET_${mode.toUpperCase()} が未設定です`)
  return secret
}

let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(getStripeSecretKey())
  }
  return _stripe
}

export const PARTNER_PLAN = {
  name: 'okuサイン パートナープラン',
  amount: 2980, // JPY / 月（税込想定）
  currency: 'jpy',
  interval: 'month' as const,
}

// price_data には Product ID が必要（API 2026-06-24 で inline product_data 廃止）。
// Price ID は依然不要。Product を冪等に確保して ID を返す（プロセス内キャッシュ）。
let _productId: string | null = null
export async function ensurePartnerProductId(): Promise<string> {
  if (_productId) return _productId
  const stripe = getStripe()
  const product = await stripe.products.create(
    { name: PARTNER_PLAN.name, metadata: { plan: 'oku-sign-partner-v1' } },
    { idempotencyKey: 'product-oku-sign-partner-v1' },
  )
  _productId = product.id
  return _productId
}
