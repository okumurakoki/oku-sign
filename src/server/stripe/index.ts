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
  // sk_（フル）と rk_（restricted key）の両方を許可。モード取り違え（test/live）は弾く。
  const allowed = mode === 'live' ? ['sk_live_', 'rk_live_'] : ['sk_test_', 'rk_test_']
  if (!allowed.some((p) => key.startsWith(p))) {
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

// パートナープラン（月額・年額）。金額はここ1箇所で管理する。
export const PARTNER_PLANS = {
  monthly: {
    key: 'monthly' as const,
    label: '月額プラン',
    amount: 2980,        // JPY / 月（税込想定）
    currency: 'jpy',
    interval: 'month' as const,
  },
  yearly: {
    key: 'yearly' as const,
    label: '年額プラン',
    amount: 25000,       // JPY / 年（月額換算 約2,083円・約30%お得）
    currency: 'jpy',
    interval: 'year' as const,
  },
} as const

export type PlanKey = keyof typeof PARTNER_PLANS

// 商品名（Product）は共通。価格(price_data)で月額/年額を切り替える。
export const PARTNER_PRODUCT_NAME = 'okuサイン パートナープラン'

// price_data には Product ID が必要（API 2026-06-24 で inline product_data 廃止）。
// Price ID は依然不要。Product を冪等に確保して ID を返す（プロセス内キャッシュ）。
let _productId: string | null = null
export async function ensurePartnerProductId(): Promise<string> {
  if (_productId) return _productId
  const stripe = getStripe()
  const product = await stripe.products.create(
    { name: PARTNER_PRODUCT_NAME, metadata: { plan: 'oku-sign-partner-v1' } },
    { idempotencyKey: 'product-oku-sign-partner-v1' },
  )
  _productId = product.id
  return _productId
}
