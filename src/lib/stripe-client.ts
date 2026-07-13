import { loadStripe, type Stripe } from '@stripe/stripe-js'

// publishable鍵も mode で切替（pkとclient_secretが同モードでないとElements初期化が無言で失敗する）。
// 未設定時は null を返す（ビルド/未設定環境でクラッシュさせない。UI側で「決済準備中」を表示）。
function getPublishableKey(): string | null {
  const mode = (process.env.NEXT_PUBLIC_STRIPE_MODE ?? 'test').toLowerCase() === 'live' ? 'live' : 'test'
  const key = mode === 'live'
    ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE
    : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST
  if (!key) return null
  const expected = mode === 'live' ? 'pk_live_' : 'pk_test_'
  if (!key.startsWith(expected)) {
    console.error(`publishable鍵とNEXT_PUBLIC_STRIPE_MODE(${mode})が不一致です`)
    return null
  }
  return key
}

export function isStripeConfigured(): boolean {
  return getPublishableKey() !== null
}

let _promise: Promise<Stripe | null> | null = null
export function getStripeJs(): Promise<Stripe | null> {
  const key = getPublishableKey()
  if (!key) return Promise.resolve(null)
  if (!_promise) _promise = loadStripe(key)
  return _promise
}

export function getStripeMode(): 'test' | 'live' {
  return (process.env.NEXT_PUBLIC_STRIPE_MODE ?? 'test').toLowerCase() === 'live' ? 'live' : 'test'
}
