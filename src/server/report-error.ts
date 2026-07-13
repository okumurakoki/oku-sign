import * as Sentry from '@sentry/nextjs'
import { SENTRY_ENABLED } from '@/lib/sentry-env'

// 想定外のサーバーエラーを集約報告。DSN未設定時はconsole.errorのみ。
// 期待されるドメインエラー(TRPCError等の想定内)はここに渡さない方針。
export function reportError(err: unknown, context?: Record<string, unknown>) {
  console.error('[error]', context ?? '', err)
  if (SENTRY_ENABLED) {
    Sentry.captureException(err, context ? { extra: context } : undefined)
  }
}
