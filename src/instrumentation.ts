import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN, SENTRY_ENABLED } from '@/lib/sentry-env'

// サーバー/エッジのSentry初期化。DSN未設定なら何もしない。
export function register() {
  if (!SENTRY_ENABLED) return
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    })
  }
}

export const onRequestError = Sentry.captureRequestError
