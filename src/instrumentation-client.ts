import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN, SENTRY_ENABLED } from '@/lib/sentry-env'

// クライアント側Sentry初期化。DSN未設定なら何もしない。
if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
