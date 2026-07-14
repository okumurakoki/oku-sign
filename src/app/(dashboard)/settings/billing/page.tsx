'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Elements } from '@stripe/react-stripe-js'
import { trpc } from '@/lib/trpc'
import { getStripeJs, getStripeMode, isStripeConfigured } from '@/lib/stripe-client'
import { Button } from '@/components/ui/button'
import { CheckoutForm } from './checkout-form'
import { Check } from 'lucide-react'

const stripePromise = getStripeJs()

export default function BillingPage() {
  const stripeConfigured = isStripeConfigured()
  const utils = trpc.useUtils()
  const sub = trpc.billing.getSubscription.useQuery()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly')

  const createSub = trpc.billing.createSubscription.useMutation({
    onSuccess: (data) => setClientSecret(data.clientSecret),
  })
  const cancelSub = trpc.billing.cancelSubscription.useMutation({
    onSuccess: () => utils.billing.getSubscription.invalidate(),
  })
  const resumeSub = trpc.billing.resumeSubscription.useMutation({
    onSuccess: () => utils.billing.getSubscription.invalidate(),
  })

  const handlePaid = () => {
    setClientSecret(null)
    // webhook反映まで少し待ってから再取得
    setTimeout(() => utils.billing.getSubscription.invalidate(), 1500)
  }

  if (sub.isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">読み込み中...</div>
  }
  const s = sub.data

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground">← 設定に戻る</Link>
        <h1 className="mt-1 text-lg font-bold tracking-tight">プラン・お支払い</h1>
      </div>

      {getStripeMode() !== 'live' && (
        <div className="rounded-md bg-[var(--wait-bg)] px-4 py-2">
          <p className="text-xs font-medium text-[var(--wait)]">テストモード（実際の請求は発生しません）</p>
        </div>
      )}

      {/* オーナー（自社利用・無料） */}
      {s?.isOwner ? (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2">
            <Check className="text-[var(--ok)]" size={18} />
            <p className="text-sm font-medium">自社利用プラン（無料）</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">オーナーアカウントは課金なしで全機能を利用できます。</p>
        </div>
      ) : s?.active ? (
        /* 契約中 */
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Check className="text-[var(--ok)]" size={18} />
                <p className="text-sm font-medium">okuサイン パートナープラン</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {s.currentPlan === 'yearly'
                  ? `年額 ¥${s.plans.yearly.amount.toLocaleString()}`
                  : `月額 ¥${s.plans.monthly.amount.toLocaleString()}`}
              </p>
            </div>
            <span className="rounded-[5px] bg-[var(--ok-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--ok)]">
              利用中
            </span>
          </div>

          {s.currentPeriodEnd && (
            <p className="text-sm text-muted-foreground">
              {s.cancelAtPeriodEnd
                ? `${new Date(s.currentPeriodEnd).toLocaleDateString('ja-JP')} に解約予定`
                : `次回更新日: ${new Date(s.currentPeriodEnd).toLocaleDateString('ja-JP')}`}
            </p>
          )}

          {s.cancelAtPeriodEnd ? (
            <Button variant="outline" onClick={() => resumeSub.mutate()} disabled={resumeSub.isPending}>
              {resumeSub.isPending ? '処理中...' : '解約を取り消す（継続する）'}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => cancelSub.mutate()}
              disabled={cancelSub.isPending}
            >
              {cancelSub.isPending ? '処理中...' : '解約する'}
            </Button>
          )}
        </div>
      ) : (
        /* 未加入 → 登録フロー */
        <div className="rounded-lg border bg-card p-6 space-y-5">
          <div>
            <p className="text-sm font-medium">okuサイン パートナープラン</p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><Check size={14} className="text-[var(--ok)]" /> 電子契約の送信無制限</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-[var(--ok)]" /> 署名欄の自由配置・テンプレート</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-[var(--ok)]" /> 監査証跡・署名済みPDF</li>
            </ul>
          </div>

          {/* プラン選択（月額／年額） */}
          {!clientSecret && (
            <div className="grid grid-cols-2 gap-3">
              {(['monthly', 'yearly'] as const).map((k) => {
                const p = s?.plans[k]
                const active = selectedPlan === k
                const monthlyEquiv = k === 'yearly' && p ? Math.round(p.amount / 12) : null
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedPlan(k)}
                    className={`rounded-lg border p-4 text-left transition-colors ${active ? 'border-[#2680EB] bg-[#2680EB]/[0.04] ring-1 ring-[#2680EB]' : 'hover:bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{k === 'yearly' ? '年額' : '月額'}</span>
                      {k === 'yearly' && (
                        <span className="rounded-[5px] bg-[var(--accent)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--brand-ink)]">2ヶ月分お得</span>
                      )}
                    </div>
                    <p className="tnum mt-1.5 text-xl font-bold">
                      ¥{(p?.amount ?? (k === 'yearly' ? 25000 : 2980)).toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground">{k === 'yearly' ? ' / 年' : ' / 月'}</span>
                    </p>
                    {monthlyEquiv && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">月あたり約¥{monthlyEquiv.toLocaleString()}</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {s?.status === 'past_due' && (
            <div className="rounded-md bg-[var(--alert-bg)] px-4 py-2">
              <p className="text-xs font-medium text-[var(--alert)]">お支払いに失敗しています。カード情報を更新してください。</p>
            </div>
          )}

          {!stripeConfigured ? (
            <div className="rounded-md bg-[var(--wait-bg)] px-4 py-3">
              <p className="text-xs font-medium text-[var(--wait)]">決済機能は準備中です。しばらくお待ちください。</p>
            </div>
          ) : !clientSecret ? (
            <>
              {createSub.error && <p className="text-sm text-red-600">{createSub.error.message}</p>}
              <Button className="w-full h-11" onClick={() => createSub.mutate({ plan: selectedPlan })} disabled={createSub.isPending}>
                {createSub.isPending ? '準備中...' : `${selectedPlan === 'yearly' ? '年額' : '月額'}プランで登録手続きへ`}
              </Button>
            </>
          ) : (
            <Elements stripe={stripePromise} options={{ clientSecret, locale: 'ja' }}>
              <CheckoutForm
                onSuccess={handlePaid}
                amount={selectedPlan === 'yearly' ? (s?.plans.yearly.amount ?? 25000) : (s?.plans.monthly.amount ?? 2980)}
                interval={selectedPlan}
              />
            </Elements>
          )}
        </div>
      )}
    </div>
  )
}
