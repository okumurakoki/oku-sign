# okuサイン

電子契約サービス（クラウドサイン型）。PDFに署名欄を配置し、順序つきで署名者に送信、締結済みPDFを監査証跡つきで保管する。okuパートナープログラムの特典として月額課金（Stripe Elements）。

## 技術スタック

- **Framework**: Next.js 16 (App Router, Turbopack)
- **API**: tRPC v11
- **DB**: Supabase Postgres + Drizzle ORM（postgres-js）
- **認証**: Supabase Auth
- **課金**: Stripe（Elements・月額2,980円）
- **Storage**: Supabase Storage（private + 署名付きURL）
- **メール**: Resend
- **PDF**: pdf-lib（座標配置・署名証明ページ）+ react-pdf（表示）
- **監視**: Sentry（任意・DSN未設定なら無効）
- **テスト**: Vitest

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # 値を設定
npm run db:push                    # スキーマをDBへ反映
npm run dev                        # http://localhost:7583
```

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（port 7583） |
| `npm run build` | 本番ビルド |
| `npm test` | ユニットテスト（Vitest） |
| `npm run lint` | ESLint |
| `npm run db:generate` | マイグレーション生成 |
| `npm run db:push` | スキーマをDBへ反映 |

## 環境変数

`.env.local.example` を参照。本番で必要なもの:

| 変数 | 用途 |
|---|---|
| `DATABASE_URL` | Supabase Postgres（本番は **6543 transaction mode + `prepare:false`** 推奨） |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase Auth / Storage |
| `NEXT_PUBLIC_APP_URL` | メール内リンク・署名URLのベース（例: `https://sign.oku-ai.co.jp`） |
| `RESEND_API_KEY` / `EMAIL_FROM` | メール送信 |
| `CRON_SECRET` | cron認証（`Authorization: Bearer`） |
| `STRIPE_MODE` / `NEXT_PUBLIC_STRIPE_MODE` | `test` or `live` |
| `STRIPE_SECRET_KEY_{TEST,LIVE}` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_{TEST,LIVE}` / `STRIPE_WEBHOOK_SECRET_{TEST,LIVE}` | Stripe |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | エラー監視（任意） |
| `DEV_BYPASS_AUTH` | 開発のみ。**本番は `0`**（production では自動的に無効化される） |

> `NEXT_PUBLIC_*` はビルド時に埋め込まれるため、変更後は再ビルドが必要。

## 本番デプロイのチェックリスト（Vercel想定）

1. **Supabase**: 本番プロジェクトで `npm run db:push`。Storage に **private** バケット `documents` を作成。
2. **環境変数**: 上表を Vercel に設定（`STRIPE_MODE=live`、`DEV_BYPASS_AUTH=0`）。
3. **Stripe**: Dashboard に Webhook エンドポイント `https://<domain>/api/webhook/stripe` を登録し、署名シークレットを `STRIPE_WEBHOOK_SECRET_LIVE` に設定。
4. **Supabase Auth**: Redirect URL に `https://<domain>/auth/callback` を登録。
5. **Cron**: `vercel.json` に定義済み。Vercel Cron が `CRON_SECRET` を送る設定にする。
6. **法務**: `/legal`（特定商取引法）の【要記入】項目を実際の会社情報に差し替え。利用規約は公開前に専門家レビューを推奨。

## ディレクトリ

```
src/
  app/
    (auth)/            ログイン・サインアップ
    (dashboard)/       ダッシュボード・契約・テンプレ・連絡先・設定
    sign/[token]/      署名者用ページ（認証不要・トークン）
    api/
      sign/            署名実行
      upload/          PDFアップロード（サーバー派生パス）
      webhook/stripe/  Stripe Webhook（atomic claim）
      cron/            期限切れ・リマインダー
  server/
    trpc/routers/      contracts / templates / contacts / signatureFields / billing / audit / dashboard / auth
    db/schema/         Drizzle スキーマ
    stripe/ storage/ email/ pdf/   各サービス
  lib/
    signing-rules.ts   署名判定の純関数（テスト対象）
```
