import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

// 統合テスト（DB接続）用に .env.local を読み込む。
// .env.local は開発DB（autumn-pond）を指す前提。統合テストは全操作を
// トランザクション内で実行し必ずロールバックするため、どのDBでもコミットは残らない。
config({ path: '.env.local' })

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
