// DSN未設定なら Sentry は無効（開発・未設定環境で無害）
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? ''
export const SENTRY_ENABLED = SENTRY_DSN.length > 0
